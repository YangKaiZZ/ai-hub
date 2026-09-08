import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockProvider } from "@/server/ai/provider/mock";
import { taskAnalysisSchema, studyPlanOutputSchema } from "@/server/ai/intelligence/schemas";
import type { AITool, StreamEvent } from "@/server/ai/provider/types";
import { LocalHashEmbeddingProvider } from "@/server/ai/embeddings/local";
import { cosineSimilarity } from "@/server/ai/embeddings/types";

const provider = new MockProvider({ delayMs: 0 });

describe("MockProvider", () => {
  it("produces schema-valid task analyses", async () => {
    const res = await provider.structured({ feature: "task-analysis", system: "", messages: [{ role: "user", content: "Title: Midterm Exam covering SQL and normalization" }], schema: taskAnalysisSchema, schemaName: "task_analysis" });
    expect(res.data.taskType).toBe("EXAM");
    expect(res.data.recommendedSteps.length).toBeGreaterThanOrEqual(2);
    expect(taskAnalysisSchema.safeParse(res.data).success).toBe(true);
  });

  it("produces schema-valid study plans", async () => {
    const res = await provider.structured({ feature: "study-plan", system: "", messages: [{ role: "user", content: "{}" }], schema: studyPlanOutputSchema, schemaName: "study_plan" });
    expect(res.data.sessions.length).toBeGreaterThan(0);
  });

  it("streams text and calls planning tools when asked what to study", async () => {
    const calls: string[] = [];
    const tools: AITool[] = [
      {
        name: "get_upcoming_deadlines",
        description: "",
        inputSchema: z.object({ days: z.number().default(7), limit: z.number().default(10) }),
        execute: async () => {
          calls.push("deadlines");
          return { items: [{ title: "ERD Project", course: "Database Systems", dueDate: new Date().toISOString(), priority: "HIGH" }] };
        },
      },
    ];
    const events: StreamEvent[] = [];
    for await (const e of provider.stream({ feature: "agent", system: "", messages: [{ role: "user", content: "What should I study tonight?" }], tools })) events.push(e);
    expect(calls).toEqual(["deadlines"]);
    const text = events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("");
    expect(text).toContain("ERD Project");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("refuses to hand over answers in learning mode", async () => {
    const res = await provider.complete({ feature: "tutor", system: "Assistance mode: LEARNING.", messages: [{ role: "user", content: "How do I differentiate e^(3x^2)?" }] });
    expect(res.text).toMatch(/what you already know|hint/i);
  });
});

describe("LocalHashEmbeddingProvider", () => {
  const emb = new LocalHashEmbeddingProvider(128);
  it("returns normalized vectors of the configured size", async () => {
    const [v] = await emb.embed(["derivatives of exponential functions"]);
    expect(v).toHaveLength(128);
    const norm = Math.sqrt(v!.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 3);
  });
  it("ranks related text closer than unrelated text", async () => {
    const [q, related, unrelated] = await emb.embed(["chain rule for exponential derivatives", "the chain rule extends derivatives of exponential functions", "the library closes at nine on weekends"]);
    expect(cosineSimilarity(q!, related!)).toBeGreaterThan(cosineSimilarity(q!, unrelated!));
  });
});
