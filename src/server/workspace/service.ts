import { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { AssistanceMode } from "@/generated/prisma/enums";

export const checklistItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(300),
  done: z.boolean(),
  source: z.enum(["ai", "user"]).default("user"),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const updateWorkspaceSchema = z.object({
  draft: z.string().max(200_000).optional(),
  notes: z.string().max(50_000).optional(),
  checklist: z.array(checklistItemSchema).max(100).optional(),
  assistanceMode: z.enum(["LEARNING", "GUIDED", "REVIEW"]).optional(),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const workspaceInclude = {
  task: {
    include: {
      course: { select: { id: true, name: true, code: true, color: true, icon: true, instructor: true } },
      attachments: { include: { document: { select: { id: true, name: true, status: true, mimeType: true } } } },
    },
  },
  messages: { orderBy: { createdAt: "asc" as const }, take: 200 },
} as const;

/** Get or create the workspace for a task the user owns. */
export async function openWorkspaceForTask(userId: string, taskId: string) {
  const task = await db.task.findFirst({ where: { id: taskId, userId, deletedAt: null }, select: { id: true } });
  if (!task) throw new NotFoundError("Task");
  const pref = await db.userPreference.findUnique({ where: { userId }, select: { defaultAssistanceMode: true } });
  const ws = await db.assignmentWorkspace.upsert({
    where: { taskId },
    update: { lastOpenedAt: new Date() },
    create: { taskId, userId, assistanceMode: pref?.defaultAssistanceMode ?? "GUIDED", lastOpenedAt: new Date() },
    select: { id: true },
  });
  return ws;
}

export async function getWorkspace(userId: string, workspaceId: string) {
  const ws = await db.assignmentWorkspace.findFirst({ where: { id: workspaceId, userId }, include: workspaceInclude });
  if (!ws || ws.task.deletedAt) throw new NotFoundError("Workspace");
  void db.assignmentWorkspace.update({ where: { id: ws.id }, data: { lastOpenedAt: new Date() } }).catch(() => undefined);
  return ws;
}

export type WorkspaceDetail = Awaited<ReturnType<typeof getWorkspace>>;

export async function updateWorkspace(userId: string, workspaceId: string, input: UpdateWorkspaceInput) {
  const ws = await db.assignmentWorkspace.findFirst({ where: { id: workspaceId, userId }, select: { id: true, taskId: true, checklist: true } });
  if (!ws) throw new NotFoundError("Workspace");

  const updated = await db.assignmentWorkspace.update({
    where: { id: ws.id },
    data: {
      ...(input.draft !== undefined ? { draft: input.draft } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.checklist !== undefined ? { checklist: input.checklist } : {}),
      ...(input.assistanceMode !== undefined ? { assistanceMode: input.assistanceMode as AssistanceMode } : {}),
    },
    select: { id: true, draft: true, notes: true, checklist: true, assistanceMode: true, updatedAt: true },
  });

  // Checklist completion nudges task progress forward (never backwards below manual edits).
  if (input.checklist && input.checklist.length > 0) {
    const done = input.checklist.filter((c) => c.done).length;
    const pct = Math.round((done / input.checklist.length) * 100);
    const task = await db.task.findUnique({ where: { id: ws.taskId }, select: { progress: true, status: true } });
    if (task && task.status !== "COMPLETED" && pct > task.progress) {
      await db.task.update({ where: { id: ws.taskId }, data: { progress: Math.min(99, pct), status: pct > 0 ? "IN_PROGRESS" : task.status } });
    }
  }
  return updated;
}

export async function listRecentWorkspaces(userId: string, limit = 6) {
  return db.assignmentWorkspace.findMany({
    where: { userId, task: { deletedAt: null } },
    orderBy: { lastOpenedAt: "desc" },
    take: limit,
    select: { id: true, lastOpenedAt: true, task: { select: { id: true, title: true, dueDate: true, progress: true, course: { select: { name: true, color: true } } } } },
  });
}
