import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { CreateCourseInput, UpdateCourseInput } from "@/server/courses/schemas";
import type { Prisma } from "@/generated/prisma/client";

const nullIfEmpty = (v: string | undefined | null) => (v ? v : null);

export const courseListSelect = {
  id: true,
  name: true,
  code: true,
  instructor: true,
  color: true,
  icon: true,
  isActive: true,
  targetGrade: true,
  credits: true,
  source: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CourseSelect;

export interface CourseSummary {
  id: string;
  name: string;
  code: string | null;
  instructor: string | null;
  color: string;
  icon: string;
  isActive: boolean;
  targetGrade: number | null;
  openTasks: number;
  completedTasks: number;
  totalTasks: number;
  progress: number;
  nextDeadline: { id: string; title: string; dueDate: Date } | null;
}

/** Course cards for the dashboard and courses index — one query per table, no N+1. */
export async function listCoursesWithSummary(userId: string, options: { includeInactive?: boolean } = {}): Promise<CourseSummary[]> {
  const courses = await db.course.findMany({
    where: { userId, deletedAt: null, ...(options.includeInactive ? {} : { isActive: true }) },
    select: courseListSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  if (courses.length === 0) return [];

  const courseIds = courses.map((c) => c.id);
  const [counts, nextTasks] = await Promise.all([
    db.task.groupBy({
      by: ["courseId", "status"],
      where: { userId, deletedAt: null, courseId: { in: courseIds }, status: { not: "ARCHIVED" } },
      _count: { _all: true },
    }),
    db.task.findMany({
      where: {
        userId,
        deletedAt: null,
        courseId: { in: courseIds },
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        dueDate: { gte: new Date(Date.now() - 24 * 36e5) },
      },
      select: { id: true, title: true, dueDate: true, courseId: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const nextByCourse = new Map<string, { id: string; title: string; dueDate: Date }>();
  for (const t of nextTasks) {
    if (t.courseId && t.dueDate && !nextByCourse.has(t.courseId)) nextByCourse.set(t.courseId, { id: t.id, title: t.title, dueDate: t.dueDate });
  }

  return courses.map((c) => {
    const rows = counts.filter((r) => r.courseId === c.id);
    const completed = rows.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r._count._all, 0);
    const total = rows.reduce((s, r) => s + r._count._all, 0);
    return {
      ...c,
      openTasks: total - completed,
      completedTasks: completed,
      totalTasks: total,
      progress: total === 0 ? 0 : Math.round((completed / total) * 100),
      nextDeadline: nextByCourse.get(c.id) ?? null,
    };
  });
}

export async function getCourse(userId: string, courseId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, userId, deletedAt: null },
    include: {
      term: true,
      institution: { select: { id: true, name: true } },
      gradeCategories: { orderBy: { sortOrder: "asc" } },
      announcements: { orderBy: { postedAt: "desc" }, take: 20 },
    },
  });
  if (!course) throw new NotFoundError("Course");
  return course;
}

export async function createCourse(userId: string, input: CreateCourseInput) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { institutionId: true } });
  const course = await db.course.create({
    data: {
      userId,
      institutionId: user?.institutionId ?? null,
      termId: input.termId ?? null,
      name: input.name,
      code: nullIfEmpty(input.code),
      instructor: nullIfEmpty(input.instructor),
      instructorEmail: nullIfEmpty(input.instructorEmail),
      description: nullIfEmpty(input.description),
      color: input.color,
      icon: input.icon,
      credits: input.credits ?? null,
      targetGrade: input.targetGrade ?? null,
      enrollments: { create: { userId } },
    },
  });
  return course;
}

export async function updateCourse(userId: string, courseId: string, input: UpdateCourseInput) {
  const existing = await db.course.findFirst({ where: { id: courseId, userId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError("Course");
  return db.course.update({
    where: { id: courseId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: nullIfEmpty(input.code) } : {}),
      ...(input.instructor !== undefined ? { instructor: nullIfEmpty(input.instructor) } : {}),
      ...(input.instructorEmail !== undefined ? { instructorEmail: nullIfEmpty(input.instructorEmail) } : {}),
      ...(input.description !== undefined ? { description: nullIfEmpty(input.description) } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.credits !== undefined ? { credits: input.credits } : {}),
      ...(input.targetGrade !== undefined ? { targetGrade: input.targetGrade } : {}),
      ...(input.termId !== undefined ? { termId: input.termId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

/** Soft delete: the course and its tasks disappear from the UI but remain restorable. */
export async function deleteCourse(userId: string, courseId: string) {
  const existing = await db.course.findFirst({ where: { id: courseId, userId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError("Course");
  const now = new Date();
  await db.$transaction([
    db.course.update({ where: { id: courseId }, data: { deletedAt: now, isActive: false } }),
    db.task.updateMany({ where: { courseId, userId, deletedAt: null }, data: { deletedAt: now } }),
  ]);
}

export async function setGradeCategories(
  userId: string,
  courseId: string,
  categories: { id?: string; name: string; weight: number; dropLowest: number }[],
) {
  const course = await db.course.findFirst({ where: { id: courseId, userId, deletedAt: null }, select: { id: true } });
  if (!course) throw new NotFoundError("Course");

  const keepIds = categories.map((c) => c.id).filter((id): id is string => Boolean(id));
  await db.$transaction(async (tx) => {
    await tx.gradeCategory.deleteMany({ where: { courseId, id: { notIn: keepIds } } });
    for (const [i, c] of categories.entries()) {
      if (c.id) {
        await tx.gradeCategory.update({ where: { id: c.id }, data: { name: c.name, weight: c.weight, dropLowest: c.dropLowest, sortOrder: i } });
      } else {
        await tx.gradeCategory.create({ data: { courseId, name: c.name, weight: c.weight, dropLowest: c.dropLowest, sortOrder: i } });
      }
    }
  });
  return db.gradeCategory.findMany({ where: { courseId }, orderBy: { sortOrder: "asc" } });
}

/** Lightweight list for selects/filters. */
export async function listCourseOptions(userId: string) {
  return db.course.findMany({
    where: { userId, deletedAt: null, isActive: true },
    select: { id: true, name: true, code: true, color: true, icon: true },
    orderBy: { name: "asc" },
  });
}
