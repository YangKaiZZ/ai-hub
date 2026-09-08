import { ok, parseBody, route } from "@/lib/api";
import { RATE_LIMITS, clientIdentifier, enforceRateLimit } from "@/lib/rate-limit";
import { resetPasswordSchema } from "@/server/auth/schemas";
import { resetPassword } from "@/server/auth/service";

export const POST = route(async (req) => {
  await enforceRateLimit(RATE_LIMITS.passwordReset, clientIdentifier(req));
  const { token, password } = await parseBody(req, resetPasswordSchema);
  await resetPassword(token, password);
  return ok({ reset: true });
});
