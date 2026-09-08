import { format } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getAIProvider, logAIUsage } from "@/server/ai/provider";
import type { AIMessage, StreamEvent } from "@/server/ai/provider/types";
import { AGENT_SYSTEM, ASSISTANCE_MODES, TUTOR_SYSTEM, WORKSPACE_SYSTEM } from "@/server/ai/prompts";
import { buildAgentTools } from "@/server/ai/agent/tools";
import { formatSources, retrieveChunks, type SourceRef } from "@/server/rag/retriever";
import type { AssistanceMode, ConversationKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const createConversationSchema = z.object({
  kind: z.enum(["TUTOR", "AGENT"]).default("TUTOR"),
  title: z.string().trim().max(120).optional(),
  subject: z.string().trim().max(60).optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable(),
  documentIds: z.array(z.string().uuid()).max(10).optional(),
  assistanceMode: z.enum(["LEARNING", "GUIDED", "REVIEW"]).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().max(60).optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable(),
  documentIds: z.array(z.string().uuid()).max(10).optional(),
  assistanceMode: z.enum(["LEARNING", "GUIDED", "REVIEW"]).optional(),
});

export const chatMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(8000),
  /** Used only when creating a new conversation on the fly. */
  create: createConversationSchema.optional(),
});

export const conversationListSelect = {
  id: true,
  kind: true,
  title: true,
  subject: true,
  assistanceMode: true,
  contextDocumentIds: true,
  updatedAt: true,
  course: { select: { id: true, name: true, code: true, color: true } },
  task: { select: { id: true, title: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.AIConversationSelect;

export type ConversationListItem = Prisma.AIConversationGetPayload<{ select: typeof conversationListSelect }>;

export async function listConversations(userId: string, kind?: ConversationKind) {
  return db.aIConversation.findMany({ where: { userId, deletedAt: null, ...(kind ? { kind } : { kind: { in: ["TUTOR", "AGENT"] } }) }, select: conversationListSelect, orderBy: { updatedAt: "desc" }, take: 50 });
}

export async function getConversation(userId: string, id: string) {
  const conv = await db.aIConversation.findFirst({
    where: { id, userId, deletedAt: null },
    select: { ...conversationListSelect, messages: { orderBy: { createdAt: "asc" }, take: 200, select: { id: true, role: true, content: true, sources: true, toolCalls: true, createdAt: true } } },
  });
  if (!conv) throw new NotFoundError("Conversation");
  return conv;
}

export type ConversationDetail = Awaited<ReturnType<typeof getConversation>>;

export async function createConversation(userId: string, input: z.infer<typeof createConversationSchema>) {
  const pref = await db.userPreference.findUnique({ where: { userId }, select: { defaultAssistanceMode: true } });
  if (input.courseId) {
    const c = await db.course.findFirst({ where: { id: input.courseId, userId, deletedAt: null }, select: { id: true } });
    if (!c) throw new NotFoundError("Course");
  }
  if (input.taskId) {
    const t = await db.task.findFirst({ where: { id: input.taskId, userId, deletedAt: null }, select: { id: true } });
    if (!t) throw new NotFoundError("Task");
  }
  const docs = input.documentIds?.length ? await db.document.findMany({ where: { id: { in: input.documentIds }, userId, deletedAt: null }, select: { id: true } }) : [];
  return db.aIConversation.create({
    data: {
      userId,
      kind: input.kind,
      title: input.title?.trim() || (input.kind === "AGENT" ? "Study planning" : "New conversation"),
      subject: input.subject ?? null,
      courseId: input.courseId ?? null,
      taskId: input.taskId ?? null,
      contextDocumentIds: docs.map((d) => d.id),
      assistanceMode: input.assistanceMode ?? pref?.defaultAssistanceMode ?? "GUIDED",
    },
    select: conversationListSelect,
  });
}

export async function updateConversation(userId: string, id: string, input: z.infer<typeof updateConversationSchema>) {
  const existing = await db.aIConversation.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError("Conversation");
  const docs = input.documentIds ? await db.document.findMany({ where: { id: { in: input.documentIds }, userId, deletedAt: null }, select: { id: true } }) : undefined;
  return db.aIConversation.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(docs ? { contextDocumentIds: docs.map((d) => d.id) } : {}),
      ...(input.assistanceMode !== undefined ? { assistanceMode: input.assistanceMode } : {}),
    },
    select: conversationListSelect,
  });
}

