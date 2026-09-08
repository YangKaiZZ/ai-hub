import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { calculatePriority, comparePriority, type PriorityRules } from "@/server/tasks/priority";
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from "@/server/tasks/schemas";
import type { Prisma, TaskPriority } from "@/generated/prisma/client";
import { notify } from "@/server/notifications/service";
import { endOfDay, endOfWeek, startOfDay } from "date-fns";

const nullIfEmpty = <T extends string>(v: T | "" | null | undefined) => (v ? v : null);

export const taskCardSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  status: true,
  priority: true,
  priorityScore: true,
  priorityLocked: true,
  importance: true,
  progress: true,
  estimatedMinutes: true,
  dueDate: true,
  startDate: true,
  completedAt: true,
  source: true,
  externalUrl: true,
  aiAnalyzedAt: true,
  aiAnalysis: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { id: true, name: true, code: true, color: true, icon: true, instructor: true } },
  workspace: { select: { id: true, assistanceMode: true } },
} satisfies Prisma.TaskSelect;

export type TaskCard = Prisma.TaskGetPayload<{ select: typeof taskCardSelect }>;

async function getPriorityRules(userId: string): Promise<Partial<PriorityRules> | null> {
  const pref = await db.userPreference.findUnique({ where: { userId }, select: { priorityRules: true } });
  const rules = pref?.priorityRules as Partial<PriorityRules> | null | undefined;
  return rules && Object.keys(rules).length > 0 ? rules : null;
}

function buildFilterWhere(filter: ListTasksQuery["filter"], now: Date): Prisma.TaskWhereInput {
  const open: Prisma.TaskWhereInput = { status: { in: ["NOT_STARTED", "IN_PROGRESS"] } };
  switch (filter) {
    case "today":
      return { ...open, dueDate: { gte: startOfDay(now), lte: endOfDay(now) } };
    case "week":
      return { ...open, dueDate: { gte: startOfDay(now), lte: endOfWeek(now, { weekStartsOn: 1 }) } };
    case "upcoming":
      return { ...open, dueDate: { gt: endOfDay(now) } };
    case "overdue":
      return { ...open, dueDate: { lt: now } };
    case "completed":
      return { status: "COMPLETED" };
    case "high":
      return { ...open, priority: { in: ["HIGH", "CRITICAL"] } };
    case "all":
    default:
      return { status: { not: "ARCHIVED" } };
  }
}

