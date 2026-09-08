import { ok, parseBody, route } from "@/lib/api";
import { RATE_LIMITS, clientIdentifier, enforceRateLimit } from "@/lib/rate-limit";
import { signupSchema } from "@/server/auth/schemas";
import { signup } from "@/server/auth/service";

export const POST = route(async (req) => {
  await enforceRateLimit(RATE_LIMITS.signup, clientIdentifier(req));
  const input = await parseBody(req, signupSchema);
  const user = await signup(input);
  return ok({ id: user.id, email: user.email, firstName: user.firstName, next: "/onboarding" }, { status: 201 });
});
