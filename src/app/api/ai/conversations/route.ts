import { z } from "zod";
import { ok, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { createConversation, createConversationSchema, listConversations } from "@/server/ai/chat/service";

export const GET = route(async (req) => {
  const user = await requireUser();
  const { kind } = parseQuery(req, z.object({ kind: z.enum(["TUTOR", "AGENT"]).optional() }));
  return ok({ conversations: await listConversations(user.id, kind) });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, createConversationSchema);
  return ok({ conversation: await createConversation(user.id, input) }, { status: 201 });
});
