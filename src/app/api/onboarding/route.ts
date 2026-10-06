import { ok, parseBody, route } from "@/lib/api";
import { assertNotDemo, requireUser } from "@/lib/auth/guards";
import { onboardingStepSchema } from "@/server/onboarding/schemas";
import { completeOnboarding, getOnboardingState, saveOnboardingStep } from "@/server/onboarding/service";

export const GET = route(async () => {
  const user = await requireUser();
  return ok({ state: await getOnboardingState(user.id) });
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  // Onboarding steps rewrite the name and school, which the shared demo must keep.
  assertNotDemo(user, "redo onboarding");
  const input = await parseBody(req, onboardingStepSchema);
  const state = await saveOnboardingStep(user.id, input);
  return ok({ state });
});

export const POST = route(async () => {
  const user = await requireUser();
  await completeOnboarding(user.id);
  return ok({ completed: true, next: "/dashboard" });
});
