import { ok, parseWith, route, uuidSchema } from "@/lib/api";
import { assertNotDemo, requireUser } from "@/lib/auth/guards";
import { revokeSession } from "@/server/settings/service";

type Ctx = { params: Promise<{ sessionId: string }> };

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  assertNotDemo(user, "sign out other sessions");
  const id = parseWith(uuidSchema, (await params).sessionId);
  await revokeSession(user.id, id);
  return ok({ revoked: true });
});
