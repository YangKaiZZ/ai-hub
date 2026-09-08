import { z } from "zod";

export const taskTypeEnum = z.enum(["ASSIGNMENT", "PROJECT", "QUIZ", "EXAM", "READING", "LAB", "DISCUSSION", "PRESENTATION", "OTHER"]);
export const taskStatusEnum = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]);
export const taskPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal("")).nullable();

export const rubricItemSchema = z.object({
  criterion: z.string().trim().min(1).max(200),
  points: z.coerce.number().min(0).max(1000).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalText(5000),
  instructions: optionalText(20000),
  courseId: z.string().uuid().optional().nullable(),
  type: taskTypeEnum.default("ASSIGNMENT"),
  dueDate: z.coerce.date().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  estimatedMinutes: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  importance: z.coerce.number().int().min(1).max(5).default(3),
  instructor: optionalText(120),
  externalUrl: z.string().trim().url().max(2048).optional().or(z.literal("")).nullable(),
  rubric: z.array(rubricItemSchema).max(50).optional().nullable(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: taskStatusEnum.optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  /** Manual override; sets priorityLocked. Pass null to unlock. */
  priority: taskPriorityEnum.nullable().optional(),
});

export const taskFilterEnum = z.enum(["all", "today", "week", "upcoming", "completed", "high", "overdue"]);
export const taskSortEnum = z.enum(["priority", "dueDate", "createdAt", "title"]);

export const listTasksQuerySchema = z.object({
  filter: taskFilterEnum.default("all"),
  courseId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  sort: taskSortEnum.default("priority"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskFilter = z.infer<typeof taskFilterEnum>;
export type TaskSort = z.infer<typeof taskSortEnum>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
