import { differenceInCalendarDays, differenceInHours } from "date-fns";
import { db } from "@/lib/db";
import { formatMinutes } from "@/lib/utils";

export interface Recommendation {
  id: string;
  kind: "study" | "priority" | "deadline" | "progress" | "grade" | "habit";
  text: string;
  href?: string;
  /** For dedupe/analytics. */
  reason: string;
}

/**
 * Deterministic, explainable recommendations derived from the student's data.
 * They are cheap, run on every dashboard load, and never require the AI
 * provider. The AI agent can build richer plans on top of the same signals.
 */
export async function getRecommendations(userId: string, now = new Date(), limit = 4): Promise<Recommendation[]> {
  const openTasks = await db.task.findMany({
    where: { userId, deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
    select: {
      id: true,
      title: true,
      dueDate: true,
      progress: true,
      estimatedMinutes: true,
      priorityScore: true,
      priority: true,
      type: true,
      course: { select: { id: true, name: true } },
    },
    orderBy: [{ priorityScore: "desc" }, { dueDate: "asc" }],
    take: 50,
  });

  const recs: Recommendation[] = [];
  if (openTasks.length === 0) {
    recs.push({
      id: "empty",
      kind: "habit",
      text: "You have no open tasks. Add your courses and upcoming assignments so AI Hub can plan your week.",
      href: "/tasks?new=1",
      reason: "no-open-tasks",
    });
    return recs;
  }

  const top = openTasks[0]!;
  recs.push({
    id: `priority-${top.id}`,
    kind: "priority",
    text: `${top.course ? `Your ${top.course.name} ` : "Your "}${top.type === "EXAM" ? "exam prep" : `“${top.title}”`} is your highest priority${top.dueDate ? ` — ${describeDue(top.dueDate, now)}` : ""}.`,
    href: `/tasks/${top.id}`,
    reason: "top-priority",
  });

  const within5 = openTasks.filter((t) => t.dueDate && differenceInCalendarDays(t.dueDate, now) >= 0 && differenceInCalendarDays(t.dueDate, now) <= 5);
  if (within5.length >= 2) {
    recs.push({
      id: "deadlines-5d",
      kind: "deadline",
      text: `You have ${within5.length} deadlines within the next 5 days. Start with the shortest one to build momentum.`,
      href: "/tasks?filter=week",
      reason: "cluster-deadlines",
    });
  }

  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < now);
  if (overdue.length > 0) {
    const first = overdue[0]!;
    recs.push({
      id: `overdue-${first.id}`,
      kind: "deadline",
      text: `“${first.title}” is overdue${overdue.length > 1 ? ` along with ${overdue.length - 1} other task${overdue.length > 2 ? "s" : ""}` : ""}. Decide today whether to finish it or archive it.`,
      href: "/tasks?filter=overdue",
      reason: "overdue",
    });
  }

  // Suggest a concrete study block for an untouched task due soon.
  const untouched = openTasks.find((t) => t.progress === 0 && t.dueDate && differenceInHours(t.dueDate, now) <= 96 && t.id !== top.id) ?? openTasks.find((t) => t.progress === 0 && t.id !== top.id);
  if (untouched) {
    const block = suggestBlock(untouched.estimatedMinutes);
    recs.push({
      id: `study-${untouched.id}`,
      kind: "study",
      text: `Study ${untouched.course?.name ?? untouched.title} for ${formatMinutes(block)} today — you have not started “${untouched.title}” yet.`,
      href: `/tasks/${untouched.id}`,
      reason: "untouched-task",
    });
  }

  // Nearly-finished task nudge.
  const nearlyDone = openTasks.find((t) => t.progress >= 75 && t.progress < 100);
  if (nearlyDone) {
    recs.push({
      id: `finish-${nearlyDone.id}`,
      kind: "progress",
      text: `“${nearlyDone.title}” is ${nearlyDone.progress}% done. A short session could close it out.`,
      href: `/tasks/${nearlyDone.id}`,
      reason: "nearly-done",
    });
  }

  return recs.slice(0, limit);
}

function describeDue(due: Date, now: Date) {
  const days = differenceInCalendarDays(due, now);
  if (days < 0) return "it is overdue";
  if (days === 0) return "it is due today";
  if (days === 1) return "it is due tomorrow";
  return `it is due in ${days} days`;
}

function suggestBlock(estimatedMinutes: number | null) {
  if (!estimatedMinutes) return 45;
  if (estimatedMinutes <= 60) return Math.max(25, estimatedMinutes);
  if (estimatedMinutes <= 180) return 60;
  return 90;
}
