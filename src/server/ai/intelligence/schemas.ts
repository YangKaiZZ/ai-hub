import { z } from "zod";

/** Structured output of the Task Intelligence Service (stored in Task.aiAnalysis). */
export const taskAnalysisSchema = z.object({
  taskType: z.enum(["ASSIGNMENT", "PROJECT", "QUIZ", "EXAM", "READING", "LAB", "DISCUSSION", "PRESENTATION", "OTHER"]),
  difficulty: z.enum(["easy", "medium", "hard", "very_hard"]),
  estimatedMinutes: z.number().int().min(5).max(6000),
  /** 1-5 suggested importance. */
  importance: z.number().int().min(1).max(5),
  summary: z.string().max(600),
  requiredMaterials: z.array(z.string().max(120)).max(10),
  rubricRequirements: z.array(z.string().max(200)).max(15),
  importantDates: z.array(z.object({ label: z.string().max(80), date: z.string().max(40) })).max(8),
  recommendedSteps: z.array(z.string().max(200)).min(2).max(10),
  /** Concepts the student should understand to complete this well. */
  keyConcepts: z.array(z.string().max(80)).max(10),
  risks: z.array(z.string().max(200)).max(5),
});

export type TaskAnalysis = z.infer<typeof taskAnalysisSchema>;

export const studyPlanOutputSchema = z.object({
  title: z.string().max(120),
  rationale: z.string().max(800),
  sessions: z
    .array(
      z.object({
        date: z.string().describe("YYYY-MM-DD"),
        startTime: z.string().describe("HH:mm 24h"),
        endTime: z.string().describe("HH:mm 24h"),
        type: z.enum(["REVIEW", "PRACTICE", "ASSIGNMENT_WORK", "FLASHCARDS", "READING", "BREAK"]),
        title: z.string().max(120),
        taskId: z.string().nullable(),
        courseId: z.string().nullable(),
        note: z.string().max(200).nullable(),
      }),
    )
    .max(80),
});

export type StudyPlanOutput = z.infer<typeof studyPlanOutputSchema>;
