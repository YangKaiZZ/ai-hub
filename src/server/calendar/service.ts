import { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";

export const calendarRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")).nullable(),
  type: z.enum(["CLASS", "PERSONAL", "EXAM", "OTHER", "STUDY_SESSION"]).default("PERSONAL"),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional().nullable(),
  allDay: z.boolean().default(false),
  location: z.string().trim().max(160).optional().or(z.literal("")).nullable(),
  courseId: z.string().uuid().optional().nullable(),
});
export const updateEventSchema = createEventSchema.partial();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  startAt: true,
  endAt: true,
  allDay: true,
  location: true,
  source: true,
  taskId: true,
  studySessionId: true,
  course: { select: { id: true, name: true, code: true, color: true } },
  task: { select: { id: true, status: true, priority: true, progress: true } },
  studySession: { select: { id: true, completedAt: true, type: true } },
} satisfies Prisma.CalendarEventSelect;

export type CalendarEventItem = Prisma.CalendarEventGetPayload<{ select: typeof eventSelect }>;

export async function listEvents(userId: string, from: Date, to: Date) {
  if (to.getTime() - from.getTime() > 1000 * 60 * 60 * 24 * 120) throw new ValidationError("Range too large (max 120 days)");
  return db.calendarEvent.findMany({ where: { userId, startAt: { gte: from, lte: to } }, select: eventSelect, orderBy: { startAt: "asc" }, take: 1000 });
}

export async function createEvent(userId: string, input: CreateEventInput) {
  if (input.endAt && input.endAt < input.startAt) throw new ValidationError("End must be after start", { endAt: "End must be after start" });
  if (input.courseId) {
    const c = await db.course.findFirst({ where: { id: input.courseId, userId, deletedAt: null }, select: { id: true } });
    if (!c) throw new NotFoundError("Course");
  }
  return db.calendarEvent.create({
    data: { userId, title: input.title, description: input.description || null, type: input.type, startAt: input.startAt, endAt: input.endAt ?? null, allDay: input.allDay, location: input.location || null, courseId: input.courseId ?? null, source: "MANUAL" },
    select: eventSelect,
  });
}

export async function updateEvent(userId: string, eventId: string, input: UpdateEventInput) {
  const existing = await db.calendarEvent.findFirst({ where: { id: eventId, userId }, select: { id: true, taskId: true, studySessionId: true, startAt: true, endAt: true } });
  if (!existing) throw new NotFoundError("Event");
  const startAt = input.startAt ?? existing.startAt;
  const endAt = input.endAt === undefined ? existing.endAt : input.endAt;
  if (endAt && endAt < startAt) throw new ValidationError("End must be after start", { endAt: "End must be after start" });

  const event = await db.calendarEvent.update({
    where: { id: eventId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.location !== undefined ? { location: input.location || null } : {}),
      ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
      ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
      startAt,
      endAt,
    },
    select: eventSelect,
  });

  // Moving a deadline event moves the task deadline; moving a study session moves the session.
  if (existing.taskId && input.startAt) await db.task.updateMany({ where: { id: existing.taskId, userId }, data: { dueDate: startAt } });
  if (existing.studySessionId && (input.startAt || input.endAt !== undefined)) {
    await db.studySession.updateMany({ where: { id: existing.studySessionId, userId }, data: { startAt, ...(endAt ? { endAt } : {}) } });
  }
  return event;
}

export async function deleteEvent(userId: string, eventId: string) {
  const existing = await db.calendarEvent.findFirst({ where: { id: eventId, userId }, select: { id: true, taskId: true, studySessionId: true } });
  if (!existing) throw new NotFoundError("Event");
  if (existing.taskId) throw new ValidationError("Deadline events are managed from the task", { event: "Change or remove the deadline on the task instead." });
  if (existing.studySessionId) {
    await db.studySession.delete({ where: { id: existing.studySessionId } });
    return;
  }
  await db.calendarEvent.delete({ where: { id: eventId } });
}
