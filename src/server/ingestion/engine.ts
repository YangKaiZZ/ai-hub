import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { analyzeNormalizedTask } from "@/server/ai/intelligence/service";
import { COURSE_COLORS, COURSE_ICONS } from "@/server/courses/schemas";
import type { IngestionResult, NormalizedAnnouncement, NormalizedCourse, NormalizedGrade, NormalizedTask } from "@/server/ingestion/types";
import { notify } from "@/server/notifications/service";
import { calculatePriority } from "@/server/tasks/priority";
import { mapTaskTypeToEvent } from "@/server/tasks/service";
import type { DataSource } from "@/generated/prisma/enums";

/**
 * Task Ingestion Engine. Every external source (LMS providers, CSV, calendar,
 * email, API, extension) hands normalized records to this engine, which:
 *  - upserts courses and tasks idempotently on (userId, source, externalId)
 *  - never overwrites student edits to progress/status/importance
 *  - runs Task Intelligence on newly created tasks (best-effort)
 *  - links grades/announcements to the right course
 *  - emits notifications for new tasks
 */
export class TaskIngestionEngine {
  constructor(
    private readonly userId: string,
    private readonly options: { analyze?: boolean; notifyNewTasks?: boolean } = {},
  ) {}

  async ingest(payload: { courses?: NormalizedCourse[]; tasks?: NormalizedTask[]; grades?: NormalizedGrade[]; announcements?: NormalizedAnnouncement[] }): Promise<IngestionResult> {
    const result: IngestionResult = { coursesCreated: 0, coursesUpdated: 0, tasksCreated: 0, tasksUpdated: 0, gradesImported: 0, announcementsImported: 0, errors: [] };
    const courseIdByExternal = new Map<string, string>();

    for (const c of payload.courses ?? []) {
      try {
        const { id, created } = await this.upsertCourse(c);
        courseIdByExternal.set(`${c.source}:${c.externalId}`, id);
        if (created) result.coursesCreated++;
        else result.coursesUpdated++;
      } catch (err) {
        result.errors.push(`course ${c.externalId}: ${String(err)}`);
      }
    }

    for (const t of payload.tasks ?? []) {
      try {
        const { created } = await this.upsertTask(t, courseIdByExternal);
        if (created) result.tasksCreated++;
        else result.tasksUpdated++;
      } catch (err) {
        result.errors.push(`task ${t.externalId}: ${String(err)}`);
      }
    }

    for (const g of payload.grades ?? []) {
      try {
        if (await this.upsertGrade(g, courseIdByExternal)) result.gradesImported++;
      } catch (err) {
        result.errors.push(`grade ${g.externalId}: ${String(err)}`);
      }
    }

    for (const a of payload.announcements ?? []) {
      try {
        if (await this.upsertAnnouncement(a, courseIdByExternal)) result.announcementsImported++;
      } catch (err) {
        result.errors.push(`announcement ${a.externalId}: ${String(err)}`);
      }
    }

    logger.info("ingestion", "ingest complete", { userId: this.userId, ...result, errors: result.errors.length });
    return result;
  }

  private async resolveCourseId(source: DataSource, course: NormalizedTask["course"], map: Map<string, string>): Promise<string | null> {
    if (!course) return null;
    if (course.externalId) {
      const mapped = map.get(`${source}:${course.externalId}`);
      if (mapped) return mapped;
      const existing = await db.course.findFirst({ where: { userId: this.userId, source, externalId: course.externalId, deletedAt: null }, select: { id: true } });
      if (existing) return existing.id;
    }
    // Fall back to name matching so CSV/email imports attach to existing courses.
    const byName = await db.course.findFirst({ where: { userId: this.userId, deletedAt: null, OR: [{ name: { equals: course.name, mode: "insensitive" } }, ...(course.code ? [{ code: { equals: course.code, mode: "insensitive" as const } }] : [])] }, select: { id: true } });
    if (byName) return byName.id;
    const created = await this.upsertCourse({ externalId: course.externalId ?? `name:${course.name.toLowerCase()}`, source, name: course.name, code: course.code ?? null });
    if (course.externalId) map.set(`${source}:${course.externalId}`, created.id);
    return created.id;
  }

