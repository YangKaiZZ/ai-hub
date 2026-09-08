import { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { Prisma, ResourceType } from "@/generated/prisma/client";

export const resourceTypeEnum = z.enum(["NOTE", "DOCUMENT", "LINK", "STUDY_GUIDE", "FLASHCARD_SET", "AI_SUMMARY", "LECTURE"]);

export const createResourceSchema = z
  .object({
    type: resourceTypeEnum,
    title: z.string().trim().min(1).max(160),
    content: z.string().max(100_000).optional().nullable(),
    url: z.string().trim().url().max(2048).optional().or(z.literal("")).nullable(),
    courseId: z.string().uuid().optional().nullable(),
    documentId: z.string().uuid().optional().nullable(),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(32)).max(12).default([]),
    isPinned: z.boolean().optional(),
  })
  .refine((v) => v.type !== "LINK" || Boolean(v.url), { message: "A link resource needs a URL", path: ["url"] });

export const updateResourceSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().max(100_000).optional().nullable(),
  url: z.string().trim().url().max(2048).optional().or(z.literal("")).nullable(),
  courseId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(32)).max(12).optional(),
  isPinned: z.boolean().optional(),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

export const resourceSelect = {
  id: true,
  type: true,
  title: true,
  content: true,
  url: true,
  tags: true,
  isPinned: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { id: true, name: true, code: true, color: true } },
  document: { select: { id: true, name: true, status: true, mimeType: true, sizeBytes: true, pageCount: true, chunkCount: true, summary: true, error: true } },
} satisfies Prisma.ResourceSelect;

export type ResourceItem = Prisma.ResourceGetPayload<{ select: typeof resourceSelect }>;

export async function listResources(userId: string, filter: { courseId?: string; type?: ResourceType; q?: string } = {}) {
  return db.resource.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(filter.courseId ? { courseId: filter.courseId } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.q ? { OR: [{ title: { contains: filter.q, mode: "insensitive" } }, { content: { contains: filter.q, mode: "insensitive" } }, { tags: { has: filter.q.toLowerCase() } }] } : {}),
    },
    select: resourceSelect,
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });
}

export async function getResource(userId: string, id: string) {
  const r = await db.resource.findFirst({ where: { id, userId, deletedAt: null }, select: resourceSelect });
  if (!r) throw new NotFoundError("Resource");
  return r;
}

export async function createResource(userId: string, input: CreateResourceInput) {
  if (input.courseId) {
    const c = await db.course.findFirst({ where: { id: input.courseId, userId, deletedAt: null }, select: { id: true } });
    if (!c) throw new NotFoundError("Course");
  }
  if (input.documentId) {
    const d = await db.document.findFirst({ where: { id: input.documentId, userId, deletedAt: null }, select: { id: true } });
    if (!d) throw new NotFoundError("Document");
  }
  return db.resource.create({
    data: {
      userId,
      type: input.type,
      title: input.title,
      content: input.content ?? null,
      url: input.url || null,
      courseId: input.courseId ?? null,
      documentId: input.documentId ?? null,
      tags: input.tags,
      isPinned: input.isPinned ?? false,
    },
    select: resourceSelect,
  });
}

export async function updateResource(userId: string, id: string, input: UpdateResourceInput) {
  const existing = await db.resource.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError("Resource");
  if (input.courseId) {
    const c = await db.course.findFirst({ where: { id: input.courseId, userId, deletedAt: null }, select: { id: true } });
    if (!c) throw new NotFoundError("Course");
  }
  return db.resource.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.url !== undefined ? { url: input.url || null } : {}),
      ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
    },
    select: resourceSelect,
  });
}

export async function deleteResource(userId: string, id: string) {
  const existing = await db.resource.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new NotFoundError("Resource");
  await db.resource.update({ where: { id }, data: { deletedAt: new Date() } });
}
