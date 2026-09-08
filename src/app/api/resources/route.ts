import { z } from "zod";
import { ok, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { createResource, createResourceSchema, listResources, resourceTypeEnum } from "@/server/resources/service";

const querySchema = z.object({ courseId: z.string().uuid().optional(), type: resourceTypeEnum.optional(), q: z.string().trim().max(120).optional() });

export const GET = route(async (req) => {
  const user = await requireUser();
  const filter = parseQuery(req, querySchema);
  return ok({ resources: await listResources(user.id, filter) });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, createResourceSchema);
  return ok({ resource: await createResource(user.id, input) }, { status: 201 });
});
