import { z } from "zod";
import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { deleteIntegration, disconnectIntegration, syncIntegration } from "@/server/integrations/service";

type Ctx = { params: Promise<{ integrationId: string }> };

/** action: "sync" | "disconnect" */
export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).integrationId);
  const { action } = await parseBody(req, z.object({ action: z.enum(["sync", "disconnect"]) }));
  if (action === "sync") {
    await enforceRateLimit(RATE_LIMITS.integrationSync, user.id);
    return ok({ result: await syncIntegration(user.id, id) });
  }
  await disconnectIntegration(user.id, id);
  return ok({ disconnected: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).integrationId);
  await deleteIntegration(user.id, id);
  return ok({ deleted: true });
});
