import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getWorkspace, updateWorkspace, updateWorkspaceSchema } from "@/server/workspace/service";

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).workspaceId);
  return ok({ workspace: await getWorkspace(user.id, id) });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).workspaceId);
  const input = await parseBody(req, updateWorkspaceSchema);
  return ok({ workspace: await updateWorkspace(user.id, id, input) });
});
