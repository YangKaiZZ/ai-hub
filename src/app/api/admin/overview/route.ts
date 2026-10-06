import { ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { isDemoEmail } from "@/lib/demo";
import { getAdminOverview } from "@/server/admin/service";

export const GET = route(async () => {
  const admin = await requireAdmin();
  return ok({ overview: await getAdminOverview({ redactPeople: isDemoEmail(admin.email) }) });
});
