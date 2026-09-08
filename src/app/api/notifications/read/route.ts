import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { markAllNotificationsRead, markNotificationRead } from "@/server/notifications/service";

const schema = z.union([z.object({ all: z.literal(true) }), z.object({ id: z.string().uuid() })]);

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  if ("all" in body) await markAllNotificationsRead(user.id);
  else await markNotificationRead(user.id, body.id);
  return ok({ done: true });
});