export async function deleteConversation(userId: string, id: string) {
  const existing = await db.aIConversation.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError("Conversation");
  await db.aIConversation.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ───────────────────────────────────────────────────────────────
// Context assembly
// ───────────────────────────────────────────────────────────────

interface ContextBundle {
  system: string;
  contextBlock: string;
  sources: SourceRef[];
}

async function studentBlock(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { firstName: true, timezone: true, institution: { select: { name: true } } } });
  return [`Student: ${user?.firstName ?? "Student"}`, user?.institution ? `Institution: ${user.institution.name}` : null, `Timezone: ${user?.timezone ?? "UTC"}`, `Today: ${format(new Date(), "EEEE, MMMM d, yyyy")}`].filter(Boolean).join("\n");
}

async function courseBlock(userId: string, courseId: string | null) {
  if (!courseId) return "";
  const c = await db.course.findFirst({ where: { id: courseId, userId }, select: { name: true, code: true, instructor: true, description: true } });
  if (!c) return "";
  return `<course>\nName: ${c.name}${c.code ? ` (${c.code})` : ""}${c.instructor ? `\nInstructor: ${c.instructor}` : ""}${c.description ? `\nDescription: ${c.description}` : ""}\n</course>`;
}

async function taskBlock(userId: string, taskId: string | null, includeWorkspace = false) {
  if (!taskId) return "";
  const t = await db.task.findFirst({
    where: { id: taskId, userId },
    select: { title: true, type: true, description: true, instructions: true, rubric: true, dueDate: true, estimatedMinutes: true, progress: true, priority: true, aiAnalysis: true, course: { select: { name: true } }, workspace: includeWorkspace ? { select: { draft: true, notes: true, checklist: true, assistanceMode: true } } : false },
  });
  if (!t) return "";
  const lines = [
    `<assignment>`,
    `Title: ${t.title}`,
    `Type: ${t.type}`,
    t.course ? `Course: ${t.course.name}` : null,
    t.dueDate ? `Deadline: ${format(t.dueDate, "EEE, MMM d yyyy h:mm a")}` : null,
    t.estimatedMinutes ? `Estimated time: ${t.estimatedMinutes} minutes` : null,
    `Progress: ${t.progress}% · Priority: ${t.priority}`,
    t.description ? `Description:\n${t.description}` : null,
    t.instructions ? `Instructions:\n${t.instructions.slice(0, 6000)}` : null,
    t.rubric ? `Rubric (JSON): ${JSON.stringify(t.rubric).slice(0, 4000)}` : null,
    t.aiAnalysis ? `AI analysis (JSON): ${JSON.stringify(t.aiAnalysis).slice(0, 3000)}` : null,
    `</assignment>`,
  ];
  const ws = includeWorkspace && "workspace" in t ? (t.workspace as { draft: string; notes: string; checklist: unknown } | null) : null;
  if (ws) {
    lines.push(`<student_work>`);
    lines.push(ws.draft ? `Draft:\n${ws.draft.slice(0, 12000)}` : "Draft: (empty)");
    if (ws.notes) lines.push(`Notes:\n${ws.notes.slice(0, 3000)}`);
    if (ws.checklist) lines.push(`Checklist (JSON): ${JSON.stringify(ws.checklist).slice(0, 2000)}`);
    lines.push(`</student_work>`);
  }
  return lines.filter(Boolean).join("\n");
}

