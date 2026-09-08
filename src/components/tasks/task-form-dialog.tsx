"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { ApiClientError, apiPatch, apiPost } from "@/lib/client/api";
import { taskTypeLabel } from "@/components/tasks/priority-badge";

export interface CourseOption {
  id: string;
  name: string;
  code: string | null;
  color: string;
}

export interface TaskFormValues {
  id?: string;
  title: string;
  description: string;
  courseId: string;
  type: string;
  dueDate: string; // yyyy-MM-ddTHH:mm
  estimatedMinutes: string;
  importance: string;
  instructions?: string;
}

const NONE = "__none__";

function toLocalInput(d: Date | string | null | undefined) {
  if (!d) return "";
  return format(new Date(d), "yyyy-MM-dd'T'HH:mm");
}

export function emptyTaskForm(courseId = ""): TaskFormValues {
  return { title: "", description: "", courseId, type: "ASSIGNMENT", dueDate: "", estimatedMinutes: "", importance: "3", instructions: "" };
}

export function taskToForm(task: {
  id: string;
  title: string;
  description: string | null;
  instructions?: string | null;
  type: string;
  dueDate: Date | string | null;
  estimatedMinutes: number | null;
  importance: number;
  course: { id: string } | null;
}): TaskFormValues {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? "",
    instructions: task.instructions ?? "",
    courseId: task.course?.id ?? "",
    type: task.type,
    dueDate: toLocalInput(task.dueDate),
    estimatedMinutes: task.estimatedMinutes ? String(task.estimatedMinutes) : "",
    importance: String(task.importance),
  };
}

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  courses: CourseOption[];
  initial?: TaskFormValues;
  onSaved?: (task: { id: string }) => void;
}

export function TaskFormDialog({ open, onOpenChange, courses, initial, onSaved }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {/* Remounts on every open so the form state always matches `initial`. */}
        {open ? <TaskForm key={initial?.id ?? "new"} initial={initial ?? emptyTaskForm()} courses={courses} onOpenChange={onOpenChange} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({
  initial,
  courses,
  onOpenChange,
  onSaved,
}: {
  initial: TaskFormValues;
  courses: CourseOption[];
  onOpenChange: (o: boolean) => void;
  onSaved?: (task: { id: string }) => void;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<TaskFormValues>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const isEdit = Boolean(values.id);

  const set = <K extends keyof TaskFormValues>(k: K, v: TaskFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = {
      title: values.title,
      description: values.description || null,
      instructions: values.instructions || null,
      courseId: values.courseId || null,
      type: values.type,
      dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : null,
      estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : null,
      importance: Number(values.importance),
    };
    try {
      const res = isEdit
        ? await apiPatch<{ task: { id: string } }>(`/api/tasks/${values.id}`, payload)
        : await apiPost<{ task: { id: string } }>("/api/tasks", payload);
      toast.success(isEdit ? "Task updated" : "Task created");
      onOpenChange(false);
      onSaved?.(res.task);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) setErrors(err.details);
      else toast.error(err instanceof Error ? err.message : "Could not save task");
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit task" : "New task"}</DialogTitle>
        <DialogDescription>{isEdit ? "Update the details and AI Hub will re-prioritize it." : "Add an assignment, quiz, exam or anything else you need to get done."}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="task-title" label="Title" required error={errors.title}>
          <Input value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="ERD Design Project" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="task-course" label="Course" error={errors.courseId}>
            <Select value={values.courseId || NONE} onValueChange={(v) => set("courseId", v === NONE ? "" : v)}>
              <SelectTrigger id="task-course">
                <SelectValue placeholder="No course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No course</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code ? `${c.code} · ` : ""}
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="task-type" label="Type" error={errors.type}>
            <Select value={values.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger id="task-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(taskTypeLabel).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="task-due" label="Deadline" error={errors.dueDate}>
            <Input type="datetime-local" value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </Field>
          <Field id="task-est" label="Estimated time (min)" error={errors.estimatedMinutes}>
            <Input type="number" min={0} step={15} value={values.estimatedMinutes} onChange={(e) => set("estimatedMinutes", e.target.value)} placeholder="90" />
          </Field>
          <Field id="task-importance" label="Importance" error={errors.importance}>
            <Select value={values.importance} onValueChange={(v) => set("importance", v)}>
              <SelectTrigger id="task-importance">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["1", "1 · Minor"],
                  ["2", "2 · Low"],
                  ["3", "3 · Normal"],
                  ["4", "4 · Important"],
                  ["5", "5 · Critical"],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v!}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field id="task-desc" label="Description" error={errors.description}>
          <Textarea value={values.description} onChange={(e) => set("description", e.target.value)} placeholder="What is this task about?" rows={3} />
        </Field>
        <Field id="task-instructions" label="Instructions (optional)" hint="Paste the brief from your instructor — the AI uses it to analyze the task." error={errors.instructions}>
          <Textarea value={values.instructions ?? ""} onChange={(e) => set("instructions", e.target.value)} rows={4} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
