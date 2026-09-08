import { taskAnalysisSchema, type TaskAnalysis } from "@/server/ai/intelligence/schemas";

/**
 * Task.aiAnalysis is free-form JSON written by whichever analyzer version ran
 * (or by imports). Normalize it into a complete TaskAnalysis so UI code never
 * has to guard individual fields; unusable payloads yield null.
 */
export function parseTaskAnalysis(json: unknown): TaskAnalysis | null {
  if (!json || typeof json !== "object") return null;
  const raw = json as Record<string, unknown>;
  const candidate = {
    taskType: raw.taskType ?? "ASSIGNMENT",
    difficulty: raw.difficulty ?? "medium",
    estimatedMinutes: raw.estimatedMinutes ?? 60,
    importance: raw.importance ?? 3,
    summary: raw.summary ?? "",
    requiredMaterials: Array.isArray(raw.requiredMaterials) ? raw.requiredMaterials : [],
    rubricRequirements: Array.isArray(raw.rubricRequirements) ? raw.rubricRequirements : [],
    importantDates: Array.isArray(raw.importantDates) ? raw.importantDates : [],
    recommendedSteps: Array.isArray(raw.recommendedSteps) && raw.recommendedSteps.length >= 2 ? raw.recommendedSteps : ["Review the brief", "Outline your approach"],
    keyConcepts: Array.isArray(raw.keyConcepts) ? raw.keyConcepts : [],
    risks: Array.isArray(raw.risks) ? raw.risks : [],
  };
  const parsed = taskAnalysisSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
