"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileText, NotebookPen, Plus, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useChatStream, type ChatMessage } from "@/components/chat/use-chat-stream";
import { CourseIcon } from "@/components/courses/course-visual";
import { PriorityBadge } from "@/components/tasks/priority-badge";
import { Markdown } from "@/components/chat/markdown";
import { apiPatch } from "@/lib/client/api";
import { cn, formatDeadline, formatMinutes } from "@/lib/utils";
import type { WorkspaceDetail } from "@/server/workspace/service";
import type { ChecklistItem } from "@/server/workspace/service";
import { parseTaskAnalysis } from "@/server/ai/intelligence/normalize";

const SUGGESTIONS = ["Explain this assignment", "Break this into steps", "Help me understand the rubric", "What should I do first?", "Check my work", "Give me practice questions"];

function toMessages(ws: WorkspaceDetail): ChatMessage[] {
  return ws.messages
    .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
    .map((m) => ({ id: m.id, role: m.role as "USER" | "ASSISTANT", content: m.content, sources: (m.sources as ChatMessage["sources"]) ?? null, createdAt: m.createdAt.toString() }));
}

export function WorkspaceView({ workspace }: { workspace: WorkspaceDetail }) {
  const router = useRouter();
  const task = workspace.task;
  const analysis = parseTaskAnalysis(task.aiAnalysis);
  const rubric = (task.rubric as { criterion: string; points?: number; description?: string }[] | null) ?? null;

  const [draft, setDraft] = React.useState(workspace.draft);
  const [notes, setNotes] = React.useState(workspace.notes);
  const [checklist, setChecklist] = React.useState<ChecklistItem[]>((workspace.checklist as ChecklistItem[]) ?? []);
  const [mode, setMode] = React.useState(workspace.assistanceMode);
  const [saving, setSaving] = React.useState<"draft" | "notes" | null>(null);
  const [newItem, setNewItem] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const dirty = draft !== workspace.draft || notes !== workspace.notes;

  const chat = useChatStream(toMessages(workspace), { workspaceId: workspace.id });

  async function save(field: "draft" | "notes") {
    setSaving(field);
    try {
      await apiPatch(`/api/workspaces/${workspace.id}`, field === "draft" ? { draft } : { notes });
      toast.success(field === "draft" ? "Draft saved" : "Notes saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(null);
    }
  }

  async function persistChecklist(next: ChecklistItem[]) {
    setChecklist(next);
    try {
      await apiPatch(`/api/workspaces/${workspace.id}`, { checklist: next });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update checklist");
    }
  }

  async function changeMode(v: string) {
    setMode(v as typeof mode);
    try {
      await apiPatch(`/api/workspaces/${workspace.id}`, { assistanceMode: v });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change mode");
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("taskId", task.id);
        if (task.course?.id) form.append("courseId", task.course.id);
        const res = await fetch("/api/documents", { method: "POST", body: form });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message: string } } | null)?.error?.message ?? "Upload failed");
      }
      toast.success("File attached");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const importSteps = () => {
    if (!analysis?.recommendedSteps.length) return;
    const existing = new Set(checklist.map((c) => c.text.toLowerCase()));
    const added = analysis.recommendedSteps.filter((s) => !existing.has(s.toLowerCase())).map((s, i) => ({ id: `ai-${Date.now()}-${i}`, text: s, done: false, source: "ai" as const }));
    if (added.length === 0) return toast.info("All suggested steps are already in your checklist.");
    void persistChecklist([...checklist, ...added]);
  };

  const done = checklist.filter((c) => c.done).length;

  return (
    <div className="-mx-4 -mt-6 flex min-h-[calc(100dvh-4rem)] flex-col sm:-mx-6 lg:-mx-8 lg:-mb-10">
      {/* Top bar */}
      <div className="border-b border-border bg-surface/80 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <Link href={`/tasks/${task.id}`} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Task details
        </Link>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {task.course ? <CourseIcon icon={task.course.icon} color={task.course.color} /> : null}
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted">{task.course?.name ?? "Personal task"}</p>
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{task.title}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-muted">{formatDeadline(task.dueDate)}</span>
            <span className="text-muted">Est. {formatMinutes(task.estimatedMinutes)}</span>
            <PriorityBadge priority={task.priority} />
            <div className="flex w-40 items-center gap-2">
              <Progress value={task.progress} size="sm" />
              <span className="text-xs tabular-nums text-muted">{task.progress}%</span>
            </div>
            <Select value={mode} onValueChange={changeMode}>
              <SelectTrigger className="h-8 w-[10.5rem]" aria-label="Assistance mode">
                <Sparkles className="size-3.5 text-brand-500" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LEARNING">Learning mode</SelectItem>
                <SelectItem value="GUIDED">Guided mode</SelectItem>
                <SelectItem value="REVIEW">Review mode</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Left: sections */}
        <div className="min-h-0 overflow-y-auto px-4 py-5 scrollbar-thin sm:px-6 lg:px-8">
          <Tabs defaultValue="overview">
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="instructions">Instructions</TabsTrigger>
              <TabsTrigger value="files">Files ({task.attachments.length})</TabsTrigger>
              <TabsTrigger value="work">My Work</TabsTrigger>
              <TabsTrigger value="checklist">
                Checklist {checklist.length ? `${done}/${checklist.length}` : ""}
              </TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="sources">Sources</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {workspace.aiOverview ? (
                <div className="rounded-2xl brand-gradient-soft border border-brand-200 p-4 text-sm dark:border-brand-800">
                  <p className="mb-1 flex items-center gap-1.5 font-semibold text-brand-800 dark:text-brand-100">
                    <Sparkles className="size-4" /> AI overview
                  </p>
                  <p className="text-brand-900/85 dark:text-brand-100/85">{workspace.aiOverview}</p>
                </div>
              ) : null}
              {task.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p> : <p className="text-sm text-muted">No description. Add one on the task page so the AI has more to work with.</p>}
              {analysis ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Difficulty</p>
                    <p className="mt-1 text-sm font-medium capitalize">{analysis.difficulty.replace("_", " ")}</p>
                    <p className="text-xs text-muted">~{formatMinutes(analysis.estimatedMinutes)} of work</p>
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Key concepts</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {analysis.keyConcepts.map((k) => (
                        <Badge key={k} variant="outline">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-subtle">Tip: run AI analysis from the task page to get difficulty, key concepts and suggested steps here.</p>
              )}
              {rubric?.length ? (
                <div className="rounded-xl border border-border p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Rubric</p>
                  <ul className="divide-y divide-border text-sm">
                    {rubric.map((r, i) => (
                      <li key={i} className="flex justify-between gap-3 py-2">
                        <span>{r.criterion}</span>
                        {r.points != null ? <span className="text-xs text-muted">{r.points} pts</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="instructions">
              {task.instructions ? (
                <div className="rounded-xl border border-border p-4 text-sm">
                  <Markdown text={task.instructions} />
                </div>
              ) : (
                <p className="text-sm text-muted">No instructions were added. Paste the brief on the task page.</p>
              )}
            </TabsContent>

            <TabsContent value="files" className="space-y-3">
              <label className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong px-4 py-5 text-sm text-muted transition hover:border-brand-300 hover:bg-surface-muted", uploading && "opacity-60")}>
                <Upload className="size-4" /> {uploading ? "Uploading…" : "Attach files to this assignment"}
                <input type="file" multiple className="hidden" onChange={(e) => void upload(e.target.files)} disabled={uploading} />
              </label>
              {task.attachments.length === 0 ? (
                <p className="text-sm text-muted">No files yet. Attach the brief, datasets or references and the AI can search inside them.</p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {task.attachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <FileText className="size-4 text-subtle" />
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      {a.document ? <Badge variant={a.document.status === "READY" ? "success" : "warning"}>{a.document.status.toLowerCase()}</Badge> : null}
                      {a.document ? (
                        <a href={`/api/documents/${a.document.id}/file?download=1`} className="text-subtle hover:text-foreground" aria-label="Download">
                          <Download className="size-4" />
                        </a>
                      ) : a.url ? (
                        <a href={a.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          Open
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="work" className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">Your draft. Ask the AI to “check my work” and it will review what is here.</p>
                <Button size="sm" onClick={() => save("draft")} loading={saving === "draft"} disabled={draft === workspace.draft}>
                  <Save /> Save
                </Button>
              </div>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={18} placeholder="Start writing, outlining or pasting your work here…" className="font-mono text-[13px] leading-relaxed" />
              {dirty ? <p className="text-xs text-warning">Unsaved changes</p> : null}
            </TabsContent>

            <TabsContent value="checklist" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">
                  {checklist.length ? `${done} of ${checklist.length} done` : "Break the assignment into steps."}
                </p>
                {analysis?.recommendedSteps.length ? (
                  <Button size="sm" variant="secondary" onClick={importSteps}>
                    <Sparkles /> Add AI suggested steps
                  </Button>
                ) : null}
              </div>
              <ul className="space-y-1.5">
                {checklist.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
                    <Checkbox checked={item.done} onCheckedChange={(v) => void persistChecklist(checklist.map((c) => (c.id === item.id ? { ...c, done: Boolean(v) } : c)))} aria-label={item.text} />
                    <span className={cn("flex-1 text-sm", item.done && "text-muted line-through")}>{item.text}</span>
                    {item.source === "ai" ? <Sparkles className="size-3.5 text-brand-400" aria-label="Suggested by AI" /> : null}
                    <button type="button" onClick={() => void persistChecklist(checklist.filter((c) => c.id !== item.id))} className="text-subtle hover:text-danger" aria-label="Remove item">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newItem.trim()) return;
                  void persistChecklist([...checklist, { id: `u-${Date.now()}`, text: newItem.trim(), done: false, source: "user" }]);
                  setNewItem("");
                }}
                className="flex gap-2"
              >
                <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a step" aria-label="New checklist item" />
                <Button type="submit" variant="outline" disabled={!newItem.trim()}>
                  <Plus /> Add
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="notes" className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <NotebookPen className="size-4" /> Scratch notes, questions for your instructor, ideas.
                </p>
                <Button size="sm" onClick={() => save("notes")} loading={saving === "notes"} disabled={notes === workspace.notes}>
                  <Save /> Save
                </Button>
              </div>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={14} placeholder="Notes…" />
            </TabsContent>

            <TabsContent value="sources">
              <SourcesTab messages={chat.messages} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: AI */}
        <section className="flex min-h-[60dvh] flex-col border-t border-border bg-surface/40 lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <Sparkles className="size-4 text-brand-500" />
            <p className="text-sm font-semibold">Ask AI about this assignment</p>
          </div>
          <ChatPanel
            messages={chat.messages}
            streaming={chat.streaming}
            error={chat.error}
            onSend={chat.send}
            onStop={chat.stop}
            suggestions={SUGGESTIONS}
            provider={chat.provider}
            emptyTitle="Where do you want to start?"
            emptyDescription="I know this assignment, its rubric, your files and your draft. Pick a prompt or ask your own question."
            placeholder="Ask about the assignment, the rubric, or your draft…"
            className="flex-1"
          />
        </section>
      </div>
    </div>
  );
}

function SourcesTab({ messages }: { messages: ChatMessage[] }) {
  const refs = messages.flatMap((m) => m.sources ?? []);
  const unique = refs.filter((s, i, arr) => arr.findIndex((x) => x.chunkId === s.chunkId) === i);
  if (unique.length === 0) return <p className="text-sm text-muted">Sources the AI cites from your files will appear here.</p>;
  return (
    <ul className="space-y-2">
      {unique.map((s) => (
        <li key={s.chunkId} className="rounded-xl border border-border p-3 text-sm">
          <Link href={`/resources?document=${s.documentId}#chunk-${s.chunkId}`} className="font-medium text-primary hover:underline">
            {s.title}
            {s.page ? `, p. ${s.page}` : ""}
          </Link>
          <p className="mt-1 text-xs text-muted">{s.snippet}</p>
        </li>
      ))}
    </ul>
  );
}
