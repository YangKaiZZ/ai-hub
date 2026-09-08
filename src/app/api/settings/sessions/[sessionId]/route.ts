import { ok, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { revokeSession } from "@/server/settings/service";

type Ctx = { params: Promise<{ sessionId: string }> };

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).sessionId);
  await revokeSession(user.id, id);
  return ok({ revoked: true });
});
