import { ok, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { createGrade, createGradeSchema, getGradesOverview } from "@/server/grades/service";

export const GET = route(async () => {
  const user = await requireUser();
  return ok(await getGradesOverview(user.id));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, createGradeSchema);
  return ok({ grade: await createGrade(user.id, input) }, { status: 201 });
});
