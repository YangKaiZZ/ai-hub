"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwiseIcon, CheckCircleIcon, DotsThreeIcon, PencilSimpleIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { TaskFormDialog, taskToForm, type CourseOption } from "@/components/tasks/task-form-dialog";
import { priorityLabel, statusLabel } from "@/components/tasks/priority-badge";
import { apiDelete, apiPatch } from "@/lib/client/api";
import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

interface TaskLike {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  type: string;
  status: TaskStatus;
  priority: TaskPriority;
  priorityLocked: boolean;
  progress: number;
  dueDate: Date | null;
  estimatedMinutes: number | null;
  importance: number;
  course: { id: string } | null;
}

export function TaskDetailActions({ task, courses }: { task: TaskLike; courses: CourseOption[] }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(task.progress);

  async function patch(data: Record<string, unknown>, message?: string) {
    setBusy(true);
    try {
      await apiPatch(`/api/tasks/${task.id}`, data);
      if (message) toast.success(message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update task");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    setBusy(true);
    try {
      await apiDelete(`/api/tasks/${task.id}`);
      toast.success("Task deleted");
      router.push("/tasks");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete task");
      setBusy(false);
    }
  }

  const completed = task.status === "COMPLETED";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-xs">
        <label htmlFor="progress-range" className="text-xs text-muted">
          Progress
        </label>
        <input
          id="progress-range"
          type="range"
          min={0}
          max={100}
          step={5}
          value={progress}
          disabled={busy || completed}
          onChange={(e) => setProgress(Number(e.target.value))}
          onMouseUp={() => progress !== task.progress && patch({ progress })}
          onTouchEnd={() => progress !== task.progress && patch({ progress })}
          onKeyUp={(e) => (e.key === "ArrowLeft" || e.key === "ArrowRight") && progress !== task.progress && patch({ progress })}
          className="h-1.5 w-28 accent-[var(--primary)]"
          aria-valuetext={`${progress}%`}
        />
        <span className="w-9 text-right text-xs font-semibold tabular-nums">{progress}%</span>
      </div>

      <Select value={task.status} onValueChange={(v) => patch({ status: v }, `Status: ${statusLabel[v as TaskStatus]}`)} disabled={busy}>
        <SelectTrigger className="h-9 w-[9.5rem]" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(statusLabel) as TaskStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {statusLabel[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={task.priorityLocked ? task.priority : "auto"} onValueChange={(v) => patch({ priority: v === "auto" ? null : v }, v === "auto" ? "Priority set to automatic" : `Priority: ${priorityLabel[v as TaskPriority]}`)} disabled={busy}>
        <SelectTrigger className="h-9 w-[10rem]" aria-label="Priority override">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Auto priority</SelectItem>
          {(Object.keys(priorityLabel) as TaskPriority[]).map((p) => (
            <SelectItem key={p} value={p}>
              {priorityLabel[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant={completed ? "outline" : "primary"} size="sm" className="h-9" onClick={() => patch({ status: completed ? "IN_PROGRESS" : "COMPLETED" }, completed ? "Task reopened" : "Task completed")} disabled={busy}>
        {completed ? <ArrowCounterClockwiseIcon /> : <CheckCircleIcon />}
        {completed ? "Reopen" : "Mark complete"}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-9" aria-label="More actions">
            <DotsThreeIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <PencilSimpleIcon /> Edit task
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={remove}>
            <TrashIcon /> Delete task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} courses={courses} initial={taskToForm(task)} />
    </div>
  );
}