  private async upsertCourse(c: NormalizedCourse): Promise<{ id: string; created: boolean }> {
    const existing = await db.course.findFirst({ where: { userId: this.userId, source: c.source, externalId: c.externalId }, select: { id: true, deletedAt: true } });
    if (existing) {
      await db.course.update({ where: { id: existing.id }, data: { name: c.name, code: c.code ?? undefined, instructor: c.instructor ?? undefined, instructorEmail: c.instructorEmail ?? undefined, externalUrl: c.url ?? undefined, ...(existing.deletedAt ? { deletedAt: null, isActive: true } : {}) } });
      return { id: existing.id, created: false };
    }
    const count = await db.course.count({ where: { userId: this.userId } });
    const user = await db.user.findUnique({ where: { id: this.userId }, select: { institutionId: true } });
    const course = await db.course.create({
      data: {
        userId: this.userId,
        institutionId: user?.institutionId ?? null,
        source: c.source,
        externalId: c.externalId,
        externalUrl: c.url ?? null,
        name: c.name,
        code: c.code ?? null,
        instructor: c.instructor ?? null,
        instructorEmail: c.instructorEmail ?? null,
        color: COURSE_COLORS[count % COURSE_COLORS.length]!,
        icon: COURSE_ICONS[count % COURSE_ICONS.length]!,
        enrollments: { create: { userId: this.userId } },
      },
      select: { id: true },
    });
    return { id: course.id, created: true };
  }

  private async upsertTask(t: NormalizedTask, map: Map<string, string>): Promise<{ id: string; created: boolean }> {
    const courseId = await this.resolveCourseId(t.source, t.course, map);
    const existing = await db.task.findFirst({ where: { userId: this.userId, source: t.source, externalId: t.externalId }, select: { id: true, deletedAt: true, title: true, dueDate: true } });

    if (existing) {
      // Update source-owned fields only; student-owned fields (status, progress, importance, priorityLocked) are preserved.
      await db.task.update({
        where: { id: existing.id },
        data: {
          title: t.title,
          description: t.description ?? undefined,
          instructions: t.instructions ?? undefined,
          rubric: t.rubric ?? undefined,
          dueDate: t.dueDate ?? undefined,
          startDate: t.startDate ?? undefined,
          externalUrl: t.url ?? undefined,
          instructor: t.instructor ?? undefined,
          courseId: courseId ?? undefined,
          rawData: t.rawData ? (t.rawData as object) : undefined,
        },
      });
      if (t.dueDate && existing.dueDate?.getTime() !== t.dueDate.getTime()) {
        await db.calendarEvent.updateMany({ where: { taskId: existing.id, userId: this.userId }, data: { startAt: t.dueDate, title: t.title } });
      }
      return { id: existing.id, created: false };
    }

    let analysis: Awaited<ReturnType<typeof analyzeNormalizedTask>> | null = null;
    if (this.options.analyze !== false) {
      try {
        analysis = await analyzeNormalizedTask(this.userId, t);
      } catch (err) {
        logger.warn("ingestion", "analysis skipped", { error: String(err) });
      }
    }
    const estimatedMinutes = analysis?.estimatedMinutes ?? null;
    const importance = analysis?.importance ?? 3;
    const type = t.type ?? analysis?.taskType ?? "ASSIGNMENT";
    const pr = calculatePriority({ dueDate: t.dueDate ?? null, estimatedMinutes, importance, progress: 0, status: "NOT_STARTED" });

    const task = await db.task.create({
      data: {
        userId: this.userId,
        courseId,
        source: t.source,
        externalId: t.externalId,
        externalUrl: t.url ?? null,
        title: t.title,
        description: t.description ?? null,
        instructions: t.instructions ?? null,
        rubric: t.rubric ?? undefined,
        type,
        dueDate: t.dueDate ?? null,
        startDate: t.startDate ?? null,
        instructor: t.instructor ?? null,
        estimatedMinutes,
        importance,
        priority: pr.priority,
        priorityScore: pr.score,
        rawData: t.rawData ? (t.rawData as object) : undefined,
        aiAnalysis: analysis ?? undefined,
        aiAnalyzedAt: analysis ? new Date() : null,
        attachments: t.attachments?.length ? { create: t.attachments.map((a) => ({ name: a.name, url: a.url ?? null, mimeType: a.mimeType ?? null, sizeBytes: a.sizeBytes ?? null })) } : undefined,
        calendarEvents: t.dueDate ? { create: { userId: this.userId, courseId, title: t.title, type: mapTaskTypeToEvent(type), startAt: t.dueDate, source: t.source } } : undefined,
      },
      select: { id: true, title: true, course: { select: { name: true } } },
    });

    if (this.options.notifyNewTasks !== false) {
      await notify(this.userId, "NEW_TASK", `New task: ${task.title}`, task.course ? `Imported for ${task.course.name}` : "Imported", { taskId: task.id, href: `/tasks/${task.id}` });
    }
    return { id: task.id, created: true };
  }

