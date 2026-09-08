import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { openWorkspaceForTask } from "@/server/workspace/service";

export const POST = route(async (req) => {
  const user = await requireUser();
  const { taskId } = await parseBody(req, z.object({ taskId: z.string().uuid() }));
  const ws = await openWorkspaceForTask(user.id, taskId);
  return ok({ workspace: ws }, { status: 201 });
});
