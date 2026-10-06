import { ok, parseBody, route } from "@/lib/api";
import { assertNotDemo, requireUser } from "@/lib/auth/guards";
import { getSettings, profileSchema, updateProfile } from "@/server/settings/service";

export const GET = route(async () => {
  const user = await requireUser();
  return ok({ settings: await getSettings(user.id) });
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  assertNotDemo(user, "edit its profile");
  const input = await parseBody(req, profileSchema);
  return ok({ profile: await updateProfile(user.id, input) });
});
