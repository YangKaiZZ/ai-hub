import { addDays, addMinutes, differenceInMinutes, format, getDay, isBefore, startOfDay } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getAIProvider, logAIUsage } from "@/server/ai/provider";
import { STUDY_PLAN_SYSTEM } from "@/server/ai/prompts";
import { studyPlanOutputSchema, type StudyPlanOutput } from "@/server/ai/intelligence/schemas";
import { notify } from "@/server/notifications/service";
import type { StudySessionType } from "@/generated/prisma/enums";

export interface StudyPreferences {
  preferredStartHour: number;
  preferredEndHour: number;
  sessionMinutes: number;
  breakMinutes: number;
  studyDays: number[];
  dailyMaxMinutes: number;
}

export const DEFAULT_STUDY_PREFERENCES: StudyPreferences = {
  preferredStartHour: 18,
  preferredEndHour: 22,
  sessionMinutes: 45,
  breakMinutes: 10,
  studyDays: [0, 1, 2, 3, 4, 5, 6],
  dailyMaxMinutes: 180,
};

export const proposePlanSchema = z.object({
  days: z.coerce.number().int().min(1).max(14).default(7),
  startDate: z.coerce.date().optional(),
  focusTaskIds: z.array(z.string().uuid()).max(10).optional(),
  notes: z.string().max(500).optional(),
  /** Per-request override of stored preferences. */
  preferences: z
    .object({
      preferredStartHour: z.number().int().min(0).max(23),
      preferredEndHour: z.number().int().min(1).max(24),
      sessionMinutes: z.number().int().min(15).max(180),
      breakMinutes: z.number().int().min(0).max(60).default(10),
      studyDays: z.array(z.number().int().min(0).max(6)).min(1),
      dailyMaxMinutes: z.number().int().min(30).max(720),
    })
    .partial()
    .optional(),
});
export type ProposePlanInput = z.infer<typeof proposePlanSchema>;

export const updateSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  type: z.enum(["REVIEW", "PRACTICE", "ASSIGNMENT_WORK", "FLASHCARDS", "READING", "BREAK"]).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  completed: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export async function getStudyPreferences(userId: string): Promise<StudyPreferences> {
  const pref = await db.userPreference.findUnique({ where: { userId }, select: { studyPreferences: true } });
  return { ...DEFAULT_STUDY_PREFERENCES, ...((pref?.studyPreferences as Partial<StudyPreferences> | null) ?? {}) };
}

const planInclude = { sessions: { orderBy: { startAt: "asc" as const }, include: { task: { select: { id: true, title: true } }, course: { select: { id: true, name: true, color: true } } } } };

export async function listPlans(userId: string) {
  return db.studyPlan.findMany({ where: { userId }, include: planInclude, orderBy: { createdAt: "desc" }, take: 10 });
}

export async function getPlan(userId: string, planId: string) {
  const plan = await db.studyPlan.findFirst({ where: { id: planId, userId }, include: planInclude });
  if (!plan) throw new NotFoundError("Study plan");
  return plan;
}

export type StudyPlanDetail = Awaited<ReturnType<typeof getPlan>>;

/**
 * Build a plan proposal. Uses the AI provider for the schedule; falls back to a
 * deterministic greedy scheduler if the AI is unavailable or returns an
 * unusable plan. Nothing touches the calendar until `confirmPlan`.
 */
