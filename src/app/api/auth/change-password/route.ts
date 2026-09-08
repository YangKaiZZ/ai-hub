import { ok, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { changePasswordSchema } from "@/server/auth/schemas";
import { changePassword } from "@/server/auth/service";

export const POST = route(async (req) => {
  const user = await requireUser();
  const { currentPassword, newPassword } = await parseBody(req, changePasswordSchema);
  await changePassword(user.id, currentPassword, newPassword);
  return ok({ changed: true });
});
