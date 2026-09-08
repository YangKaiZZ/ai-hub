import type { Metadata } from "next";
import { TutorView } from "@/components/tutor/tutor-view";
import { requirePageUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { isAppError } from "@/lib/errors";
import { getConversation, listConversations } from "@/server/ai/chat/service";
import { listCourseOptions } from "@/server/courses/service";

export const metadata: Metadata = { title: "AI Tutor" };

export default async function TutorPage({ searchParams }: { searchParams: Promise<{ c?: string; course?: string; task?: string; document?: string; prompt?: string; agent?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;

  let active = null;
  if (sp.c) {
    try {
      active = await getConversation(user.id, sp.c);
    } catch (err) {
      if (!(isAppError(err) && err.code === "NOT_FOUND")) throw err;
    }
  }

  const [conversations, courses, documents, tasks] = await Promise.all([
    listConversations(user.id),
    listCourseOptions(user.id),
    db.document.findMany({ where: { userId: user.id, deletedAt: null, status: "READY" }, select: { id: true, name: true, courseId: true }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.task.findMany({ where: { userId: user.id, deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } }, select: { id: true, title: true, courseId: true }, orderBy: { priorityScore: "desc" }, take: 40 }),
  ]);

  const wantsAgent = sp.agent === "1" || /study tonight|plan my|what should i/i.test(sp.prompt ?? "");

  return (
    <TutorView
      key={active?.id ?? "new"}
      conversations={conversations}
      active={active}
      courses={courses}
      documents={documents}
      tasks={tasks}
      initialContext={{ courseId: sp.course, taskId: sp.task, documentId: sp.document, prompt: sp.prompt, kind: wantsAgent ? "AGENT" : "TUTOR" }}
    />
  );
}
