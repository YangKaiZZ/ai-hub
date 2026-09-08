import { addDays, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { listCoursesWithSummary } from "@/server/courses/service";
import { getRecommendations } from "@/server/recommendations/service";
import { getAttentionTasks, getTaskStats, recalculateIfStale } from "@/server/tasks/service";
import { generateDeadlineNotifications } from "@/server/notifications/service";

export async function getDashboardData(userId: string, now = new Date()) {
  // Housekeeping that keeps the dashboard truthful without a background worker.
  await recalculateIfStale(userId);
  void generateDeadlineNotifications(userId, now).catch(() => undefined);

  const [stats, attention, courses, recommendations, upcoming, analyzedCount] = await Promise.all([
    getTaskStats(userId, now),
    getAttentionTasks(userId, 4),
    listCoursesWithSummary(userId),
    getRecommendations(userId, now),
    db.calendarEvent.findMany({
      where: { userId, startAt: { gte: startOfDay(now), lte: addDays(now, 10) } },
      select: { id: true, title: true, type: true, startAt: true, endAt: true, allDay: true, taskId: true, course: { select: { name: true, color: true } } },
      orderBy: { startAt: "asc" },
      take: 8,
    }),
    db.task.count({ where: { userId, deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, aiAnalyzedAt: { not: null } } }),
  ]);

  return { stats, attention, courses, recommendations, upcoming, analyzedCount };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
