"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, MessageSquare, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toaster";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useChatStream, type ChatMessage } from "@/components/chat/use-chat-stream";
import { CourseDot } from "@/components/courses/course-visual";
import { apiDelete, apiPatch } from "@/lib/client/api";
import { cn, formatRelative } from "@/lib/utils";
import type { ConversationDetail, ConversationListItem } from "@/server/ai/chat/service";

const NONE = "__none__";

interface Props {
  conversations: ConversationListItem[];
  active: ConversationDetail | null;
  courses: { id: string; name: string; code: string | null; color: string }[];
  documents: { id: string; name: string; courseId: string | null }[];
  tasks: { id: string; title: string; courseId: string | null }[];
  initialContext: { courseId?: string; taskId?: string; documentId?: string; prompt?: string; kind: "TUTOR" | "AGENT" };
}

const TUTOR_SUGGESTIONS = ["Explain this concept in simpler terms", "Give me practice questions on this topic", "Check my reasoning on this problem", "Help me understand this rubric"];
const AGENT_SUGGESTIONS = ["What should I study tonight?", "Plan my week around my deadlines", "Which task is my highest priority right now?", "How am I doing in my courses?"];

function toMessages(conv: ConversationDetail | null): ChatMessage[] {
  if (!conv) return [];
  return conv.messages
    .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
    .map((m) => ({ id: m.id, role: m.role as "USER" | "ASSISTANT", content: m.content, sources: (m.sources as ChatMessage["sources"]) ?? null, toolCalls: ((m.toolCalls as { name: string; label: string; ok?: boolean; summary?: string }[] | null) ?? []).map((t) => ({ name: t.name, label: t.label, status: t.ok === false ? "error" : "ok", summary: t.summary })) as ChatMessage["toolCalls"], createdAt: m.createdAt.toString() }));
}

