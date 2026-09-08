import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { countUnreadNotifications, listNotifications } from "@/server/notifications/service";

export const GET = route(async () => {
  const user = await requireUser();
  const [items, unread] = await Promise.all([listNotifications(user.id), countUnreadNotifications(user.id)]);
  return ok({ items, unread });
});
