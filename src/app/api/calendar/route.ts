import { ok, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { calendarRangeSchema, createEvent, createEventSchema, listEvents } from "@/server/calendar/service";

export const GET = route(async (req) => {
  const user = await requireUser();
  const { from, to } = parseQuery(req, calendarRangeSchema);
  return ok({ events: await listEvents(user.id, from, to) });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, createEventSchema);
  return ok({ event: await createEvent(user.id, input) }, { status: 201 });
});
