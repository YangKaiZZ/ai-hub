import { ok, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { preferencesSchema, updatePreferences } from "@/server/settings/service";

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, preferencesSchema);
  const pref = await updatePreferences(user.id, input);
  return ok({ preferences: pref });
});
