import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { deleteEvent, updateEvent, updateEventSchema } from "@/server/calendar/service";

type Ctx = { params: Promise<{ eventId: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).eventId);
  const input = await parseBody(req, updateEventSchema);
  return ok({ event: await updateEvent(user.id, id, input) });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).eventId);
  await deleteEvent(user.id, id);
  return ok({ deleted: true });
});
