import OpenAI from "openai";
import { z } from "zod";
import { AIUnavailableError, RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AIProvider, AITool, AIUsage, BaseOptions, StreamEvent, StreamOptions, StructuredOptions } from "@/server/ai/provider/types";

/**
 * DeepSeek (api.deepseek.com) speaks the OpenAI chat-completions protocol, so
 * the official `openai` client works against it with a different base URL.
 *
 * Differences from the Anthropic path that shape this file:
 *  - No prompt caching to opt into: DeepSeek caches identical prefixes on its
 *    own and reports the hit count as `prompt_cache_hit_tokens`.
 *  - No `effort` control, so that option is accepted and ignored.
 *  - No strict JSON-schema output mode. `structured()` asks for `json_object`,
 *    hands the schema to the model as text, validates with Zod, and gets one
 *    repair attempt before giving up.
 */

const DEFAULT_BASE_URL = "https://api.deepseek.com";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

interface Completion {
  usage?: OpenAI.Completions.CompletionUsage | null;
  model?: string;
}

function toUsage(completion: Completion): AIUsage {
  const u = completion.usage;
  // prompt_tokens already includes the cached prefix; surfaced separately for the admin view.
  const cached = (u as { prompt_cache_hit_tokens?: number } | null | undefined)?.prompt_cache_hit_tokens ?? 0;
  return { inputTokens: u?.prompt_tokens ?? 0, outputTokens: u?.completion_tokens ?? 0, cacheReadTokens: cached };
}

function toChatMessages(system: string, messages: BaseOptions["messages"]): ChatMessage[] {
  return [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage)];
}

function toolToOpenAI(tool: AITool): OpenAI.Chat.Completions.ChatCompletionTool {
  const json = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
  delete json.$schema;
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: { ...json, type: "object" } },
  };
}

function mapError(err: unknown): never {
  if (err instanceof OpenAI.RateLimitError) {
    const retry = Number(err.headers?.get?.("retry-after") ?? 30);
    throw new RateLimitError(Number.isFinite(retry) ? retry : 30);
  }
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    logger.error("ai", "deepseek auth error", { message: err.message });
    throw new AIUnavailableError(err);
  }
  if (err instanceof OpenAI.APIError || err instanceof OpenAI.APIConnectionError) {
    logger.error("ai", "deepseek api error", { message: err.message });
    throw new AIUnavailableError(err);
  }
  throw err;
}

/** Models that bill a separate reasoning phase and reject tool definitions. */
function isReasoner(model: string) {
  return model.includes("reasoner");
}

export class DeepSeekProvider implements AIProvider {
  readonly name = "deepseek";
  readonly model: string;
  private client: OpenAI;