async function buildContext(userId: string, opts: { kind: "TUTOR" | "AGENT" | "WORKSPACE"; mode: AssistanceMode; courseId: string | null; taskId: string | null; documentIds: string[]; query: string }): Promise<ContextBundle> {
  const base = opts.kind === "AGENT" ? AGENT_SYSTEM : opts.kind === "WORKSPACE" ? WORKSPACE_SYSTEM : TUTOR_SYSTEM;
  const system = `${base}\n\n${ASSISTANCE_MODES[opts.mode]}`;

  // Retrieval scope: pinned documents → task attachments → course documents → everything.
  let documentIds = opts.documentIds;
  if (documentIds.length === 0 && opts.taskId) {
    const att = await db.taskAttachment.findMany({ where: { taskId: opts.taskId, task: { userId }, documentId: { not: null } }, select: { documentId: true } });
    documentIds = att.map((a) => a.documentId!).filter(Boolean);
  }
  const chunks = await retrieveChunks({ userId, query: opts.query, limit: 5, documentIds: documentIds.length ? documentIds : undefined, courseId: documentIds.length ? null : opts.courseId }).catch((err) => {
    logger.warn("ai", "retrieval failed", { error: String(err) });
    return [];
  });
  const { prompt: sourcePrompt, refs } = formatSources(chunks);

  const parts = [await studentBlock(userId), await courseBlock(userId, opts.courseId), await taskBlock(userId, opts.taskId, opts.kind === "WORKSPACE")].filter(Boolean);
  const contextBlock = `<student_context>\n${parts.join("\n")}\n</student_context>${sourcePrompt ? `\n\n<sources>\n${sourcePrompt}\n</sources>` : ""}`;
  return { system, contextBlock, sources: refs };
}

// ───────────────────────────────────────────────────────────────
// Streaming chat
// ───────────────────────────────────────────────────────────────

export type ChatEvent = StreamEvent | { type: "meta"; conversationId: string; messageId?: string; sources: SourceRef[]; provider: string } | { type: "saved"; messageId: string };

const MAX_HISTORY = 24;

/** Plain data → Prisma JSON input (our source/tool-call records are JSON-safe by construction). */
const toJson = (value: unknown) => value as Prisma.InputJsonValue;

/** Tutor / agent conversation turn. Persists both messages and streams events. */
export async function* streamConversationTurn(userId: string, conversationId: string, userMessage: string): AsyncGenerator<ChatEvent, void, void> {
  const conv = await db.aIConversation.findFirst({ where: { id: conversationId, userId, deletedAt: null }, include: { messages: { orderBy: { createdAt: "desc" }, take: MAX_HISTORY, select: { role: true, content: true } } } });
  if (!conv) throw new NotFoundError("Conversation");

  const history: AIMessage[] = conv.messages
    .reverse()
    .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
    .map((m) => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content }));

  await db.aIMessage.create({ data: { conversationId: conv.id, role: "USER", content: userMessage } });
  const isFirst = conv.messages.length === 0;
  if (isFirst && (conv.title === "New conversation" || conv.title === "Study planning")) {
    await db.aIConversation.update({ where: { id: conv.id }, data: { title: userMessage.replace(/\s+/g, " ").slice(0, 60) } });
  }

  const kind = conv.kind === "WORKSPACE" ? "TUTOR" : conv.kind;
  const ctx = await buildContext(userId, { kind, mode: conv.assistanceMode, courseId: conv.courseId, taskId: conv.taskId, documentIds: conv.contextDocumentIds, query: userMessage });
  const tools = buildAgentTools(userId, { allowWrites: conv.kind === "AGENT" });
  const provider = getAIProvider();

  yield { type: "meta", conversationId: conv.id, sources: ctx.sources, provider: provider.name };

  const persist = async (text: string, toolCalls: unknown[], usage: { inputTokens: number; outputTokens: number }, model: string) => {
    const msg = await db.aIMessage.create({
      data: { conversationId: conv.id, role: "ASSISTANT", content: text, sources: ctx.sources.length ? toJson(ctx.sources) : undefined, toolCalls: toolCalls.length ? toJson(toolCalls) : undefined, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, model },
      select: { id: true },
    });
    await db.aIConversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
    return msg.id;
  };

  yield* runStream({ userId, feature: conv.kind === "AGENT" ? "agent" : "tutor", system: ctx.system, history, contextBlock: ctx.contextBlock, userMessage, tools: kind === "AGENT" ? tools : tools.filter((t) => ["get_tasks", "get_upcoming_deadlines", "search_resources", "get_student_preferences", "get_course", "get_calendar"].includes(t.name)), persist });
}

