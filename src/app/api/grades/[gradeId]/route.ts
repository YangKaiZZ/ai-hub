import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { deleteGrade, updateGrade, updateGradeSchema } from "@/server/grades/service";

type Ctx = { params: Promise<{ gradeId: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).gradeId);
  const input = await parseBody(req, updateGradeSchema);
  return ok({ grade: await updateGrade(user.id, id, input) });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).gradeId);
  await deleteGrade(user.id, id);
  return ok({ deleted: true });
});
