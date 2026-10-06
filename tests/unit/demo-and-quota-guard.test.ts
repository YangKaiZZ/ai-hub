import { describe, expect, it } from "vitest";
import { z } from "zod";
import { assertNotDemo } from "@/lib/auth/guards";
import { DEMO_ACCOUNT, isDemoEmail } from "@/lib/demo";
import { AIQuotaExceededError } from "@/lib/errors";
import { QuotaGuardedProvider } from "@/server/ai/provider";
import type { AIProvider, StreamEvent } from "@/server/ai/provider/types";
import { nextUtcMidnight, startOfUtcDay } from "@/server/ai/quota";
import { signup } from "@/server/auth/service";

describe("isDemoEmail", () => {
  it("recognises both seeded accounts, case-insensitively", () => {
    expect(isDemoEmail(DEMO_ACCOUNT.email)).toBe(true);
    expect(isDemoEmail("admin@demo.aihub.local")).toBe(true);
    expect(isDemoEmail("  Andrew@DEMO.aihub.local ")).toBe(true);
  });

  it("does not match lookalike domains", () => {
    expect(isDemoEmail("andrew@demo.aihub.local.evil.com")).toBe(false);
    expect(isDemoEmail("andrew@notdemo.aihub.local")).toBe(false);
    expect(isDemoEmail("student@school.edu")).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
  });
});

describe("assertNotDemo", () => {
  it("refuses the shared demo login with a message a visitor can act on", () => {
    let caught: unknown;
    try {
      assertNotDemo({ email: DEMO_ACCOUNT.email }, "change its password");
    } catch (err) {
      caught = err;
    }
    const e = caught as { code: string; status: number; userMessage: string };
    expect(e.code).toBe("DEMO_READ_ONLY");
    expect(e.status).toBe(403);
    expect(e.userMessage).toMatch(/create a free account/i);
  });

  it("lets everyone else through", () => {
    expect(() => assertNotDemo({ email: "student@school.edu" }, "be deleted")).not.toThrow();
  });
});

describe("signup", () => {
  it("will not hand out an address on the demo domain", async () => {
    await expect(
      signup({ email: "visitor@demo.aihub.local", password: "Password123", firstName: "Eve" } as Parameters<typeof signup>[0]),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("UTC day boundaries", () => {
  it("counts from midnight UTC and resets at the next one", () => {
    const now = new Date("2026-10-06T23:59:30+08:00"); // 15:59:30 UTC on the 6th
    expect(startOfUtcDay(now).toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(nextUtcMidnight(now).toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });
});

function fakeProvider(calls: string[]): AIProvider {
  return {
    name: "deepseek",
    model: "deepseek-chat",
    async complete() {
      calls.push("complete");
      return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 }, model: "deepseek-chat" };
    },
    async structured<T>() {
      calls.push("structured");
      return { data: { ok: true } as T, usage: { inputTokens: 1, outputTokens: 1 }, model: "deepseek-chat" };
    },
    async *stream() {
      calls.push("stream");
      yield { type: "text", text: "hello" } as StreamEvent;
      yield { type: "done", usage: { inputTokens: 1, outputTokens: 1 }, model: "deepseek-chat", stopReason: "stop" } as StreamEvent;
    },
    async healthcheck() {
      return { ok: true };
    },
  };
}

const allow = async () => {};
const refuse = async () => {
  throw new AIQuotaExceededError("user", new Date("2026-10-07T00:00:00Z"));
};
const base = { feature: "test", userId: "u1", system: "", messages: [{ role: "user" as const, content: "hi" }] };

describe("QuotaGuardedProvider", () => {
  it("passes every kind of call straight through while under the allowance", async () => {
    const calls: string[] = [];
    const p = new QuotaGuardedProvider(fakeProvider(calls), allow);
    await p.complete(base);
    await p.structured({ ...base, schema: z.object({ ok: z.boolean() }), schemaName: "x" });
    const events: StreamEvent[] = [];
    for await (const e of p.stream(base)) events.push(e);
    expect(calls).toEqual(["complete", "structured", "stream"]);
    expect(events.map((e) => e.type)).toEqual(["text", "done"]);
    expect(p.name).toBe("deepseek");
  });

  it("never reaches the paid provider once the allowance is spent", async () => {
    const calls: string[] = [];
    const p = new QuotaGuardedProvider(fakeProvider(calls), refuse);
    await expect(p.complete(base)).rejects.toMatchObject({ code: "AI_QUOTA_EXCEEDED", status: 429 });
    await expect(p.structured({ ...base, schema: z.object({ ok: z.boolean() }), schemaName: "x" })).rejects.toMatchObject({
      code: "AI_QUOTA_EXCEEDED",
    });
    expect(calls).toEqual([]);
  });

  it("ends a refused chat stream with one error event the UI can show", async () => {
    const calls: string[] = [];
    const p = new QuotaGuardedProvider(fakeProvider(calls), refuse);
    const events: StreamEvent[] = [];
    for await (const e of p.stream(base)) events.push(e);
    expect(calls).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "AI_QUOTA_EXCEEDED" });
    expect((events[0] as { message: string }).message).toMatch(/midnight UTC/);
  });

  it("does not swallow unexpected failures in the check itself", async () => {
    const p = new QuotaGuardedProvider(fakeProvider([]), async () => {
      throw new Error("database down");
    });
    const run = async () => {
      for await (const e of p.stream(base)) void e;
    };
    await expect(run()).rejects.toThrow("database down");
  });
});
