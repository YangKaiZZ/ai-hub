import { z } from "zod";
import { ok, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { createCourseSchema } from "@/server/courses/schemas";
import { createCourse, listCoursesWithSummary } from "@/server/courses/service";

export const GET = route(async (req) => {
  const user = await requireUser();
  const { includeInactive } = parseQuery(req, z.object({ includeInactive: z.enum(["true", "false"]).optional() }));
  const courses = await listCoursesWithSummary(user.id, { includeInactive: includeInactive === "true" });
  return ok({ courses });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, createCourseSchema);
  const course = await createCourse(user.id, input);
  return ok({ course }, { status: 201 });
});
