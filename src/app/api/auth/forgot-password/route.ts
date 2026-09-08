import { ok, parseBody, route } from "@/lib/api";
import { RATE_LIMITS, clientIdentifier, enforceRateLimit } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/server/auth/schemas";
import { requestPasswordReset } from "@/server/auth/service";

export const POST = route(async (req) => {
  await enforceRateLimit(RATE_LIMITS.passwordReset, clientIdentifier(req));
  const { email } = await parseBody(req, forgotPasswordSchema);
  await requestPasswordReset(email);
  // Same response regardless of whether the account exists.
  return ok({ sent: true });
});
