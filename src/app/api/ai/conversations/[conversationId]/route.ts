import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { deleteConversation, getConversation, updateConversation, updateConversationSchema } from "@/server/ai/chat/service";

type Ctx = { params: Promise<{ conversationId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).conversationId);
  return ok({ conversation: await getConversation(user.id, id) });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).conversationId);
  const input = await parseBody(req, updateConversationSchema);
  return ok({ conversation: await updateConversation(user.id, id, input) });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).conversationId);
  await deleteConversation(user.id, id);
  return ok({ deleted: true });
});
