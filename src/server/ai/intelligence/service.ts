import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getAIProvider, logAIUsage } from "@/server/ai/provider";
import { TASK_ANALYSIS_SYSTEM } from "@/server/ai/prompts";
import { taskAnalysisSchema, type TaskAnalysis } from "@/server/ai/intelligence/schemas";
import { calculatePriority } from "@/server/tasks/priority";
import type { NormalizedTask } from "@/server/ingestion/types";

function describeTask(input: {
  title: string;
  description?: string | null;
  instructions?: string | null;
  rubric?: unknown;
  course?: string | null;
  dueDate?: Date | null;
  type?: string | null;
}) {
  const parts = [
    `<student_context>`,
    `<task>`,
    `Title: ${input.title}`,
    input.course ? `Course: ${input.course}` : null,
    input.type ? `Declared type: ${input.type}` : null,
    input.dueDate ? `Deadline: ${input.dueDate.toISOString()}` : "Deadline: not set",
    input.description ? `Description:\n${input.description}` : null,
    input.instructions ? `Instructions:\n${input.instructions}` : null,
    input.rubric ? `Rubric (JSON):\n${JSON.stringify(input.rubric).slice(0, 6000)}` : null,
    `</task>`,
    `</student_context>`,
    ``,
    `Analyze this task.`,
  ];
  return parts.filter(Boolean).join("\n");
}

/**
 * Task Intelligence Service: analyze a stored task and persist the result.
 * Applies the AI's time estimate/importance only where the student left them blank.
 */
export async function analyzeTask(userId: string, taskId: string): Promise<TaskAnalysis> {
  const task = await db.task.findFirst({
    where: { id: taskId, userId, deletedAt: null },
    include: { course: { select: { name: true } } },
  });
  if (!task) throw new NotFoundError("Task");

  const analysis = await runAnalysis(userId, {
    title: task.title,
    description: task.description,
    instructions: task.instructions,
    rubric: task.rubric,
    course: task.course?.name,
    dueDate: task.dueDate,
    type: task.type,
  });

  const estimatedMinutes = task.estimatedMinutes ?? analysis.estimatedMinutes;
  const importance = task.importance === 3 ? analysis.importance : task.importance;
  const computed = task.priorityLocked
    ? null
    : calculatePriority({ dueDate: task.dueDate, estimatedMinutes, importance, progress: task.progress, status: task.status });

  await db.task.update({
    where: { id: task.id },
    data: {
      aiAnalysis: analysis,
      aiAnalyzedAt: new Date(),
      estimatedMinutes,
      importance,
      ...(task.type === "ASSIGNMENT" && analysis.taskType !== "ASSIGNMENT" ? { type: analysis.taskType } : {}),
      ...(computed ? { priority: computed.priority, priorityScore: computed.score } : {}),
    },
  });
  return analysis;
}

/** Analyze a not-yet-stored normalized task (used by the ingestion engine). */
export async function analyzeNormalizedTask(userId: string, task: NormalizedTask): Promise<TaskAnalysis> {
  return runAnalysis(userId, {
    title: task.title,
    description: task.description,
    instructions: task.instructions,
    rubric: task.rubric,
    course: task.course?.name,
    dueDate: task.dueDate,
    type: task.type,
  });
}

async function runAnalysis(userId: string, input: Parameters<typeof describeTask>[0]): Promise<TaskAnalysis> {
  const provider = getAIProvider();
  const started = Date.now();
  try {
    const result = await provider.structured({
      feature: "task-analysis",
      userId,
      system: TASK_ANALYSIS_SYSTEM,
      messages: [{ role: "user", content: describeTask(input) }],
      schema: taskAnalysisSchema,
      schemaName: "task_analysis",
      effort: "low",
      maxTokens: 2048,
    });
    void logAIUsage({ userId, feature: "task-analysis", provider: provider.name, model: result.model, usage: result.usage, latencyMs: Date.now() - started });
    return result.data;
  } catch (err) {
    void logAIUsage({ userId, feature: "task-analysis", provider: provider.name, model: provider.model, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: Date.now() - started, success: false, errorCode: err instanceof Error ? err.name : "unknown" });
    logger.warn("ai", "task analysis failed", { error: String(err) });
    throw err;
  }
}
