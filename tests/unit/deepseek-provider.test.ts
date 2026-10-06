import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { DeepSeekProvider } from "@/server/ai/provider/deepseek";
import type { AITool, StreamEvent } from "@/server/ai/provider/types";

/**
 * The provider is exercised against a local stand-in that speaks the subset of
 * the OpenAI chat protocol DeepSeek implements. No network, no API credits, and
 * the recorded request bodies prove what we actually send back on a tool round.
 */

type Handler = (body: Record<string, unknown>, res: ServerResponse) => void;

let server: Server;
let baseUrl: string;
let handler: Handler;
const received: Record<string, unknown>[] = [];

function json(res: ServerResponse, payload: unknown) {
  const text = JSON.stringify(payload);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(text);
}

function sse(res: ServerResponse, chunks: unknown[]) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

function chunk(delta: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { id: "c1", object: "chat.completion.chunk", model: "deepseek-chat", choices: [{ index: 0, delta, finish_reason: null }], ...extra };
}

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      if (req.url?.includes("/models")) return json(res, { object: "list", data: [{ id: "deepseek-chat" }] });
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      received.push(body);
      handler(body, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function makeProvider(model = "deepseek-chat") {
  return new DeepSeekProvider({ apiKey: "test-key", model, baseUrl });
}

describe("DeepSeekProvider", () => {
  it("returns text and maps DeepSeek's cache-hit tokens into usage", async () => {
    handler = (_body, res) =>
      json(res, {
        model: "deepseek-chat",
        choices: [{ index: 0, message: { role: "assistant", content: "Start with section 3." }, finish_reason: "stop" }],
        usage: { prompt_tokens: 120, completion_tokens: 18, prompt_cache_hit_tokens: 64 },
      });

    const res = await makeProvider().complete({ feature: "test", system: "You are a tutor.", messages: [{ role: "user", content: "What first?" }] });
    expect(res.text).toBe("Start with section 3.");
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 18, cacheReadTokens: 64 });
  });

  it("sends the system prompt as the first message", async () => {
    received.length = 0;
    handler = (_body, res) => json(res, { model: "deepseek-chat", choices: [{ message: { content: "ok" } }], usage: {} });
    await makeProvider().complete({ feature: "test", system: "SYSTEM RULES", messages: [{ role: "user", content: "hi" }] });
    const sent = received[0] as { messages: { role: string; content: string }[] };
    expect(sent.messages[0]).toEqual({ role: "system", content: "SYSTEM RULES" });
    expect(sent.messages[1]?.role).toBe("user");
  });

  it("validates structured output and retries once when the shape is wrong", async () => {
    const schema = z.object({ taskType: z.enum(["EXAM", "ESSAY"]), minutes: z.number() });
    let call = 0;
    handler = (_body, res) => {
      call += 1;
      const content = call === 1 ? JSON.stringify({ taskType: "NOPE" }) : "```json\n" + JSON.stringify({ taskType: "EXAM", minutes: 90 }) + "\n```";
      json(res, { model: "deepseek-chat", choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    };

    const res = await makeProvider().structured({ feature: "test", system: "", messages: [{ role: "user", content: "analyse" }], schema, schemaName: "task_analysis" });
    expect(call).toBe(2);
    expect(res.data).toEqual({ taskType: "EXAM", minutes: 90 });
  });

  it("gives up after the retry, keeping the reason off the user-facing message", async () => {
    const schema = z.object({ minutes: z.number() });
    let calls = 0;
    handler = (_body, res) => {
      calls += 1;
      json(res, { model: "deepseek-chat", choices: [{ message: { content: "not json at all" } }], usage: {} });
    };

    const error = await makeProvider()
      .structured({ feature: "test", system: "", messages: [{ role: "user", content: "x" }], schema, schemaName: "plan" })
      .then(() => null)
      .catch((e: unknown) => e as Error & { code?: string; cause?: unknown });

    expect(calls).toBe(2);
    expect(error?.code).toBe("AI_UNAVAILABLE");
    expect(error?.message).toBe("AI provider unavailable");
    expect(String((error?.cause as Error)?.message)).toMatch(/plan/i);
  });

  it("streams text, runs a tool, and feeds the result back for a second round", async () => {
    received.length = 0;
    const executed: unknown[] = [];
    const tools: AITool[] = [
      {
        name: "get_upcoming_deadlines",
        description: "Upcoming deadlines",
        label: "Checking your deadlines",
        inputSchema: z.object({ days: z.number() }),
        async execute(input) {
          executed.push(input);
          return { items: [{ title: "ERD Project" }, { title: "Problem Set 3" }] };
        },
      },
    ];

    let round = 0;
    handler = (_body, res) => {
      round += 1;
      if (round === 1) {
        // Tool-call arguments arrive split across chunks, keyed by index.
        return sse(res, [
          chunk({ content: "Let me check. " }),
          chunk({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_upcoming_", arguments: '{"days"' } }] }),
          chunk({ tool_calls: [{ index: 0, function: { name: "deadlines", arguments: ": 7}" } }] }),
          { ...chunk({}), choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 50, completion_tokens: 10 } },
        ]);
      }
      return sse(res, [
        chunk({ content: "You have 2 deadlines." }),
        { ...chunk({}), choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 80, completion_tokens: 12 } },
      ]);
    };

    const events: StreamEvent[] = [];
    for await (const event of makeProvider().stream({ feature: "tutor", system: "s", messages: [{ role: "user", content: "what's due?" }], tools })) {
      events.push(event);
    }

    expect(executed).toEqual([{ days: 7 }]);
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toBe("Let me check. You have 2 deadlines.");

    const call = events.find((e) => e.type === "tool_call") as { name: string; label: string; input: unknown } | undefined;
    expect(call?.name).toBe("get_upcoming_deadlines");
    expect(call?.label).toBe("Checking your deadlines");

    const result = events.find((e) => e.type === "tool_result") as { ok: boolean; summary: string } | undefined;
    expect(result?.ok).toBe(true);
    expect(result?.summary).toBe("2 items");

    const done = events.at(-1) as { type: string; usage: { inputTokens: number; outputTokens: number } };
    expect(done.type).toBe("done");
    expect(done.usage).toMatchObject({ inputTokens: 130, outputTokens: 22 });

    // Second request must replay the assistant tool call plus a matching tool message.
    const second = received[1] as { messages: { role: string; tool_call_id?: string; content?: unknown }[] };
    expect(second.messages.at(-2)?.role).toBe("assistant");
    expect(second.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1" });
  });

  it("reports a bad tool input instead of executing the tool", async () => {
    const tools: AITool[] = [
      {
        name: "get_grades",
        description: "",
        inputSchema: z.object({ courseId: z.string() }),
        async execute() {
          throw new Error("must not run");
        },
      },
    ];
    let round = 0;
    handler = (_body, res) => {
      round += 1;
      if (round === 1) {
        return sse(res, [
          chunk({ tool_calls: [{ index: 0, id: "call_9", type: "function", function: { name: "get_grades", arguments: '{"courseId": 42}' } }] }),
          { ...chunk({}), choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: {} },
        ]);
      }
      return sse(res, [chunk({ content: "ok" }), { ...chunk({}), choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: {} }]);
    };

    const events: StreamEvent[] = [];
    for await (const e of makeProvider().stream({ feature: "tutor", system: "", messages: [{ role: "user", content: "grades?" }], tools })) events.push(e);
    const result = events.find((e) => e.type === "tool_result") as { ok: boolean; summary: string };
    expect(result.ok).toBe(false);
    expect(result.summary).toBe("Invalid tool input");
  });

  it("omits tools on deepseek-reasoner, which cannot call them", async () => {
    received.length = 0;
    handler = (_body, res) => sse(res, [chunk({ content: "thinking done" }), { ...chunk({}), choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: {} }]);
    const tools: AITool[] = [{ name: "t", description: "", inputSchema: z.object({}), async execute() { return {}; } }];
    const events: StreamEvent[] = [];
    for await (const e of makeProvider("deepseek-reasoner").stream({ feature: "tutor", system: "", messages: [{ role: "user", content: "hi" }], tools })) events.push(e);
    expect((received[0] as { tools?: unknown }).tools).toBeUndefined();
    expect(events.at(-1)?.type).toBe("done");
  });

  it("turns an auth failure into a friendly error event rather than throwing", async () => {
    handler = (_body, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Authentication Fails" } }));
    };
    const events: StreamEvent[] = [];
    for await (const e of makeProvider().stream({ feature: "tutor", system: "", messages: [{ role: "user", content: "hi" }] })) events.push(e);
    expect(events.at(-1)?.type).toBe("error");
    // The student sees the friendly text, not the internal "AI provider unavailable".
    expect((events.at(-1) as { message: string }).message).toMatch(/temporarily unavailable/i);
  });
});
