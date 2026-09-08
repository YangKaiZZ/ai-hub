import { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requiredForTarget, summarizeCourse, type CourseGradeSummary } from "@/server/grades/calculator";
import { notify } from "@/server/notifications/service";

export const createGradeSchema = z.object({
  courseId: z.string().uuid(),
  categoryId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(160),
  score: z.coerce.number().min(0).max(100000),
  maxScore: z.coerce.number().positive().max(100000),
  gradedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")).nullable(),
});
export const updateGradeSchema = createGradeSchema.partial().omit({ courseId: true });

export type CreateGradeInput = z.infer<typeof createGradeSchema>;
export type UpdateGradeInput = z.infer<typeof updateGradeSchema>;

export interface CourseGradeReport {
  course: { id: string; name: string; code: string | null; color: string; icon: string; targetGrade: number | null };
  summary: CourseGradeSummary;
  required: { needed: number; achievable: boolean } | null;
  grades: Array<{ id: string; title: string; score: number; maxScore: number; percent: number; gradedAt: Date; categoryId: string | null; categoryName: string | null; taskId: string | null; notes: string | null }>;
  categories: Array<{ id: string; name: string; weight: number; dropLowest: number }>;
}

export async function getCourseGradeReport(userId: string, courseId: string): Promise<CourseGradeReport> {
  const course = await db.course.findFirst({
    where: { id: courseId, userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      code: true,
      color: true,
      icon: true,
      targetGrade: true,
      gradeCategories: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, weight: true, dropLowest: true } },
      grades: { orderBy: { gradedAt: "desc" }, select: { id: true, title: true, score: true, maxScore: true, gradedAt: true, categoryId: true, taskId: true, notes: true } },
    },
  });
  if (!course) throw new NotFoundError("Course");

  const summary = summarizeCourse(course.gradeCategories, course.grades);
  const catName = new Map(course.gradeCategories.map((c) => [c.id, c.name]));
  return {
    course: { id: course.id, name: course.name, code: course.code, color: course.color, icon: course.icon, targetGrade: course.targetGrade },
    summary,
    required: course.targetGrade != null ? requiredForTarget(summary, course.targetGrade) : null,
    grades: course.grades.map((g) => ({ ...g, percent: Math.round((g.score / g.maxScore) * 1000) / 10, categoryName: g.categoryId ? catName.get(g.categoryId) ?? null : null })),
    categories: course.gradeCategories,
  };
}

/** All active courses with their computed grade — one query for courses, one for grades. */
export async function getGradesOverview(userId: string) {
  const courses = await db.course.findMany({
    where: { userId, deletedAt: null, isActive: true },
    select: { id: true, name: true, code: true, color: true, icon: true, targetGrade: true, credits: true, gradeCategories: { select: { id: true, name: true, weight: true, dropLowest: true } } },
    orderBy: { name: "asc" },
  });
  const grades = await db.grade.findMany({ where: { userId, courseId: { in: courses.map((c) => c.id) } }, select: { id: true, courseId: true, categoryId: true, score: true, maxScore: true } });

  const perCourse = courses.map((c) => {
    const summary = summarizeCourse(c.gradeCategories, grades.filter((g) => g.courseId === c.id));
    return { course: { id: c.id, name: c.name, code: c.code, color: c.color, icon: c.icon, targetGrade: c.targetGrade, credits: c.credits }, summary, gradeCount: grades.filter((g) => g.courseId === c.id).length };
  });

  const graded = perCourse.filter((p) => p.summary.current != null);
  const weightedAvg = graded.length
    ? Math.round((graded.reduce((s, p) => s + (p.summary.current ?? 0) * (p.course.credits ?? 1), 0) / graded.reduce((s, p) => s + (p.course.credits ?? 1), 0)) * 100) / 100
    : null;

  return { courses: perCourse, overallAverage: weightedAvg, totalGrades: grades.length };
}

export async function createGrade(userId: string, input: CreateGradeInput) {
  const course = await db.course.findFirst({ where: { id: input.courseId, userId, deletedAt: null }, select: { id: true, name: true } });
  if (!course) throw new NotFoundError("Course");
  if (input.categoryId) {
    const cat = await db.gradeCategory.findFirst({ where: { id: input.categoryId, courseId: course.id }, select: { id: true } });
    if (!cat) throw new NotFoundError("Grade category");
  }
  if (input.taskId) {
    const task = await db.task.findFirst({ where: { id: input.taskId, userId }, select: { id: true } });
    if (!task) throw new NotFoundError("Task");
  }
  const grade = await db.grade.create({
    data: {
      userId,
      courseId: course.id,
      categoryId: input.categoryId ?? null,
      taskId: input.taskId ?? null,
      title: input.title,
      score: input.score,
      maxScore: input.maxScore,
      gradedAt: input.gradedAt ?? new Date(),
      notes: input.notes || null,
    },
  });
  await notify(userId, "GRADE_UPDATE", `New grade: ${grade.title}`, `${grade.score}/${grade.maxScore} in ${course.name}.`, { href: `/grades?course=${course.id}` });
  return grade;
}

export async function updateGrade(userId: string, gradeId: string, input: UpdateGradeInput) {
  const existing = await db.grade.findFirst({ where: { id: gradeId, userId }, select: { id: true, courseId: true } });
  if (!existing) throw new NotFoundError("Grade");
  if (input.categoryId) {
    const cat = await db.gradeCategory.findFirst({ where: { id: input.categoryId, courseId: existing.courseId }, select: { id: true } });
    if (!cat) throw new NotFoundError("Grade category");
  }
  return db.grade.update({
    where: { id: gradeId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.score !== undefined ? { score: input.score } : {}),
      ...(input.maxScore !== undefined ? { maxScore: input.maxScore } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.gradedAt !== undefined ? { gradedAt: input.gradedAt } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    },
  });
}

export async function deleteGrade(userId: string, gradeId: string) {
  const existing = await db.grade.findFirst({ where: { id: gradeId, userId }, select: { id: true } });
  if (!existing) throw new NotFoundError("Grade");
  await db.grade.delete({ where: { id: gradeId } });
}
