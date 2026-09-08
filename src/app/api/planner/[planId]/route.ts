import { z } from "zod";
import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { confirmPlan, discardPlan, getPlan } from "@/server/planner/service";

type Ctx = { params: Promise<{ planId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).planId);
  return ok({ plan: await getPlan(user.id, id) });
});

/** Confirm (publish to calendar) or discard a plan. */
export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).planId);
  const { action } = await parseBody(req, z.object({ action: z.enum(["confirm", "discard"]) }));
  if (action === "confirm") return ok({ plan: await confirmPlan(user.id, id) });
  await discardPlan(user.id, id);
  return ok({ discarded: true });
});
