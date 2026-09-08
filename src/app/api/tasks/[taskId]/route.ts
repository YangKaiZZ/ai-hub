import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { updateTaskSchema } from "@/server/tasks/schemas";
import { deleteTask, getTask, updateTask } from "@/server/tasks/service";

type Ctx = { params: Promise<{ taskId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const taskId = parseWith(uuidSchema, (await params).taskId);
  const task = await getTask(user.id, taskId);
  return ok({ task });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const taskId = parseWith(uuidSchema, (await params).taskId);
  const input = await parseBody(req, updateTaskSchema);
  const task = await updateTask(user.id, taskId, input);
  return ok({ task });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const taskId = parseWith(uuidSchema, (await params).taskId);
  await deleteTask(user.id, taskId);
  return ok({ deleted: true });
});