export async function proposeStudyPlan(userId: string, input: ProposePlanInput) {
  const prefs = { ...(await getStudyPreferences(userId)), ...(input.preferences ?? {}) };
  const start = startOfDay(input.startDate ?? new Date());
  const end = addDays(start, input.days);

  const [tasks, events, user] = await Promise.all([
    db.task.findMany({
      where: { userId, deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, ...(input.focusTaskIds?.length ? { id: { in: input.focusTaskIds } } : {}) },
      orderBy: [{ priorityScore: "desc" }, { dueDate: "asc" }],
      take: 25,
      select: { id: true, title: true, type: true, priority: true, priorityScore: true, progress: true, estimatedMinutes: true, dueDate: true, course: { select: { id: true, name: true } } },
    }),
    db.calendarEvent.findMany({ where: { userId, startAt: { gte: start, lt: end }, type: { not: "STUDY_SESSION" } }, select: { title: true, startAt: true, endAt: true, allDay: true, type: true } }),
    db.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
  ]);

  if (tasks.length === 0) {
    throw new ValidationError("No open tasks to plan around.", { tasks: "Add at least one task with a deadline first." });
  }

  const context = {
    today: format(start, "yyyy-MM-dd"),
    planFrom: format(start, "yyyy-MM-dd"),
    planTo: format(addDays(end, -1), "yyyy-MM-dd"),
    timezone: user?.timezone ?? "UTC",
    preferences: prefs,
    notes: input.notes ?? null,
    tasks: tasks.map((t) => ({ taskId: t.id, courseId: t.course?.id ?? null, course: t.course?.name ?? null, title: t.title, type: t.type, priority: t.priority, progress: t.progress, remainingMinutes: t.estimatedMinutes ? Math.round(t.estimatedMinutes * (1 - t.progress / 100)) : 60, dueDate: t.dueDate ? t.dueDate.toISOString() : null })),
    commitments: events.filter((e) => !e.allDay && e.endAt).map((e) => ({ title: e.title, type: e.type, start: e.startAt.toISOString(), end: e.endAt!.toISOString() })),
  };

  let output: StudyPlanOutput | null = null;
  const provider = getAIProvider();
  const started = Date.now();
  try {
    const res = await provider.structured({
      feature: "study-plan",
      userId,
      system: STUDY_PLAN_SYSTEM,
      messages: [{ role: "user", content: `<student_context>\n${JSON.stringify(context, null, 1)}\n</student_context>\n\nCreate the study plan for ${context.planFrom} to ${context.planTo}.` }],
      schema: studyPlanOutputSchema,
      schemaName: "study_plan",
      effort: "medium",
      maxTokens: 6000,
    });
    void logAIUsage({ userId, feature: "study-plan", provider: provider.name, model: res.model, usage: res.usage, latencyMs: Date.now() - started });
    output = res.data;
  } catch (err) {
    logger.warn("planner", "AI plan failed, using fallback scheduler", { error: String(err) });
  }

  let sessions = output ? sanitizeSessions(output.sessions, start, end, context.commitments, new Set(tasks.map((t) => t.id))) : [];
  let rationale = output?.rationale ?? "";
  let title = output?.title ?? "";
  if (sessions.length === 0 || provider.name === "mock") {
    const fallback = greedySchedule(tasks, prefs, start, end, context.commitments);
    if (fallback.sessions.length === 0) {
      throw new ValidationError("No free study time in this range.", { availability: "Widen your study window or add study days." });
    }
    sessions = fallback.sessions;
    rationale = fallback.rationale;
    title = fallback.title;
  }

  // Replace any earlier unconfirmed proposal so the planner shows one draft at a time.
  await db.studyPlan.deleteMany({ where: { userId, status: "PROPOSED" } });

  const courseByTask = new Map(tasks.map((t) => [t.id, t.course?.id ?? null]));
  const plan = await db.studyPlan.create({
    data: {
      userId,
      title: title || `Plan for ${format(start, "MMM d")} – ${format(addDays(end, -1), "MMM d")}`,
      startDate: start,
      endDate: end,
      status: "PROPOSED",
      rationale,
      inputs: { days: input.days, preferences: prefs, focusTaskIds: input.focusTaskIds ?? [], notes: input.notes ?? null, provider: provider.name },
      sessions: {
        create: sessions.map((s) => ({
          userId,
          title: s.title,
          type: s.type,
          startAt: s.startAt,
          endAt: s.endAt,
          taskId: s.taskId,
          courseId: s.courseId ?? (s.taskId ? courseByTask.get(s.taskId) ?? null : null),
          notes: s.note,
        })),
      },
    },
    include: planInclude,
  });
  return plan;
}

interface PlannedSession {
  title: string;
  type: StudySessionType;
  startAt: Date;
  endAt: Date;
  taskId: string | null;
  courseId: string | null;
  note: string | null;
}

function overlaps(a: { startAt: Date; endAt: Date }, b: { start: string; end: string }) {
  const bs = new Date(b.start).getTime();
  const be = new Date(b.end).getTime();
  return a.startAt.getTime() < be && a.endAt.getTime() > bs;
}

