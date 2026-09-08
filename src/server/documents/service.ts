import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStorage } from "@/server/storage";
import { extractText, resolveMimeType, sniffMatches, SUPPORTED_MIME } from "@/server/documents/extract";
import { chunkText } from "@/server/documents/chunk";
import { getEmbeddingProvider } from "@/server/ai/embeddings";
import { getAIProvider, logAIUsage } from "@/server/ai/provider";
import { SUMMARIZE_DOCUMENT_SYSTEM } from "@/server/ai/prompts";
import type { Prisma } from "@/generated/prisma/client";

export const documentSelect = {
  id: true,
  name: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  pageCount: true,
  textLength: true,
  chunkCount: true,
  summary: true,
  error: true,
  processedAt: true,
  createdAt: true,
  course: { select: { id: true, name: true, code: true, color: true } },
} satisfies Prisma.DocumentSelect;

export type DocumentItem = Prisma.DocumentGetPayload<{ select: typeof documentSelect }>;

export interface UploadInput {
  fileName: string;
  browserMimeType: string | null;
  data: Buffer;
  courseId?: string | null;
  taskId?: string | null;
}

/**
 * Upload → validate → store → extract → chunk → embed → index → summarize.
 * Processing runs inline (files are capped at MAX_UPLOAD_MB) and failures are
 * recorded on the document rather than thrown, so the upload itself succeeds.
 */
export async function uploadDocument(userId: string, input: UploadInput) {
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (input.data.byteLength === 0) throw new AppError("VALIDATION_ERROR", "Empty file", { userMessage: "That file is empty." });
  if (input.data.byteLength > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", "File too large", { userMessage: `Files must be under ${env.MAX_UPLOAD_MB} MB.` });

  const mime = resolveMimeType(input.fileName, input.browserMimeType);
  if (!mime || !SUPPORTED_MIME[mime]) throw new AppError("UNSUPPORTED_FILE", `Unsupported type ${input.browserMimeType ?? "unknown"}`);
  if (!sniffMatches(mime, input.data)) throw new AppError("UNSUPPORTED_FILE", "File contents do not match its type", { userMessage: "That file does not look like a valid " + mime.split("/").pop()?.toUpperCase() + "." });

  if (input.courseId) {
    const course = await db.course.findFirst({ where: { id: input.courseId, userId, deletedAt: null }, select: { id: true } });
    if (!course) throw new NotFoundError("Course");
  }

  const safeName = input.fileName.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 180) || "document";
  const ext = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
  const id = randomUUID();
  const storageKey = `${userId}/${id}.${ext}`;

  await getStorage().put(storageKey, input.data, mime);

  await db.document.create({
    data: { id, userId, courseId: input.courseId ?? null, name: safeName, mimeType: mime, sizeBytes: input.data.byteLength, storageKey, status: "UPLOADED" },
    select: { id: true },
  });

  // Auto-create a Resource entry so the file appears in the library.
  await db.resource.create({
    data: { userId, courseId: input.courseId ?? null, documentId: id, type: SUPPORTED_MIME[mime] === "image" ? "DOCUMENT" : "DOCUMENT", title: safeName.replace(/\.[a-z0-9]+$/i, ""), tags: [] },
  });

  if (input.taskId) {
    const task = await db.task.findFirst({ where: { id: input.taskId, userId, deletedAt: null }, select: { id: true } });
    if (task) await db.taskAttachment.create({ data: { taskId: task.id, documentId: id, name: safeName, mimeType: mime, sizeBytes: input.data.byteLength } });
  }

  await processDocument(userId, id, input.data);
  return db.document.findUniqueOrThrow({ where: { id }, select: documentSelect });
}

