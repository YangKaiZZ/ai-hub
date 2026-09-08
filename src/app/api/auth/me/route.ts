import { ok, route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/guards";

export const GET = route(async () => {
  const user = await getCurrentUser();
  return ok({ user });
});