export async function listTasks(userId: string, query: ListTasksQuery, now = new Date()) {
  const where: Prisma.TaskWhereInput = {
    userId,
    deletedAt: null,
    ...buildFilterWhere(query.filter, now),
    ...(query.courseId ? { courseId: query.courseId } : {}),
    ...(query.q
      ? {
          OR: [{ title: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }],
        }
      : {}),
  };

  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    query.sort === "dueDate"
      ? [{ dueDate: { sort: "asc", nulls: "last" } }, { priorityScore: "desc" }]
      : query.sort === "createdAt"
        ? [{ createdAt: "desc" }]
        : query.sort === "title"
          ? [{ title: "asc" }]
          : [{ priorityScore: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }];

  const [items, total] = await Promise.all([
    db.task.findMany({ where, select: taskCardSelect, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    db.task.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getTask(userId: string, taskId: string) {
  const task = await db.task.findFirst({
    where: { id: taskId, userId, deletedAt: null },
    include: {
      course: { select: { id: true, name: true, code: true, color: true, icon: true, instructor: true } },
      attachments: { orderBy: { createdAt: "asc" } },
      workspace: { select: { id: true, assistanceMode: true, lastOpenedAt: true } },
    },
  });
  if (!task) throw new NotFoundError("Task");
  return task;
}

export async function createTask(userId: string, input: CreateTaskInput) {
  if (input.courseId) {
    const course = await db.course.findFirst({ where: { id: input.courseId, userId, deletedAt: null }, select: { id: true } });
    if (!course) throw new NotFoundError("Course");
  }
  const rules = await getPriorityRules(userId);
  const computed = calculatePriority(
    { dueDate: input.dueDate ?? null, estimatedMinutes: input.estimatedMinutes ?? null, importance: input.importance, progress: 0, status: "NOT_STARTED" },
    rules,
  );

  const task = await db.task.create({
    data: {
      userId,
      courseId: input.courseId ?? null,
      title: input.title,
      description: nullIfEmpty(input.description),
      instructions: nullIfEmpty(input.instructions),
      type: input.type,
      dueDate: input.dueDate ?? null,
      startDate: input.startDate ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      importance: input.importance,
      instructor: nullIfEmpty(input.instructor),
      externalUrl: nullIfEmpty(input.externalUrl),
      rubric: input.rubric ?? undefined,
      priority: computed.priority,
      priorityScore: computed.score,
      source: "MANUAL",
    },
    select: taskCardSelect,
  });

  if (task.dueDate) {
    await db.calendarEvent.create({
      data: { userId, taskId: task.id, courseId: task.course?.id ?? null, title: task.title, type: mapTaskTypeToEvent(task.type), startAt: task.dueDate, allDay: false, source: "MANUAL" },
    });
  }
  return task;
}

export function mapTaskTypeToEvent(type: TaskCard["type"]) {
  switch (type) {
    case "EXAM":
    case "QUIZ":
      return "EXAM" as const;
    case "PROJECT":
      return "PROJECT" as const;
    default:
      return "ASSIGNMENT" as const;
  }
}

export async function updateTask(userId: string, taskId: string, input: UpdateTaskInput) {
  const existing = await db.task.findFirst({ where: { id: taskId, userId, deletedAt: null } });
  if (!existing) throw new NotFoundError("Task");
  if (input.courseId) {
    const course = await db.course.findFirst({ where: { id: input.courseId, userId, deletedAt: null }, select: { id: true } });
    if (!course) throw new NotFoundError("Course");
  }

  const status = input.status ?? existing.status;
  let progress = input.progress ?? existing.progress;
  if (status === "COMPLETED") progress = 100;
  else if (input.status === "NOT_STARTED" && input.progress === undefined) progress = 0;
  else if (progress > 0 && progress < 100 && status === "NOT_STARTED" && input.status === undefined) {
    // Editing progress on an unstarted task moves it to in progress.
    return updateTask(userId, taskId, { ...input, status: "IN_PROGRESS" });
  }

  const dueDate = input.dueDate === undefined ? existing.dueDate : input.dueDate;
  const estimatedMinutes = input.estimatedMinutes === undefined ? existing.estimatedMinutes : input.estimatedMinutes;
  const importance = input.importance ?? existing.importance;

  let priority: TaskPriority = existing.priority;
  let priorityScore = existing.priorityScore;
  let priorityLocked = existing.priorityLocked;
  if (input.priority !== undefined) {
    if (input.priority === null) {
      priorityLocked = false;
    } else {
      priority = input.priority;
      priorityLocked = true;
    }
  }
  if (!priorityLocked) {
    const computed = calculatePriority({ dueDate, estimatedMinutes, importance, progress, status }, await getPriorityRules(userId));
    priority = computed.priority;
    priorityScore = computed.score;
  }

  const task = await db.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: nullIfEmpty(input.description) } : {}),
      ...(input.instructions !== undefined ? { instructions: nullIfEmpty(input.instructions) } : {}),
      ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.instructor !== undefined ? { instructor: nullIfEmpty(input.instructor) } : {}),
      ...(input.externalUrl !== undefined ? { externalUrl: nullIfEmpty(input.externalUrl) } : {}),
      ...(input.rubric !== undefined ? { rubric: input.rubric ?? undefined } : {}),
      dueDate,
      estimatedMinutes,
      importance,
      status,
      progress,
      priority,
      priorityScore,
      priorityLocked,
      completedAt: status === "COMPLETED" ? existing.completedAt ?? new Date() : null,
    },
    select: taskCardSelect,
  });

  // Keep the linked calendar event in sync with the deadline.
  if (input.dueDate !== undefined || input.title !== undefined) {
    if (task.dueDate) {
      const event = await db.calendarEvent.findFirst({ where: { taskId, userId }, select: { id: true } });
      if (event) {
        await db.calendarEvent.update({ where: { id: event.id }, data: { title: task.title, startAt: task.dueDate, courseId: task.course?.id ?? null } });
      } else {
        await db.calendarEvent.create({
          data: { userId, taskId, courseId: task.course?.id ?? null, title: task.title, type: mapTaskTypeToEvent(task.type), startAt: task.dueDate, source: "MANUAL" },
        });
      }
    } else {
      await db.calendarEvent.deleteMany({ where: { taskId, userId } });
    }
  }
  return task;
}

