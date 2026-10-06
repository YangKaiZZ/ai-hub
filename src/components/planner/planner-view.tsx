"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, isSameDay } from "date-fns";
import { CalendarBlankIcon, CalendarCheckIcon, CalendarPlusIcon, CheckCircleIcon, CircleIcon, CircleNotchIcon, PencilSimpleIcon, TrashIcon, XIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { courseStyles } from "@/components/courses/course-visual";
import { ApiClientError, apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { cn, formatMinutes } from "@/lib/utils";
import type { StudyPlanDetail, StudyPreferences } from "@/server/planner/service";

const sessionTypeLabel: Record<string, string> = { REVIEW: "Review", PRACTICE: "Practice", ASSIGNMENT_WORK: "Assignment work", FLASHCARDS: "Flashcards", READING: "Reading", BREAK: "Break" };
const sessionTypeStyle: Record<string, string> = {
  REVIEW: "bg-info-soft text-blue-800 dark:text-blue-200",
  PRACTICE: "bg-primary-soft text-brand-800 dark:text-brand-100",
  ASSIGNMENT_WORK: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200",
  FLASHCARDS: "bg-warning-soft text-amber-800 dark:text-amber-200",
  READING: "bg-success-soft text-green-800 dark:text-green-200",
  BREAK: "bg-surface-muted text-muted",
};

interface Props {
  proposed: StudyPlanDetail | null;
  active: StudyPlanDetail | null;
  history: StudyPlanDetail[];
  preferences: StudyPreferences;
  openTasks: number;
}

export function PlannerView({ proposed, active, history, preferences, openTasks }: Props) {
  const router = useRouter();
  const [generating, setGenerating] = React.useState(false);
  const [days, setDays] = React.useState("7");
  const [prefs, setPrefs] = React.useState(preferences);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<StudyPlanDetail["sessions"][number] | null>(null);

  async function generate() {
    setGenerating(true);
    try {
      await apiPost("/api/planner", { days: Number(days), preferences: prefs, notes: notes || undefined });
      toast.success("Plan drafted — review it below and confirm to add it to your calendar.");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) toast.error(Object.values(err.details)[0] ?? err.message);
      else toast.error(err instanceof Error ? err.message : "Could not generate a plan");
    } finally {
      setGenerating(false);
    }
  }

  async function act(planId: string, action: "confirm" | "discard") {
    if (action === "discard" && !window.confirm("Discard this plan? Its sessions will be removed.")) return;
    setBusy(planId);
    try {
      await apiPost(`/api/planner/${planId}`, { action });
      toast.success(action === "confirm" ? "Plan confirmed and added to your calendar" : "Plan discarded");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update plan");
    } finally {
      setBusy(null);
    }
  }

  async function toggleSession(id: string, completed: boolean) {
    try {
      await apiPatch(`/api/planner/sessions/${id}`, { completed });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update session");
    }
  }

  async function removeSession(id: string) {
    try {
      await apiDelete(`/api/planner/sessions/${id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove session");
    }
  }

  return (
    <div className="space-y-8">
      {/* Generator */}
      <section className="rounded-3xl border border-brand-200 brand-gradient-soft p-6 dark:border-brand-800">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-md">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CalendarPlusIcon className="size-5 text-brand-600 dark:text-brand-300" /> AI Plan My Week
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Tell AI Hub when you can study. It balances your {openTasks} open task{openTasks === 1 ? "" : "s"} by deadline, workload and priority — and nothing lands on your calendar until you confirm.
            </p>
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-3 lg:max-w-2xl">
            <Field id="pl-days" label="Plan length">
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger id="pl-days" className="h-9 bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Today</SelectItem>
                  <SelectItem value="3">Next 3 days</SelectItem>
                  <SelectItem value="7">This week</SelectItem>
                  <SelectItem value="14">Two weeks</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="pl-start" label="Study from (hour)">
              <Input id="pl-start" type="number" min={0} max={23} value={prefs.preferredStartHour} onChange={(e) => setPrefs((p) => ({ ...p, preferredStartHour: Number(e.target.value) }))} className="h-9 bg-surface" />
            </Field>
            <Field id="pl-end" label="Until (hour)">
              <Input id="pl-end" type="number" min={1} max={24} value={prefs.preferredEndHour} onChange={(e) => setPrefs((p) => ({ ...p, preferredEndHour: Number(e.target.value) }))} className="h-9 bg-surface" />
            </Field>
            <Field id="pl-session" label="Session (min)">
              <Input id="pl-session" type="number" min={15} max={180} step={5} value={prefs.sessionMinutes} onChange={(e) => setPrefs((p) => ({ ...p, sessionMinutes: Number(e.target.value) }))} className="h-9 bg-surface" />
            </Field>
            <Field id="pl-max" label="Max per day (min)">
              <Input id="pl-max" type="number" min={30} max={720} step={15} value={prefs.dailyMaxMinutes} onChange={(e) => setPrefs((p) => ({ ...p, dailyMaxMinutes: Number(e.target.value) }))} className="h-9 bg-surface" />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Study days</span>
              <div className="flex flex-wrap gap-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => {
                  const on = prefs.studyDays.includes(i);
                  return (
                    <button key={i} type="button" aria-pressed={on} aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]} onClick={() => setPrefs((p) => ({ ...p, studyDays: on ? p.studyDays.filter((x) => x !== i) : [...p.studyDays, i].sort() }))} className={cn("size-7 rounded-full text-xs font-semibold transition", on ? "bg-primary text-white" : "bg-surface text-muted border border-border")}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="sm:col-span-3">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything the planner should know? (e.g. “I have a shift Thursday evening”, “focus on Calculus”)" className="bg-surface" />
            </div>
            <div className="sm:col-span-3">
              <Button onClick={generate} loading={generating} size="lg" variant="gradient" disabled={openTasks === 0}>
                <CalendarPlusIcon /> {proposed ? "Regenerate plan" : "Generate plan"}
              </Button>
              {openTasks === 0 ? <p className="mt-2 text-xs text-muted">Add a few tasks with deadlines first.</p> : null}
            </div>
          </div>
        </div>
      </section>

      {/* Proposal */}
      {proposed ? (
        <PlanCard
          plan={proposed}
          badge={<Badge variant="warning">Proposed — not on your calendar yet</Badge>}
          actions={
            <>
              <Button variant="ghost" onClick={() => act(proposed.id, "discard")} disabled={busy === proposed.id}>
                <XIcon /> Discard
              </Button>
              <Button onClick={() => act(proposed.id, "confirm")} loading={busy === proposed.id}>
                <CalendarCheckIcon /> Confirm & add to calendar
              </Button>
            </>
          }
          onEdit={setEditing}
          onRemove={removeSession}
        />
      ) : null}

      {/* Active */}
      {active ? (
        <PlanCard
          plan={active}
          badge={<Badge variant="success">Active</Badge>}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/calendar">View in calendar</Link>
              </Button>
              <Button variant="ghost" onClick={() => act(active.id, "discard")} disabled={busy === active.id} className="text-danger hover:text-danger">
                <TrashIcon /> Remove plan
              </Button>
            </>
          }
          onToggle={toggleSession}
          onEdit={setEditing}
          onRemove={removeSession}
        />
      ) : !proposed ? (
        <EmptyState icon={<CalendarBlankIcon />} title="No study plan yet" description="Generate one above. You can edit every session before confirming." />
      ) : null}

      {history.length ? (
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted">Past plans ({history.length})</summary>
          <ul className="mt-3 divide-y divide-border text-sm">
            {history.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>{p.title}</span>
                <span className="text-xs text-subtle">
                  {format(p.startDate, "MMM d")} – {format(p.endDate, "MMM d")} · {p.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <SessionDialog session={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />
    </div>
  );
}

function PlanCard({ plan, badge, actions, onToggle, onEdit, onRemove }: { plan: StudyPlanDetail; badge: React.ReactNode; actions: React.ReactNode; onToggle?: (id: string, completed: boolean) => void; onEdit: (s: StudyPlanDetail["sessions"][number]) => void; onRemove: (id: string) => void }) {
  const days = new Map<string, StudyPlanDetail["sessions"]>();
  for (const s of plan.sessions) {
    const k = format(s.startAt, "yyyy-MM-dd");
    days.set(k, [...(days.get(k) ?? []), s]);
  }
  const totalMinutes = plan.sessions.filter((s) => s.type !== "BREAK").reduce((sum, s) => sum + (s.endAt.getTime() - s.startAt.getTime()) / 60000, 0);
  const done = plan.sessions.filter((s) => s.completedAt).length;

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{plan.title}</h2>
            {badge}
          </div>
          <p className="mt-1 text-xs text-muted">
            {format(plan.startDate, "EEE, MMM d")} – {format(plan.endDate, "EEE, MMM d")} · {formatMinutes(Math.round(totalMinutes))} of study
            {onToggle ? ` · ${done}/${plan.sessions.filter((s) => s.type !== "BREAK").length} done` : ""}
          </p>
          {plan.rationale ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/85">{plan.rationale}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      </header>
      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        {[...days.entries()].map(([k, sessions]) => (
          <div key={k} className="rounded-xl border border-border p-3">
            <p className={cn("mb-2 text-xs font-semibold uppercase tracking-wide", isSameDay(sessions[0]!.startAt, new Date()) ? "text-brand-600 dark:text-brand-300" : "text-subtle")}>{format(sessions[0]!.startAt, "EEEE, MMM d")}</p>
            <ul className="space-y-1.5">
              {sessions.map((s) => (
                <li key={s.id} className={cn("group flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm", sessionTypeStyle[s.type], s.completedAt && "opacity-60")}>
                  {onToggle && s.type !== "BREAK" ? (
                    <button type="button" onClick={() => onToggle(s.id, !s.completedAt)} className="mt-0.5 shrink-0" aria-label={s.completedAt ? "Mark not done" : "Mark done"}>
                      {s.completedAt ? <CheckCircleIcon className="size-4" /> : <CircleIcon className="size-4" />}
                    </button>
                  ) : null}
                  <span className="w-[5.5rem] shrink-0 text-xs tabular-nums opacity-80">
                    {format(s.startAt, "H:mm")}–{format(s.endAt, "H:mm")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate font-medium", s.completedAt && "line-through")}>
                      {s.course ? <span className={cn("mr-1.5 inline-block size-2 rounded-full align-middle", courseStyles(s.course.color).solid)} /> : null}
                      {s.title}
                    </span>
                    <span className="block text-[11px] opacity-75">
                      {sessionTypeLabel[s.type]}
                      {s.notes ? ` · ${s.notes}` : ""}
                    </span>
                  </span>
                  {s.type !== "BREAK" ? (
                    <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button type="button" onClick={() => onEdit(s)} className="rounded p-0.5 hover:bg-white/40" aria-label="Edit session">
                        <PencilSimpleIcon className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => onRemove(s.id)} className="rounded p-0.5 hover:bg-white/40" aria-label="Remove session">
                        <TrashIcon className="size-3.5" />
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function SessionDialog({ session, onClose, onSaved }: { session: StudyPlanDetail["sessions"][number] | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={Boolean(session)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">{session ? <SessionForm key={session.id} session={session} onClose={onClose} onSaved={onSaved} /> : null}</DialogContent>
    </Dialog>
  );
}

function SessionForm({ session, onClose, onSaved }: { session: StudyPlanDetail["sessions"][number]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = React.useState(session.title);
  const [type, setType] = React.useState(session.type);
  const [start, setStart] = React.useState(format(session.startAt, "yyyy-MM-dd'T'HH:mm"));
  const [end, setEnd] = React.useState(format(session.endAt, "yyyy-MM-dd'T'HH:mm"));
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPatch(`/api/planner/sessions/${session.id}`, { title, type, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() });
      toast.success("Session updated");
      onClose();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update session");
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit session</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <Field id="ss-title" label="Title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field id="ss-type" label="Type">
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger id="ss-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(sessionTypeLabel).map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="ss-start" label="Start">
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field id="ss-end" label="End">
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? <CircleNotchIcon className="animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
