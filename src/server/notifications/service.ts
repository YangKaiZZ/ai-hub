import { db } from "@/lib/db";
import type { NotificationType, Prisma } from "@/generated/prisma/client";

export type NotificationSettings = Record<string, { inApp: boolean; email: boolean }>;

const TYPE_TO_SETTING: Record<NotificationType, string> = {
  NEW_TASK: "newTask",
  DEADLINE_APPROACHING: "deadlineApproaching",
  OVERDUE_TASK: "overdue",
  AI_RECOMMENDATION: "aiRecommendation",
  STUDY_SESSION: "studySession",
  GRADE_UPDATE: "gradeUpdate",
  SYSTEM: "system",
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  newTask: { inApp: true, email: false },
  deadlineApproaching: { inApp: true, email: true },
  overdue: { inApp: true, email: true },
  aiRecommendation: { inApp: true, email: false },
  studySession: { inApp: true, email: false },
  gradeUpdate: { inApp: true, email: false },
  system: { inApp: true, email: true },
};

export async function countUnreadNotifications(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string, limit = 20) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
}

export async function markNotificationRead(userId: string, id: string) {
  await db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

/**
 * Create a notification if the user has that type enabled. Email delivery is
 * left to a scheduled job (see docs/AI_SYSTEM.md → notifications) so request
 * paths stay fast.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  data?: Prisma.InputJsonValue,
) {
  const pref = await db.userPreference.findUnique({ where: { userId }, select: { notificationSettings: true } });
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...((pref?.notificationSettings as NotificationSettings | null) ?? {}) };
  const key = TYPE_TO_SETTING[type];
  if (settings[key] && settings[key].inApp === false) return null;
  return db.notification.create({ data: { userId, type, title, body, data } });
}

/**
 * Generate deadline notifications for tasks due within 48h that have not
 * already been notified today. Idempotent per task per day.
 */
export async function generateDeadlineNotifications(userId: string, now = new Date()) {
  const soon = new Date(now.getTime() + 48 * 36e5);
  const tasks = await db.task.findMany({
    where: {
      userId,
      deletedAt: null,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      dueDate: { lte: soon },
    },
    select: { id: true, title: true, dueDate: true, course: { select: { name: true } } },
  });
  if (tasks.length === 0) return 0;

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const existing = await db.notification.findMany({
    where: { userId, createdAt: { gte: dayStart }, type: { in: ["DEADLINE_APPROACHING", "OVERDUE_TASK"] } },
    select: { data: true },
  });
  const notified = new Set(existing.map((n) => (n.data as { taskId?: string } | null)?.taskId).filter(Boolean));

  let created = 0;
  for (const task of tasks) {
    if (notified.has(task.id) || !task.dueDate) continue;
    const overdue = task.dueDate < now;
    const course = task.course?.name ? `${task.course.name} · ` : "";
    await notify(
      userId,
      overdue ? "OVERDUE_TASK" : "DEADLINE_APPROACHING",
      overdue ? `Overdue: ${task.title}` : `Due soon: ${task.title}`,
      `${course}${overdue ? "This task is past its deadline." : "Due within the next 48 hours."}`,
      { taskId: task.id, href: `/tasks/${task.id}` },
    );
    created += 1;
  }
  return created;
}
