import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { destroySession } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors";
import { deleteAccount } from "@/server/settings/service";

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { confirm } = await parseBody(req, z.object({ confirm: z.string() }));
  if (confirm !== user.email) throw new ValidationError("Confirmation does not match", { confirm: "Type your email exactly to confirm." });
  await deleteAccount(user.id);
  await destroySession();
  return ok({ deleted: true });
});
