import { ok, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { listPlans, proposePlanSchema, proposeStudyPlan } from "@/server/planner/service";

export const GET = route(async () => {
  const user = await requireUser();
  return ok({ plans: await listPlans(user.id) });
});

/** Generate a new plan proposal (not yet on the calendar). */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit(RATE_LIMITS.ai, user.id);
  const input = await parseBody(req, proposePlanSchema);
  const plan = await proposeStudyPlan(user.id, input);
  return ok({ plan }, { status: 201 });
});
