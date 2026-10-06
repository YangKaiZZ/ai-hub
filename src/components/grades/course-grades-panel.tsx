"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, SlidersHorizontalIcon, TargetIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { ApiClientError, apiDelete, apiPost } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";
import type { CourseGradeReport } from "@/server/grades/service";

const NONE = "__none__";

export function CourseGradesPanel({ report }: { report: CourseGradeReport }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);
  const [catOpen, setCatOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const { summary } = report;

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete grade “${title}”?`)) return;
    setBusy(id);
    try {
      await apiDelete(`/api/grades/${id}`);
      toast.success("Grade removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete grade");
    } finally {
      setBusy(null);
    }
  }

  const tone = summary.current == null ? "neutral" : report.course.targetGrade != null && summary.current < report.course.targetGrade ? "warning" : "success";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted">Current grade</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{summary.current != null ? `${summary.current}%` : "—"}</p>
            </div>
            {report.course.targetGrade != null ? (
              <Badge variant={tone === "success" ? "success" : tone === "warning" ? "warning" : "default"}>
                <TargetIcon /> Target {report.course.targetGrade}%
              </Badge>
            ) : null}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-surface-muted px-3 py-2">
              <dt className="text-xs text-subtle">Projected</dt>
              <dd className="font-semibold tabular-nums">{summary.projected != null ? `${summary.projected}%` : "—"}</dd>
            </div>
            <div className="rounded-xl bg-surface-muted px-3 py-2">
              <dt className="text-xs text-subtle">Weight graded</dt>
              <dd className="font-semibold tabular-nums">{summary.weightGraded}%</dd>
            </div>
          </dl>
          {report.required ? (
            <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${report.required.achievable ? "bg-info-soft text-blue-800 dark:text-blue-200" : "bg-danger-soft text-red-800 dark:text-red-200"}`}>
              {report.required.achievable
                ? `You need to average ${report.required.needed}% on the remaining work to reach your ${report.course.targetGrade}% target.`
                : `Reaching ${report.course.targetGrade}% would need ${report.required.needed}% on remaining work. Consider adjusting your target.`}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Category breakdown</h3>
            <Button variant="ghost" size="sm" onClick={() => setCatOpen(true)}>
              <SlidersHorizontalIcon /> Edit weights
            </Button>
          </div>
          {summary.categories.length === 0 ? (
            <p className="text-sm text-muted">No weighted categories yet. Grades are averaged by points until you add some.</p>
          ) : (
            <ul className="space-y-3">
              {summary.categories.map((c) => (
                <li key={c.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {c.name} <span className="text-xs text-subtle">· {c.weight}%</span>
                    </span>
                    <span className="tabular-nums text-muted">{c.percent != null ? `${c.percent}%` : "—"}</span>
                  </div>
                  <Progress value={c.percent ?? 0} size="sm" tone={c.percent == null ? "neutral" : c.percent >= 85 ? "success" : c.percent >= 70 ? "brand" : "warning"} />
                  <p className="mt-1 text-[11px] text-subtle">
                    {c.count} item{c.count === 1 ? "" : "s"}
                    {c.dropped ? ` · ${c.dropped} dropped` : ""}
                  </p>
                </li>
              ))}
              {summary.uncategorized.count > 0 ? (
                <li className="text-xs text-subtle">
                  {summary.uncategorized.count} uncategorized grade{summary.uncategorized.count === 1 ? "" : "s"} ({summary.uncategorized.percent}%) not included in the weighted total.
                </li>
              ) : null}
            </ul>
          )}
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Score history</h3>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon /> Add grade
          </Button>
        </div>
        {report.grades.length === 0 ? (
          <EmptyState compact title="No grades yet" description="Enter scores as you get them back to track your standing." action={<Button size="sm" onClick={() => setAddOpen(true)}><PlusIcon /> Add grade</Button>} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Item</th>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Score</th>
                  <th className="px-4 py-2.5 text-right font-semibold">%</th>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.grades.map((g) => (
                  <tr key={g.id} className={busy === g.id ? "opacity-50" : ""}>
                    <td className="px-4 py-2.5 font-medium">{g.title}</td>
                    <td className="px-4 py-2.5 text-muted">{g.categoryName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {g.score}/{g.maxScore}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{g.percent}%</td>
                    <td className="px-4 py-2.5 text-muted">{formatDate(g.gradedAt)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <Button variant="ghost" size="icon-sm" aria-label="Delete grade" onClick={() => remove(g.id, g.title)}>
                        <TrashIcon />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddGradeDialog open={addOpen} onOpenChange={setAddOpen} courseId={report.course.id} categories={report.categories} />
      <CategoriesDialog open={catOpen} onOpenChange={setCatOpen} courseId={report.course.id} categories={report.categories} />
    </div>
  );
}

function AddGradeDialog({ open, onOpenChange, courseId, categories }: { open: boolean; onOpenChange: (o: boolean) => void; courseId: string; categories: CourseGradeReport["categories"] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open ? <AddGradeForm courseId={courseId} categories={categories} onOpenChange={onOpenChange} /> : null}</DialogContent>
    </Dialog>
  );
}

function AddGradeForm({ courseId, categories, onOpenChange }: { courseId: string; categories: CourseGradeReport["categories"]; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [categoryId, setCategoryId] = React.useState<string>(categories[0]?.id ?? NONE);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const f = new FormData(e.currentTarget);
    try {
      await apiPost("/api/grades", {
        courseId,
        categoryId: categoryId === NONE ? null : categoryId,
        title: f.get("title"),
        score: f.get("score"),
        maxScore: f.get("maxScore"),
        gradedAt: f.get("gradedAt") ? new Date(String(f.get("gradedAt"))).toISOString() : undefined,
      });
      toast.success("Grade added");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) setErrors(err.details);
      else toast.error(err instanceof Error ? err.message : "Could not add grade");
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add grade</DialogTitle>
        <DialogDescription>Record a score you received. Your course average updates instantly.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="grade-title" label="Item" required error={errors.title}>
          <Input name="title" placeholder="Quiz 3" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field id="grade-score" label="Score" required error={errors.score}>
            <Input name="score" type="number" step="0.01" min={0} placeholder="17" />
          </Field>
          <Field id="grade-max" label="Out of" required error={errors.maxScore}>
            <Input name="maxScore" type="number" step="0.01" min={0.01} placeholder="20" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="grade-category" label="Category" error={errors.categoryId}>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="grade-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.weight}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="grade-date" label="Date" error={errors.gradedAt}>
            <Input name="gradedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Add grade
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function CategoriesDialog({ open, onOpenChange, courseId, categories }: { open: boolean; onOpenChange: (o: boolean) => void; courseId: string; categories: CourseGradeReport["categories"] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open ? <CategoriesForm courseId={courseId} categories={categories} onOpenChange={onOpenChange} /> : null}</DialogContent>
    </Dialog>
  );
}

function CategoriesForm({ courseId, categories, onOpenChange }: { courseId: string; categories: CourseGradeReport["categories"]; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [rows, setRows] = React.useState(categories.length ? categories.map((c) => ({ id: c.id as string | undefined, name: c.name, weight: String(c.weight), dropLowest: String(c.dropLowest) })) : [{ id: undefined, name: "Assignments", weight: "40", dropLowest: "0" }, { id: undefined, name: "Exams", weight: "60", dropLowest: "0" }]);
  const [saving, setSaving] = React.useState(false);
  const total = rows.reduce((s, r) => s + (Number(r.weight) || 0), 0);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/courses/${courseId}/grade-categories`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: rows.filter((r) => r.name.trim()).map((r) => ({ id: r.id, name: r.name, weight: Number(r.weight) || 0, dropLowest: Number(r.dropLowest) || 0 })) }),
      }).then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? "Could not save categories");
      });
      toast.success("Categories saved");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save categories");
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Grade categories</DialogTitle>
        <DialogDescription>Set how each category is weighted. Weights should add up to 100%.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_5rem_auto] items-center gap-2">
            <Input aria-label="Category name" value={r.name} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Quizzes" />
            <Input aria-label="Weight %" type="number" min={0} max={100} value={r.weight} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} />
            <Input aria-label="Drop lowest" type="number" min={0} max={10} value={r.dropLowest} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, dropLowest: e.target.value } : x)))} title="Drop lowest N" />
            <Button variant="ghost" size="icon-sm" aria-label="Remove category" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
              <TrashIcon />
            </Button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_5rem_5rem_auto] gap-2 text-[11px] text-subtle">
          <span>Name</span>
          <span>Weight %</span>
          <span>Drop lowest</span>
          <span />
        </div>
        <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { id: undefined, name: "", weight: "0", dropLowest: "0" }])} disabled={rows.length >= 20}>
          <PlusIcon /> Add category
        </Button>
        <p className={`text-sm ${Math.abs(total - 100) < 0.01 ? "text-success" : "text-warning"}`}>Total weight: {total}%</p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
