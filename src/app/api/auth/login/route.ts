import { ok, parseBody, route } from "@/lib/api";
import { RATE_LIMITS, clientIdentifier, enforceRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/server/auth/schemas";
import { login } from "@/server/auth/service";

export const POST = route(async (req) => {
  const input = await parseBody(req, loginSchema);
  await enforceRateLimit(RATE_LIMITS.login, `${clientIdentifier(req)}:${input.email}`);
  const result = await login(input);
  return ok({ id: result.id, next: result.onboardingCompleted ? "/dashboard" : "/onboarding" });
});