  constructor(options: { apiKey: string; model: string; baseUrl?: string }) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl?.trim() || DEFAULT_BASE_URL,
      maxRetries: 2,
      timeout: 120_000,
    });
    this.model = options.model;
  }

  async complete(options: BaseOptions) {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          max_tokens: options.maxTokens ?? 4096,
          messages: toChatMessages(options.system, options.messages),
        },
        { signal: options.signal },
      );
      const choice = response.choices[0];
      return { text: choice?.message.content ?? "", usage: toUsage(response), model: response.model };
    } catch (err) {
      return mapError(err);
    }
  }

  async structured<T>(options: StructuredOptions<T>) {
    const schemaJson = z.toJSONSchema(options.schema) as Record<string, unknown>;
    delete schemaJson.$schema;
    // DeepSeek's json_object mode only guarantees syntactic JSON, so the shape
    // is requested in words and enforced by Zod below.
    const system = [
      options.system,
      "",
      `Reply with a single JSON object named ${options.schemaName} and nothing else. No markdown fence, no commentary.`,
      "It must validate against this JSON Schema:",
      JSON.stringify(schemaJson),
    ].join("\n");

    const messages = toChatMessages(system, options.messages);
    let lastError = "";

    for (let attempt = 0; attempt < 2; attempt++) {
      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await this.client.chat.completions.create(
          {
            model: this.model,
            max_tokens: options.maxTokens ?? 4096,
            messages,
            response_format: { type: "json_object" },
          },
          { signal: options.signal },
        );
      } catch (err) {
        return mapError(err);
      }

      const raw = response.choices[0]?.message.content ?? "";
      const parsed = parseJsonObject(raw);
      if (parsed.ok) {
        const validated = options.schema.safeParse(parsed.value);
        if (validated.success) {
          return { data: validated.data, usage: toUsage(response), model: response.model };
        }
        lastError = validated.error.issues
          .slice(0, 8)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
      } else {
        lastError = parsed.error;
      }

      logger.warn("ai", "deepseek structured output rejected, retrying", { feature: options.feature, detail: lastError });
      messages.push({ role: "assistant", content: raw.slice(0, 4000) });
      messages.push({ role: "user", content: `That JSON was not valid for the schema: ${lastError}. Reply again with only the corrected JSON object.` });
    }

    throw new AIUnavailableError(new Error(`DeepSeek did not return valid ${options.schemaName}: ${lastError}`));
  }

  async *stream(options: StreamOptions): AsyncGenerator<StreamEvent, void, void> {
    const tools = isReasoner(this.model) ? [] : (options.tools ?? []);
    const toolByName = new Map(tools.map((t) => [t.name, t]));
    const openaiTools = tools.map(toolToOpenAI);
    const messages = toChatMessages(options.system, options.messages);
    const maxRounds = options.maxToolRounds ?? 6;
    const total: AIUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let model = this.model;

    for (let round = 0; round <= maxRounds; round++) {
      const collected = new Map<number, { id: string; name: string; args: string }>();
      let finishReason: string | null = null;
      let assistantText = "";

      try {
        const stream = await this.client.chat.completions.create(
          {
            model: this.model,
            max_tokens: options.maxTokens ?? 8192,
            messages,
            ...(openaiTools.length ? { tools: openaiTools } : {}),
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal: options.signal },
        );

        for await (const chunk of stream) {
          if (chunk.model) model = chunk.model;
          if (chunk.usage) {
            total.inputTokens += chunk.usage.prompt_tokens ?? 0;
            total.outputTokens += chunk.usage.completion_tokens ?? 0;
            total.cacheReadTokens = (total.cacheReadTokens ?? 0) + ((chunk.usage as { prompt_cache_hit_tokens?: number }).prompt_cache_hit_tokens ?? 0);
          }
          const choice = chunk.choices[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;

          const text = choice.delta?.content;
          if (text) {
            assistantText += text;
            yield { type: "text", text };
          }

          // Tool calls arrive split across chunks and are keyed by index, not id.
          for (const part of choice.delta?.tool_calls ?? []) {
            const slot = collected.get(part.index) ?? { id: "", name: "", args: "" };
            if (part.id) slot.id = part.id;
            if (part.function?.name) slot.name += part.function.name;
            if (part.function?.arguments) slot.args += part.function.arguments;
            collected.set(part.index, slot);
          }
        }
      } catch (err) {
        try {
          mapError(err);
        } catch (mapped) {
          const e = mapped as Error & { code?: string };
          yield { type: "error", message: e.message, code: e.code ?? "AI_UNAVAILABLE" };
          return;
        }
        return;
      }

      const calls = [...collected.values()].filter((c) => c.name);
      if (!calls.length) {
        yield { type: "done", usage: total, model, stopReason: finishReason };
        return;
      }

      messages.push({
        role: "assistant",
        content: assistantText || null,
        tool_calls: calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args || "{}" } })),
      });

      for (const call of calls) {
        const tool = toolByName.get(call.name);
        const label = tool?.label ?? `Running ${call.name}`;
        const parsedArgs = parseJsonObject(call.args || "{}");
        yield { type: "tool_call", name: call.name, label, input: parsedArgs.ok ? parsedArgs.value : call.args };

        if (!tool) {
          messages.push({ role: "tool", tool_call_id: call.id, content: `Unknown tool: ${call.name}` });
          yield { type: "tool_result", name: call.name, ok: false, summary: "Unknown tool" };
          continue;
        }
        if (!parsedArgs.ok) {
          messages.push({ role: "tool", tool_call_id: call.id, content: `Invalid JSON arguments: ${parsedArgs.error}` });
          yield { type: "tool_result", name: call.name, ok: false, summary: "Invalid tool input" };
          continue;
        }
        const validated = tool.inputSchema.safeParse(parsedArgs.value);
        if (!validated.success) {
          messages.push({ role: "tool", tool_call_id: call.id, content: `Invalid input: ${validated.error.message}` });
          yield { type: "tool_result", name: call.name, ok: false, summary: "Invalid tool input" };
          continue;
        }
        try {
          const output = await tool.execute(validated.data);
          const serialized = typeof output === "string" ? output : JSON.stringify(output);
          messages.push({ role: "tool", tool_call_id: call.id, content: serialized.slice(0, 40_000) });
          yield { type: "tool_result", name: call.name, ok: true, summary: summarize(output) };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Tool failed";
          logger.warn("ai", `tool ${call.name} failed`, { message: msg });
          messages.push({ role: "tool", tool_call_id: call.id, content: `Tool error: ${msg}` });
          yield { type: "tool_result", name: call.name, ok: false, summary: msg };
        }
      }
    }

    yield { type: "done", usage: total, model, stopReason: "max_tool_rounds" };
  }

  async healthcheck() {
    try {
      await this.client.models.list();
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Tolerates a stray markdown fence around otherwise valid JSON. */
function parseJsonObject(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!trimmed) return { ok: false, error: "empty response" };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unparseable JSON" };
  }
}

function summarize(output: unknown): string {
  if (output == null) return "Done";
  if (typeof output === "string") return output.slice(0, 80);
  if (Array.isArray(output)) return `${output.length} item${output.length === 1 ? "" : "s"}`;
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (Array.isArray(o.items)) return `${o.items.length} item${o.items.length === 1 ? "" : "s"}`;
    if (typeof o.summary === "string") return o.summary.slice(0, 80);
  }
  return "Done";
}
