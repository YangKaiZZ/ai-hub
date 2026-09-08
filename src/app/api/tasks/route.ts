import { ok, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { createTaskSchema, listTasksQuerySchema } from "@/server/tasks/schemas";
import { createTask, listTasks } from "@/server/tasks/service";

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listTasksQuerySchema);
  const result = await listTasks(user.id, query);
  return ok(result);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, createTaskSchema);
  const task = await createTask(user.id, input);
  return ok({ task }, { status: 201 });
});
