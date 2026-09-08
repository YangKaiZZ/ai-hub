import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { updateCourseSchema } from "@/server/courses/schemas";
import { deleteCourse, getCourse, updateCourse } from "@/server/courses/service";

type Ctx = { params: Promise<{ courseId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const courseId = parseWith(uuidSchema, (await params).courseId);
  const course = await getCourse(user.id, courseId);
  return ok({ course });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = parseWith(uuidSchema, (await params).courseId);
  const input = await parseBody(req, updateCourseSchema);
  const course = await updateCourse(user.id, courseId, input);
  return ok({ course });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const courseId = parseWith(uuidSchema, (await params).courseId);
  await deleteCourse(user.id, courseId);
  return ok({ deleted: true });
});