export function TutorView({ conversations, active, courses, documents, tasks, initialContext }: Props) {
  const router = useRouter();
  const [kind, setKind] = React.useState<"TUTOR" | "AGENT">(active?.kind === "AGENT" ? "AGENT" : initialContext.kind);
  const [courseId, setCourseId] = React.useState<string>(active?.course?.id ?? initialContext.courseId ?? NONE);
  const [taskId, setTaskId] = React.useState<string>(active?.task?.id ?? initialContext.taskId ?? NONE);
  const [docIds, setDocIds] = React.useState<string[]>(active?.contextDocumentIds ?? (initialContext.documentId ? [initialContext.documentId] : []));
  const [mode, setMode] = React.useState<"LEARNING" | "GUIDED" | "REVIEW">(active?.assistanceMode ?? "GUIDED");
  const [contextOpen, setContextOpen] = React.useState(false);

  // A conversation created on the fly keeps streaming in this component; we only
  // update the URL immediately and sync server state once the stream has settled.
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const conversationId = active?.id ?? createdId;

  const target = React.useMemo(
    () =>
      conversationId
        ? { conversationId }
        : { create: { kind, courseId: courseId === NONE ? null : courseId, taskId: taskId === NONE ? null : taskId, documentIds: docIds, assistanceMode: mode } },
    [conversationId, kind, courseId, taskId, docIds, mode],
  );

  const chat = useChatStream(toMessages(active), target, (id) => {
    setCreatedId(id);
    window.history.replaceState(null, "", `/tutor?c=${id}`);
  });

  const needsSync = React.useRef(false);
  React.useEffect(() => {
    if (createdId && chat.streaming) needsSync.current = true;
    if (createdId && !chat.streaming && needsSync.current) {
      needsSync.current = false;
      router.refresh();
    }
  }, [createdId, chat.streaming, router]);

  // Persist context changes on an existing conversation.
  async function persistContext(patch: Record<string, unknown>) {
    if (!active) return;
    try {
      await apiPatch(`/api/ai/conversations/${active.id}`, patch);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update context");
    }
  }

  async function removeConversation(id: string) {
    if (!window.confirm("Delete this conversation?")) return;
    try {
      await apiDelete(`/api/ai/conversations/${id}`);
      toast.success("Conversation deleted");
      router.push("/tutor");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  const suggestions = kind === "AGENT" ? AGENT_SUGGESTIONS : TUTOR_SUGGESTIONS;
  const courseDocs = documents.filter((d) => courseId === NONE || d.courseId === courseId || docIds.includes(d.id));

  const contextPanel = (
    <div className="flex h-full flex-col gap-5 p-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Mode</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1">
          {(["TUTOR", "AGENT"] as const).map((k) => (
            <button key={k} type="button" disabled={Boolean(active)} onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("rounded-lg px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed", kind === k ? "bg-surface shadow-sm" : "text-muted")}>
              {k === "TUTOR" ? "Tutor" : "Study agent"}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">{kind === "AGENT" ? "Uses your tasks, deadlines and calendar to plan and can add tasks or draft study plans." : "Explains concepts and guides you through problems. Can look up your notes."}</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Assistance level</p>
        <Select
          value={mode}
          onValueChange={(v) => {
            setMode(v as typeof mode);
            void persistContext({ assistanceMode: v });
          }}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LEARNING">Learning — hints first</SelectItem>
            <SelectItem value="GUIDED">Guided — step by step</SelectItem>
            <SelectItem value="REVIEW">Review — feedback on my work</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Course</p>
        <Select
          value={courseId}
          onValueChange={(v) => {
            setCourseId(v);
            void persistContext({ courseId: v === NONE ? null : v });
          }}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Any course" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Any course</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Assignment</p>
        <Select
          value={taskId}
          onValueChange={(v) => {
            setTaskId(v);
            void persistContext({ taskId: v === NONE ? null : v });
          }}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {tasks
              .filter((t) => courseId === NONE || t.courseId === courseId)
              .map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Documents in context</p>
        {courseDocs.length === 0 ? (
          <p className="text-xs text-muted">Upload notes or slides in Resources to let the tutor cite them.</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto scrollbar-thin">
            {courseDocs.map((d) => {
              const on = docIds.includes(d.id);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? docIds.filter((x) => x !== d.id) : [...docIds, d.id];
                      setDocIds(next);
                      void persistContext({ documentIds: next });
                    }}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition", on ? "bg-primary-soft text-brand-800 dark:text-brand-100" : "hover:bg-surface-muted")}
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{d.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-1.5 text-[11px] text-subtle">{docIds.length ? `${docIds.length} pinned. Only these are searched.` : "Nothing pinned — the tutor searches documents for the selected course."}</p>
      </div>
    </div>
  );

  return (
    <div className="-mx-4 -mt-6 flex h-[calc(100dvh-4rem)] flex-col overflow-hidden sm:-mx-6 lg:-mx-8 lg:-mb-10 lg:h-[calc(100dvh-4rem)]">
      <div className="grid min-h-0 flex-1 lg:grid-cols-[16rem_minmax(0,1fr)_17rem]">
        {/* Conversations */}
        <aside className="hidden min-h-0 flex-col border-r border-border bg-surface/60 lg:flex">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold">Conversations</h2>
            <Button asChild size="icon-sm" variant="ghost" aria-label="New conversation">
              <a href="/tutor">
                <Plus />
              </a>
            </Button>
          </div>
          <ConversationList conversations={conversations} activeId={active?.id} onDelete={removeConversation} />
        </aside>

        {/* Chat */}
        <section className="flex min-h-0 flex-col">
          <header className="flex items-center gap-2 border-b border-border px-4 py-2.5 sm:px-6">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Conversations">
                  <MessageSquare />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0">
                <SheetTitle className="px-4 py-3 text-sm font-semibold">Conversations</SheetTitle>
                <ConversationList conversations={conversations} activeId={active?.id} onDelete={removeConversation} />
                <div className="p-3">
                  <Button asChild className="w-full" size="sm">
                    <a href="/tutor">
                      <Plus /> New conversation
                    </a>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{active?.title ?? (kind === "AGENT" ? "Study agent" : "AI Tutor")}</p>
              <p className="truncate text-xs text-muted">
                {[active?.course?.name ?? courses.find((c) => c.id === courseId)?.name, active?.task?.title ?? tasks.find((t) => t.id === taskId)?.title].filter(Boolean).join(" · ") || (kind === "AGENT" ? "Plans around your real deadlines" : "Math, code, writing, science and more")}
              </p>
            </div>
            <Badge variant="brand" className="hidden sm:inline-flex">
              <Sparkles /> {mode.charAt(0) + mode.slice(1).toLowerCase()}
            </Badge>
            <Sheet open={contextOpen} onOpenChange={setContextOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  Context
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0">
                <SheetTitle className="px-4 py-3 text-sm font-semibold">Context</SheetTitle>
                {contextPanel}
              </SheetContent>
            </Sheet>
          </header>
          <ChatPanel
            messages={chat.messages}
            streaming={chat.streaming}
            error={chat.error}
            onSend={chat.send}
            onStop={chat.stop}
            suggestions={suggestions}
            provider={chat.provider}
            emptyTitle={kind === "AGENT" ? "What should we plan?" : "How can I help you study?"}
            emptyDescription={kind === "AGENT" ? "I can look at your deadlines, workload and preferences to build tonight's plan or your week." : "Ask about a concept, a problem, or your own notes. I will explain, guide and check — not do the work for you."}
            initialInput={initialContext.prompt}
            className="flex-1"
          />
        </section>

        {/* Context */}
        <aside className="hidden min-h-0 border-l border-border bg-surface/60 lg:block">{contextPanel}</aside>
      </div>
    </div>
  );
}

function ConversationList({ conversations, activeId, onDelete }: { conversations: ConversationListItem[]; activeId?: string; onDelete: (id: string) => void }) {
  if (conversations.length === 0) {
    return <p className="px-4 py-6 text-center text-xs text-muted">No conversations yet.</p>;
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
      {conversations.map((c) => (
        <li key={c.id} className="group relative">
          <a href={`/tutor?c=${c.id}`} className={cn("block rounded-xl px-3 py-2.5 pr-8 transition", c.id === activeId ? "bg-primary-soft" : "hover:bg-surface-muted")}>
            <p className="truncate text-sm font-medium">{c.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-subtle">
              {c.kind === "AGENT" ? <Sparkles className="size-3" /> : c.course ? <CourseDot color={c.course.color} /> : <BookOpen className="size-3" />}
              <span className="truncate">{c.course?.name ?? (c.kind === "AGENT" ? "Study agent" : c.subject ?? "General")}</span>
              <span>· {formatRelative(c.updatedAt)}</span>
            </p>
          </a>
          <button type="button" onClick={() => onDelete(c.id)} className="absolute right-2 top-2.5 rounded-md p-1 text-subtle opacity-0 transition hover:bg-danger-soft hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label="Delete conversation">
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
