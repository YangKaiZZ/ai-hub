import { addDays } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deleteDocument, getDocumentChunks, uploadDocument } from "@/server/documents/service";
import { createGrade, getCourseGradeReport } from "@/server/grades/service";
import { TaskIngestionEngine } from "@/server/ingestion/engine";
import { connectIntegration, syncIntegration } from "@/server/integrations/service";
import { retrieveChunks } from "@/server/rag/retriever";
import { setGradeCategories } from "@/server/courses/service";
import { createTestUser, deleteTestUser, hasDatabase } from "./helpers";

let userId = "";
const dbAvailable = await hasDatabase();

beforeAll(async () => {
  if (!dbAvailable) return;
  userId = (await createTestUser("ingest")).id;
});

afterAll(async () => {
  if (!dbAvailable) return;
  await deleteTestUser(userId);
});

describe.skipIf(!dbAvailable)("ingestion engine (integration)", () => {
  it("imports normalized courses and tasks idempotently", async () => {
    const engine = new TaskIngestionEngine(userId, { analyze: false, notifyNewTasks: false });
    const payload = {
      courses: [{ externalId: "c-1", source: "LMS" as const, name: "Algorithms", code: "CS201" }],
      tasks: [
        { externalId: "a-1", source: "LMS" as const, course: { externalId: "c-1", name: "Algorithms" }, title: "PA3", dueDate: addDays(new Date(), 4), type: "ASSIGNMENT" as const },
        { externalId: "a-2", source: "LMS" as const, course: { externalId: "c-1", name: "Algorithms" }, title: "Quiz 4", dueDate: addDays(new Date(), 2), type: "QUIZ" as const },
      ],
    };
    const first = await engine.ingest(payload);
    expect(first.coursesCreated).toBe(1);
    expect(first.tasksCreated).toBe(2);
    expect(first.errors).toEqual([]);

    // Student edits progress; a re-sync must not overwrite it.
    const task = await db.task.findFirstOrThrow({ where: { userId, externalId: "a-1" } });
    await db.task.update({ where: { id: task.id }, data: { progress: 60, status: "IN_PROGRESS" } });

    const second = await engine.ingest({ ...payload, tasks: [{ ...payload.tasks[0]!, title: "PA3 (updated)" }, payload.tasks[1]!] });
    expect(second.tasksCreated).toBe(0);
    expect(second.tasksUpdated).toBe(2);
    const after = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.title).toBe("PA3 (updated)");
    expect(after.progress).toBe(60);
    expect(await db.task.count({ where: { userId, deletedAt: null } })).toBe(2);
  });

  it("connects a mock LMS and syncs it through the engine", async () => {
    const integration = await connectIntegration(userId, { provider: "CANVAS", baseUrl: "https://demo.instructure.com" });
    expect(integration.status).toBe("CONNECTED");
    const result = await syncIntegration(userId, integration.id);
    expect(result.coursesCreated).toBeGreaterThan(0);
    expect(result.tasksCreated).toBeGreaterThan(0);
    const log = await db.syncLog.findFirst({ where: { integrationId: integration.id }, orderBy: { startedAt: "desc" } });
    expect(log?.status).toBe("SUCCESS");
    const stored = await db.integration.findUniqueOrThrow({ where: { id: integration.id } });
    expect(stored.accessTokenEncrypted).not.toBe("mock-token"); // encrypted at rest
  });
});

describe.skipIf(!dbAvailable)("documents + retrieval (integration)", () => {
  it("uploads, extracts, chunks, indexes and retrieves a text document", async () => {
    const text = `Derivatives of exponential functions.\n\nFor f(x) = e^x the derivative is e^x. The chain rule extends this: d/dx e^{g(x)} = g'(x) e^{g(x)}.\n\nDerivatives of logarithmic functions.\n\nd/dx ln(x) = 1/x for x > 0. Logarithmic differentiation helps with products and powers.`;
    const doc = await uploadDocument(userId, { fileName: "week4-notes.txt", browserMimeType: "text/plain", data: Buffer.from(text, "utf8") });
    expect(doc.status).toBe("READY");
    expect(doc.chunkCount).toBeGreaterThan(0);
    const chunks = await getDocumentChunks(userId, doc.id);
    expect(chunks[0]!.content).toContain("exponential");

    const hits = await retrieveChunks({ userId, query: "chain rule exponential derivative", limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.documentId).toBe(doc.id);

    const resource = await db.resource.findFirst({ where: { userId, documentId: doc.id } });
    expect(resource?.type).toBe("DOCUMENT");

    await deleteDocument(userId, doc.id);
    expect(await db.documentChunk.count({ where: { documentId: doc.id } })).toBe(0);
  });

  it("rejects files whose bytes do not match their declared type", async () => {
    await expect(uploadDocument(userId, { fileName: "evil.pdf", browserMimeType: "application/pdf", data: Buffer.from("MZ not a pdf") })).rejects.toThrow(/do(es)? not match|unsupported/i);
  });
});

describe.skipIf(!dbAvailable)("grades (integration)", () => {
  it("computes weighted course grades from entered scores", async () => {
    const course = await db.course.create({ data: { userId, name: "Calculus", targetGrade: 90 } });
    const cats = await setGradeCategories(userId, course.id, [
      { name: "Problem Sets", weight: 40, dropLowest: 0 },
      { name: "Exams", weight: 60, dropLowest: 0 },
    ]);
    await createGrade(userId, { courseId: course.id, categoryId: cats[0]!.id, title: "PS1", score: 36, maxScore: 40 });
    await createGrade(userId, { courseId: course.id, categoryId: cats[0]!.id, title: "PS2", score: 32, maxScore: 40 });
    const report = await getCourseGradeReport(userId, course.id);
    expect(report.summary.current).toBe(85);
    expect(report.summary.weightGraded).toBe(40);
    expect(report.required?.needed).toBeCloseTo(93.33, 1);
  });
});