  private async upsertGrade(g: NormalizedGrade, map: Map<string, string>): Promise<boolean> {
    const courseId = map.get(`${g.source}:${g.courseExternalId}`) ?? (await db.course.findFirst({ where: { userId: this.userId, source: g.source, externalId: g.courseExternalId }, select: { id: true } }))?.id;
    if (!courseId) return false;
    const taskId = g.taskExternalId ? (await db.task.findFirst({ where: { userId: this.userId, source: g.source, externalId: g.taskExternalId }, select: { id: true } }))?.id ?? null : null;
    const category = g.category ? await db.gradeCategory.findFirst({ where: { courseId, name: { equals: g.category, mode: "insensitive" } }, select: { id: true } }) : null;
    const existing = await db.grade.findFirst({ where: { userId: this.userId, courseId, source: g.source, externalId: g.externalId }, select: { id: true } });
    if (existing) {
      await db.grade.update({ where: { id: existing.id }, data: { score: g.score, maxScore: g.maxScore, title: g.title, gradedAt: g.gradedAt ?? undefined, taskId, categoryId: category?.id ?? undefined } });
      return false;
    }
    await db.grade.create({ data: { userId: this.userId, courseId, taskId, categoryId: category?.id ?? null, source: g.source, externalId: g.externalId, title: g.title, score: g.score, maxScore: g.maxScore, gradedAt: g.gradedAt ?? new Date() } });
    if (taskId) await db.task.updateMany({ where: { id: taskId, status: { not: "COMPLETED" } }, data: { status: "COMPLETED", progress: 100, completedAt: g.gradedAt ?? new Date() } });
    await notify(this.userId, "GRADE_UPDATE", `New grade: ${g.title}`, `${g.score}/${g.maxScore}`, { href: `/grades?course=${courseId}` });
    return true;
  }

  private async upsertAnnouncement(a: NormalizedAnnouncement, map: Map<string, string>): Promise<boolean> {
    const courseId = map.get(`${a.source}:${a.courseExternalId}`) ?? (await db.course.findFirst({ where: { userId: this.userId, source: a.source, externalId: a.courseExternalId }, select: { id: true } }))?.id;
    if (!courseId) return false;
    const existing = await db.announcement.findFirst({ where: { courseId, source: a.source, externalId: a.externalId }, select: { id: true } });
    if (existing) return false;
    await db.announcement.create({ data: { courseId, source: a.source, externalId: a.externalId, title: a.title, body: a.body, postedAt: a.postedAt, externalUrl: a.url ?? null } });
    return true;
  }
}
