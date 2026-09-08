import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { deleteResource, getResource, updateResource, updateResourceSchema } from "@/server/resources/service";

type Ctx = { params: Promise<{ resourceId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).resourceId);
  return ok({ resource: await getResource(user.id, id) });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).resourceId);
  const input = await parseBody(req, updateResourceSchema);
  return ok({ resource: await updateResource(user.id, id, input) });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).resourceId);
  await deleteResource(user.id, id);
  return ok({ deleted: true });
});
