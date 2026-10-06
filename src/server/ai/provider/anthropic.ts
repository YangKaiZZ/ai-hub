import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AIUnavailableError, RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AIProvider, AITool, AIUsage, BaseOptions, StreamEvent, StreamOptions, StructuredOptions } from "@/server/ai/provider/types";

const effortMap = { low: "low", medium: "medium", high: "high" } as const;

function toUsage(u: Anthropic.Usage): AIUsage {
  return { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0 };
}

function toAnthropicMessages(messages: BaseOptions["messages"]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function toolToAnthropic(tool: AITool): Anthropic.Tool {
  const json = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
  delete json.$schema;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { ...(json as Anthropic.Tool.InputSchema), type: "object" },
  };
}

function mapError(err: unknown): never {
  if (err instanceof Anthropic.RateLimitError) {
    const retry = Number(err.headers?.get?.("retry-after") ?? 30);
    throw new RateLimitError(Number.isFinite(retry) ? retry : 30);
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    logger.error("ai", "anthropic auth error", { message: err.message });
    throw new AIUnavailableError(err);
  }
  if (err instanceof Anthropic.APIError) {
    logger.error("ai", `anthropic api error ${err.status ?? ""}`, { message: err.message });
    throw new AIUnavailableError(err);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    throw new AIUnavailableError(err);
  }
  throw err;
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model: string;
  private client: Anthropic;

  constructor(options: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: 2, timeout: 120_000 });
    this.model = options.model;
  }

  async complete(options: BaseOptions) {
    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: options.maxTokens ?? 4096,
          system: [{ type: "text", text: options.system, cache_control: { type: "ephemeral" } }],
          messages: toAnthropicMessages(options.messages),
          output_config: { effort: effortMap[options.effort ?? "medium"] },
        },
        { signal: options.signal },
      );
      if (response.stop_reason === "refusal") {
        return { text: "I can't help with that request, but I'm happy to help with your coursework in another way.", usage: toUsage(response.usage), model: response.model };
      }
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text, usage: toUsage(response.usage), model: response.model };
    } catch (err) {
      return mapError(err);
    }
  }

  async structured<T>(options: StructuredOptions<T>) {
    try {
      const response = await this.client.messages.parse(
        {
          model: this.model,
          max_tokens: options.maxTokens ?? 4096,
          system: [{ type: "text", text: options.system, cache_control: { type: "ephemeral" } }],
          messages: toAnthropicMessages(options.messages),
          output_config: { effort: effortMap[options.effort ?? "medium"], format: zodOutputFormat(options.schema) },
        },
        { signal: options.signal },
      );
      if (!response.parsed_output) {
        throw new AIUnavailableError(new Error("Model returned no structured output"));
      }
      return { data: response.parsed_output, usage: toUsage(response.usage), model: response.model };
    } catch (err) {
      return mapError(err);
    }
  }

  async *stream(options: StreamOptions): AsyncGenerator<StreamEvent, void, void> {
    const tools = options.tools ?? [];
    const toolByName = new Map(tools.map((t) => [t.name, t]));
    const anthropicTools = tools.map(toolToAnthropic);
    const messages: Anthropic.MessageParam[] = toAnthropicMessages(options.messages);
    const maxRounds = options.maxToolRounds ?? 6;
    const total: AIUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let model = this.model;

    for (let round = 0; round <= maxRounds; round++) {
      let message: Anthropic.Message;
      try {
        const stream = this.client.messages.stream(
          {
            model: this.model,
            max_tokens: options.maxTokens ?? 8192,
            system: [{ type: "text", text: options.system, cache_control: { type: "ephemeral" } }],
            messages,
            ...(anthropicTools.length ? { tools: anthropicTools } : {}),
            output_config: { effort: effortMap[options.effort ?? "medium"] },
          },
          { signal: options.signal },
        );

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "text", text: event.delta.text };
          }
        }
        message = await stream.finalMessage();
      } catch (err) {
        try {
          mapError(err);
        } catch (mapped) {
          const e = mapped as Error & { code?: string; userMessage?: string };
          // userMessage is the text written for students; message is for logs.
          yield { type: "error", message: e.userMessage ?? e.message, code: e.code ?? "AI_UNAVAILABLE" };
          return;
        }
        return;
      }

      total.inputTokens += message.usage.input_tokens;
      total.outputTokens += message.usage.output_tokens;
      total.cacheReadTokens = (total.cacheReadTokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0);
      model = message.model;

      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }

      if (message.stop_reason !== "tool_use") {
        yield { type: "done", usage: total, model, stopReason: message.stop_reason };
        return;
      }

      const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: message.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const tool = toolByName.get(use.name);
        const label = tool?.label ?? `Running ${use.name}`;
        yield { type: "tool_call", name: use.name, label, input: use.input };
        if (!tool) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: `Unknown tool: ${use.name}`, is_error: true });
          yield { type: "tool_result", name: use.name, ok: false, summary: "Unknown tool" };
          continue;
        }
        const parsed = tool.inputSchema.safeParse(use.input);
        if (!parsed.success) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: `Invalid input: ${parsed.error.message}`, is_error: true });
          yield { type: "tool_result", name: use.name, ok: false, summary: "Invalid tool input" };
          continue;
        }
        try {
          const output = await tool.execute(parsed.data);
          const serialized = typeof output === "string" ? output : JSON.stringify(output);
          results.push({ type: "tool_result", tool_use_id: use.id, content: serialized.slice(0, 40_000) });
          yield { type: "tool_result", name: use.name, ok: true, summary: summarize(output) };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Tool failed";
          logger.warn("ai", `tool ${use.name} failed`, { message: msg });
          results.push({ type: "tool_result", tool_use_id: use.id, content: `Tool error: ${msg}`, is_error: true });
          yield { type: "tool_result", name: use.name, ok: false, summary: msg };
        }
      }
      messages.push({ role: "user", content: results });
    }

    yield { type: "done", usage: total, model, stopReason: "max_tool_rounds" };
  }

  async healthcheck() {
    try {
      await this.client.models.retrieve(this.model);
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
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
