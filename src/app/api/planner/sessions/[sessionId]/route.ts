import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { deleteSession, updateSession, updateSessionSchema } from "@/server/planner/service";

type Ctx = { params: Promise<{ sessionId: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).sessionId);
  const input = await parseBody(req, updateSessionSchema);
  return ok({ session: await updateSession(user.id, id, input) });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).sessionId);
  await deleteSession(user.id, id);
  return ok({ deleted: true });
});
