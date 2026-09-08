import { fail, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { toAppError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { chatMessageSchema, createConversation, streamConversationTurn, streamWorkspaceTurn, type ChatEvent } from "@/server/ai/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streaming chat endpoint (Server-Sent Events). Body: { conversationId | workspaceId | create, message }.
 * Events: meta, text, tool_call, tool_result, done, saved, error.
 */
export async function POST(req: Request) {
  let user;
  let body;
  try {
    user = await requireUser();
    await enforceRateLimit(RATE_LIMITS.ai, user.id);
    body = await parseBody(req, chatMessageSchema);
    if (!body.conversationId && !body.workspaceId && !body.create) throw new ValidationError("Provide conversationId, workspaceId or create");
  } catch (err) {
    return fail(toAppError(err));
  }

  const userId = user.id;
  const input = body;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        let generator: AsyncGenerator<ChatEvent, void, void>;
        if (input.workspaceId) {
          generator = streamWorkspaceTurn(userId, input.workspaceId, input.message);
        } else {
          let conversationId = input.conversationId;
          if (!conversationId) {
            const conv = await createConversation(userId, input.create ?? { kind: "TUTOR" });
            conversationId = conv.id;
          }
          generator = streamConversationTurn(userId, conversationId, input.message);
        }
        for await (const event of generator) {
          if (req.signal.aborted) break;
          send(event);
        }
      } catch (err) {
        const appErr = toAppError(err);
        logger.error("ai", "chat route error", { error: appErr.message });
        send({ type: "error", message: appErr.userMessage, code: appErr.code });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
