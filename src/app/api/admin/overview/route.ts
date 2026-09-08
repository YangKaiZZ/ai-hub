import { ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminOverview } from "@/server/admin/service";

export const GET = route(async () => {
  await requireAdmin();
  return ok({ overview: await getAdminOverview() });
});