function sanitizeSessions(sessions: StudyPlanOutput["sessions"], start: Date, end: Date, commitments: { start: string; end: string }[], validTaskIds: Set<string>): PlannedSession[] {
  const out: PlannedSession[] = [];
  for (const s of sessions) {
    const startAt = new Date(`${s.date}T${s.startTime}:00`);
    const endAt = new Date(`${s.date}T${s.endTime}:00`);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) continue;
    if (isBefore(startAt, start) || !isBefore(startAt, end) || !isBefore(startAt, endAt)) continue;
    if (differenceInMinutes(endAt, startAt) > 240) continue;
    if (commitments.some((c) => overlaps({ startAt, endAt }, c))) continue;
    if (out.some((o) => o.startAt < endAt && o.endAt > startAt)) continue;
    out.push({ title: s.title.slice(0, 120), type: s.type, startAt, endAt, taskId: s.taskId && validTaskIds.has(s.taskId) ? s.taskId : null, courseId: s.courseId, note: s.note });
  }
  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Deterministic scheduler: fills the study window day by day, nearest/highest-priority tasks first. */
export function greedySchedule(
  tasks: { id: string; title: string; type: string; priorityScore: number; progress: number; estimatedMinutes: number | null; dueDate: Date | null; course: { id: string; name: string } | null }[],
  prefs: StudyPreferences,
  start: Date,
  end: Date,
  commitments: { start: string; end: string }[],
): { sessions: PlannedSession[]; rationale: string; title: string } {
  const remaining = new Map(tasks.map((t) => [t.id, Math.max(30, Math.round((t.estimatedMinutes ?? 60) * (1 - t.progress / 100)))]));
  const sessions: PlannedSession[] = [];
  const now = new Date();

  for (let day = start; isBefore(day, end); day = addDays(day, 1)) {
    if (!prefs.studyDays.includes(getDay(day))) continue;
    let cursor = new Date(day);
    cursor.setHours(prefs.preferredStartHour, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(prefs.preferredEndHour, 0, 0, 0);
    if (isBefore(cursor, now) && format(day, "yyyy-MM-dd") === format(now, "yyyy-MM-dd")) {
      cursor = addMinutes(now, 15 - (now.getMinutes() % 15));
    }
    let usedToday = 0;

    // Candidate tasks: not yet finished planning, due on/after this day (or overdue), sorted by due then priority.
    const candidates = tasks
      .filter((t) => (remaining.get(t.id) ?? 0) > 0)
      .filter((t) => !t.dueDate || t.dueDate >= startOfDay(day) || t.dueDate < now)
      .sort((a, b) => {
        const ad = a.dueDate?.getTime() ?? Infinity;
        const bd = b.dueDate?.getTime() ?? Infinity;
        return ad !== bd ? ad - bd : b.priorityScore - a.priorityScore;
      });

    for (const t of candidates) {
      if (usedToday >= prefs.dailyMaxMinutes) break;
      const left = remaining.get(t.id)!;
      const length = Math.min(prefs.sessionMinutes, left, prefs.dailyMaxMinutes - usedToday);
      if (length < 15) continue;
      let startAt = cursor;
      let endAt = addMinutes(startAt, length);
      // Skip commitments.
      let guard = 0;
      while (commitments.some((c) => overlaps({ startAt, endAt }, c)) && guard++ < 10) {
        const blocking = commitments.filter((c) => overlaps({ startAt, endAt }, c)).sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0]!;
        startAt = addMinutes(new Date(blocking.end), 5);
        endAt = addMinutes(startAt, length);
      }
      if (!isBefore(endAt, addMinutes(dayEnd, 1))) break;

      sessions.push({
        title: `${t.course ? `${t.course.name}: ` : ""}${t.title}`,
        type: t.type === "EXAM" || t.type === "QUIZ" ? "REVIEW" : t.type === "READING" ? "READING" : "ASSIGNMENT_WORK",
        startAt,
        endAt,
        taskId: t.id,
        courseId: t.course?.id ?? null,
        note: t.dueDate ? `Due ${format(t.dueDate, "EEE MMM d")}` : null,
      });
      remaining.set(t.id, left - length);
      usedToday += length;
      cursor = addMinutes(endAt, prefs.breakMinutes);
      if (prefs.breakMinutes > 0 && usedToday < prefs.dailyMaxMinutes) {
        sessions.push({ title: "Break", type: "BREAK", startAt: endAt, endAt: cursor, taskId: null, courseId: null, note: null });
      }
    }
    // Drop a trailing break.
    const last = sessions[sessions.length - 1];
    if (last?.type === "BREAK" && format(last.startAt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")) sessions.pop();
  }

  const first = tasks[0];
  return {
    sessions,
    title: `Plan for ${format(start, "MMM d")} – ${format(addDays(end, -1), "MMM d")}`,
    rationale: `Sessions run ${prefs.preferredStartHour}:00–${prefs.preferredEndHour}:00 on your study days in ${prefs.sessionMinutes}-minute blocks with ${prefs.breakMinutes}-minute breaks, up to ${prefs.dailyMaxMinutes} minutes a day. ${first ? `“${first.title}” comes first because it is your highest priority${first.dueDate ? ` and is due ${format(first.dueDate, "EEE, MMM d")}` : ""}.` : ""} Longer tasks are spread across several days so nothing is left to the last evening.`,
  };
}

/** Confirm a proposal: activate it and publish its sessions to the calendar. */
export async function confirmPlan(userId: string, planId: string) {
  const plan = await getPlan(userId, planId);
  if (plan.status !== "PROPOSED") return plan;

  await db.$transaction(async (tx) => {
    // Retire overlapping active plans and their remaining sessions.
    const previous = await tx.studyPlan.findMany({ where: { userId, status: "ACTIVE", endDate: { gt: plan.startDate }, startDate: { lt: plan.endDate } }, select: { id: true } });
    for (const p of previous) {
      await tx.calendarEvent.deleteMany({ where: { userId, studySession: { planId: p.id, completedAt: null } } });
      await tx.studySession.deleteMany({ where: { planId: p.id, completedAt: null, startAt: { gte: new Date() } } });
      await tx.studyPlan.update({ where: { id: p.id }, data: { status: "COMPLETED" } });
    }
    await tx.studyPlan.update({ where: { id: plan.id }, data: { status: "ACTIVE", confirmedAt: new Date() } });
    for (const s of plan.sessions) {
      if (s.type === "BREAK") continue;
      await tx.calendarEvent.create({ data: { userId, studySessionId: s.id, taskId: s.taskId, courseId: s.courseId, title: s.title, type: "STUDY_SESSION", startAt: s.startAt, endAt: s.endAt, source: "MANUAL" } });
    }
  });

  await notify(userId, "STUDY_SESSION", "Study plan confirmed", `${plan.sessions.filter((s) => s.type !== "BREAK").length} sessions were added to your calendar.`, { href: "/calendar" });
  return getPlan(userId, planId);
}

export async function discardPlan(userId: string, planId: string) {
  const plan = await db.studyPlan.findFirst({ where: { id: planId, userId }, select: { id: true, status: true } });
  if (!plan) throw new NotFoundError("Study plan");
  if (plan.status === "PROPOSED") {
    await db.studyPlan.delete({ where: { id: plan.id } });
  } else {
    await db.$transaction([
      db.calendarEvent.deleteMany({ where: { userId, studySession: { planId: plan.id } } }),
      db.studyPlan.update({ where: { id: plan.id }, data: { status: "DISCARDED" } }),
    ]);
  }
}

export async function updateSession(userId: string, sessionId: string, input: z.infer<typeof updateSessionSchema>) {
  const session = await db.studySession.findFirst({ where: { id: sessionId, userId }, include: { calendarEvent: { select: { id: true } } } });
  if (!session) throw new NotFoundError("Study session");
  const startAt = input.startAt ?? session.startAt;
  const endAt = input.endAt ?? session.endAt;
  if (!isBefore(startAt, endAt)) throw new ValidationError("Session must end after it starts", { endAt: "End must be after start" });

  const updated = await db.studySession.update({
    where: { id: session.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      startAt,
      endAt,
      ...(input.completed !== undefined ? { completedAt: input.completed ? new Date() : null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
  if (session.calendarEvent) {
    await db.calendarEvent.update({ where: { id: session.calendarEvent.id }, data: { title: updated.title, startAt, endAt } });
  }
  return updated;
}

export async function deleteSession(userId: string, sessionId: string) {
  const session = await db.studySession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
  if (!session) throw new NotFoundError("Study session");
  await db.studySession.delete({ where: { id: session.id } }); // cascades to its calendar event
}