/** Workspace chat turn (stored in WorkspaceMessage). */
export async function* streamWorkspaceTurn(userId: string, workspaceId: string, userMessage: string): AsyncGenerator<ChatEvent, void, void> {
  const ws = await db.assignmentWorkspace.findFirst({ where: { id: workspaceId, userId }, include: { task: { select: { id: true, courseId: true, deletedAt: true } }, messages: { orderBy: { createdAt: "desc" }, take: MAX_HISTORY, select: { role: true, content: true } } } });
  if (!ws || ws.task.deletedAt) throw new NotFoundError("Workspace");

  const history: AIMessage[] = ws.messages
    .reverse()
    .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
    .map((m) => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content }));

  await db.workspaceMessage.create({ data: { workspaceId: ws.id, role: "USER", content: userMessage } });

  const ctx = await buildContext(userId, { kind: "WORKSPACE", mode: ws.assistanceMode, courseId: ws.task.courseId, taskId: ws.task.id, documentIds: [], query: userMessage });
  const provider = getAIProvider();
  yield { type: "meta", conversationId: ws.id, sources: ctx.sources, provider: provider.name };

  const tools = buildAgentTools(userId, { allowWrites: false }).filter((t) => ["search_resources", "search_workspace_files", "get_course"].includes(t.name));
  const persist = async (text: string, _toolCalls: unknown[], usage: { inputTokens: number; outputTokens: number }, model: string) => {
    const msg = await db.workspaceMessage.create({ data: { workspaceId: ws.id, role: "ASSISTANT", content: text, sources: ctx.sources.length ? toJson(ctx.sources) : undefined, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, model }, select: { id: true } });
    return msg.id;
  };
  yield* runStream({ userId, feature: "workspace", system: ctx.system, history, contextBlock: ctx.contextBlock, userMessage, tools, persist });
}

async function* runStream(opts: {
  userId: string;
  feature: string;
  system: string;
  history: AIMessage[];
  contextBlock: string;
  userMessage: string;
  tools: ReturnType<typeof buildAgentTools>;
  persist: (text: string, toolCalls: unknown[], usage: { inputTokens: number; outputTokens: number }, model: string) => Promise<string>;
}): AsyncGenerator<ChatEvent, void, void> {
  const provider = getAIProvider();
  const messages: AIMessage[] = [...opts.history, { role: "user", content: `${opts.contextBlock}\n\n${opts.userMessage}` }];
  let text = "";
  const toolCalls: { name: string; label: string; ok?: boolean; summary?: string }[] = [];
  const started = Date.now();
  let finalUsage = { inputTokens: 0, outputTokens: 0 };
  let model = provider.model;
  let failed = false;

  try {
    for await (const event of provider.stream({ feature: opts.feature, userId: opts.userId, system: opts.system, messages, tools: opts.tools, effort: "medium", maxTokens: 6000 })) {
      if (event.type === "text") text += event.text;
      else if (event.type === "tool_call") toolCalls.push({ name: event.name, label: event.label });
      else if (event.type === "tool_result") {
        const last = [...toolCalls].reverse().find((t) => t.name === event.name && t.ok === undefined);
        if (last) {
          last.ok = event.ok;
          last.summary = event.summary;
        }
      } else if (event.type === "done") {
        finalUsage = event.usage;
        model = event.model;
      } else if (event.type === "error") {
        failed = true;
      }
      yield event;
    }
  } catch (err) {
    failed = true;
    logger.error("ai", "stream failed", { error: String(err) });
    yield { type: "error", message: "The AI assistant is temporarily unavailable. Please try again shortly.", code: "AI_UNAVAILABLE" };
  }

  void logAIUsage({ userId: opts.userId, feature: opts.feature, provider: provider.name, model, usage: finalUsage, latencyMs: Date.now() - started, success: !failed, errorCode: failed ? "stream_error" : undefined });

  if (text.trim().length > 0) {
    const messageId = await opts.persist(text, toolCalls, finalUsage, model);
    yield { type: "saved", messageId };
  }
}