export async function deleteTask(userId: string, taskId: string) {
  const existing = await db.task.findFirst({ where: { id: taskId, userId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError("Task");
  await db.$transaction([
    db.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } }),
    db.calendarEvent.deleteMany({ where: { taskId, userId } }),
  ]);
}

/**
 * Recompute priorities for all open tasks (deadlines move closer every day).
 * Called on dashboard load at most once per hour per user via `recalculateIfStale`.
 */
export async function recalculatePriorities(userId: string, now = new Date()) {
  const rules = await getPriorityRules(userId);
  const tasks = await db.task.findMany({
    where: { userId, deletedAt: null, priorityLocked: false, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
    select: { id: true, dueDate: true, estimatedMinutes: true, importance: true, progress: true, status: true, priority: true, priorityScore: true },
  });
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  let escalated = 0;
  for (const t of tasks) {
    const computed = calculatePriority({ ...t, now }, rules);
    if (computed.priority !== t.priority || Math.abs(computed.score - t.priorityScore) >= 1) {
      updates.push(db.task.update({ where: { id: t.id }, data: { priority: computed.priority, priorityScore: computed.score } }));
      if ((computed.priority === "CRITICAL" || computed.priority === "HIGH") && t.priority !== "CRITICAL" && t.priority !== "HIGH") escalated += 1;
    }
  }
  if (updates.length) await db.$transaction(updates);
  return { updated: updates.length, escalated };
}

const lastRecalc = new Map<string, number>();
export async function recalculateIfStale(userId: string) {
  const last = lastRecalc.get(userId) ?? 0;
  if (Date.now() - last < 60 * 60_000) return;
  lastRecalc.set(userId, Date.now());
  await recalculatePriorities(userId);
}

/** Top N open tasks that need attention, sorted by computed priority. */
export async function getAttentionTasks(userId: string, limit = 5) {
  const tasks = await db.task.findMany({
    where: { userId, deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
    select: taskCardSelect,
    orderBy: [{ priorityScore: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }],
    take: limit,
  });
  return tasks.sort(comparePriority);
}

export async function getTaskStats(userId: string, now = new Date()) {
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const open: Prisma.TaskWhereInput = { userId, deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } };
  const [dueThisWeek, highPriority, upcoming, completed, overdue, total] = await Promise.all([
    db.task.count({ where: { ...open, dueDate: { gte: startOfDay(now), lte: weekEnd } } }),
    db.task.count({ where: { ...open, priority: { in: ["HIGH", "CRITICAL"] } } }),
    db.task.count({ where: { ...open, dueDate: { gt: weekEnd } } }),
    db.task.count({ where: { userId, deletedAt: null, status: "COMPLETED" } }),
    db.task.count({ where: { ...open, dueDate: { lt: now } } }),
    db.task.count({ where: { userId, deletedAt: null, status: { not: "ARCHIVED" } } }),
  ]);
  return { dueThisWeek, highPriority, upcoming, completed, overdue, total, active: total - completed };
}

/** Fire a NEW_TASK notification (used by ingestion, not manual creation). */
export async function notifyNewTask(userId: string, task: { id: string; title: string; course?: { name: string } | null }) {
  await notify(userId, "NEW_TASK", `New task: ${task.title}`, task.course?.name ? `Imported for ${task.course.name}` : undefined, {
    taskId: task.id,
    href: `/tasks/${task.id}`,
  });
}