export async function processDocument(userId: string, documentId: string, data?: Buffer) {
  const doc = await db.document.findFirst({ where: { id: documentId, userId, deletedAt: null } });
  if (!doc) throw new NotFoundError("Document");

  await db.document.update({ where: { id: doc.id }, data: { status: "PROCESSING", error: null } });
  try {
    const buffer = data ?? (await getStorage().get(doc.storageKey));
    const extracted = await extractText(doc.mimeType, buffer);

    if (extracted.noText) {
      await db.document.update({
        where: { id: doc.id },
        data: { status: "READY", pageCount: null, textLength: 0, chunkCount: 0, summary: "Image file — stored for reference. Text extraction is not available for images yet.", processedAt: new Date() },
      });
      return;
    }

    const chunks = chunkText(extracted.text);
    const vectors = chunks.length ? await getEmbeddingProvider().embed(chunks.map((c) => c.content)) : [];

    await db.$transaction([
      db.documentChunk.deleteMany({ where: { documentId: doc.id } }),
      ...chunks.map((c, i) =>
        db.documentChunk.create({ data: { documentId: doc.id, index: c.index, content: c.content, tokenCount: c.tokenCount, page: c.page, embedding: vectors[i] ?? [] } }),
      ),
    ]);

    const summary = await summarize(userId, doc.name, extracted.text);
    await db.document.update({
      where: { id: doc.id },
      data: { status: "READY", pageCount: extracted.pageCount, textLength: extracted.text.length, chunkCount: chunks.length, summary, processedAt: new Date() },
    });
    logger.info("documents", "processed", { documentId: doc.id, chunks: chunks.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    logger.error("documents", "processing failed", { documentId: doc.id, error: message });
    await db.document.update({ where: { id: doc.id }, data: { status: "FAILED", error: message.slice(0, 500) } });
  }
}

async function summarize(userId: string, name: string, text: string): Promise<string | null> {
  const sample = text.replace(/\f/g, "\n\n").slice(0, 12_000).trim();
  if (sample.length < 80) return null;
  const provider = getAIProvider();
  const started = Date.now();
  try {
    const res = await provider.complete({
      feature: "document-summary",
      userId,
      system: SUMMARIZE_DOCUMENT_SYSTEM,
      messages: [{ role: "user", content: `<student_context>\n<document title="${name.replace(/"/g, "'")}">\n${sample}\n</document>\n</student_context>\n\nSummarize this document.` }],
      effort: "low",
      maxTokens: 400,
    });
    void logAIUsage({ userId, feature: "document-summary", provider: provider.name, model: res.model, usage: res.usage, latencyMs: Date.now() - started });
    return res.text.trim().slice(0, 1000);
  } catch (err) {
    logger.warn("documents", "summary skipped", { error: String(err) });
    return null;
  }
}

export async function listDocuments(userId: string, filter: { courseId?: string } = {}) {
  return db.document.findMany({
    where: { userId, deletedAt: null, ...(filter.courseId ? { courseId: filter.courseId } : {}) },
    select: documentSelect,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getDocument(userId: string, documentId: string) {
  const doc = await db.document.findFirst({ where: { id: documentId, userId, deletedAt: null }, select: { ...documentSelect, storageKey: true } });
  if (!doc) throw new NotFoundError("Document");
  return doc;
}

export async function getDocumentFile(userId: string, documentId: string) {
  const doc = await getDocument(userId, documentId);
  const data = await getStorage().get(doc.storageKey);
  return { doc, data };
}

export async function deleteDocument(userId: string, documentId: string) {
  const doc = await db.document.findFirst({ where: { id: documentId, userId, deletedAt: null }, select: { id: true, storageKey: true } });
  if (!doc) throw new NotFoundError("Document");
  await db.$transaction([
    db.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } }),
    db.resource.updateMany({ where: { documentId: doc.id, userId }, data: { deletedAt: new Date() } }),
    db.documentChunk.deleteMany({ where: { documentId: doc.id } }),
  ]);
  await getStorage()
    .delete(doc.storageKey)
    .catch((err) => logger.warn("documents", "storage delete failed", { error: String(err) }));
}

/** Preview chunks for the resource detail page. */
export async function getDocumentChunks(userId: string, documentId: string, limit = 50) {
  const doc = await db.document.findFirst({ where: { id: documentId, userId, deletedAt: null }, select: { id: true } });
  if (!doc) throw new NotFoundError("Document");
  return db.documentChunk.findMany({ where: { documentId: doc.id }, select: { id: true, index: true, page: true, content: true }, orderBy: { index: "asc" }, take: limit });
}
