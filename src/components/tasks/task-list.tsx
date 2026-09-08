"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, CheckCircle2, Circle, Clock, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";
import { CourseDot } from "@/components/courses/course-visual";
import { PriorityBadge, taskTypeLabel } from "@/components/tasks/priority-badge";
import { TaskFormDialog, emptyTaskForm, taskToForm, type CourseOption, type TaskFormValues } from "@/components/tasks/task-form-dialog";
import { apiDelete, apiPatch } from "@/lib/client/api";
import { cn, formatDeadline, formatMinutes } from "@/lib/utils";
import type { TaskCard } from "@/server/tasks/service";
import type { TaskFilter, TaskSort } from "@/server/tasks/schemas";

const filters: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "upcoming", label: "Upcoming" },
  { value: "high", label: "High Priority" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];

interface Props {
  tasks: TaskCard[];
  total: number;
  courses: CourseOption[];
  filter: TaskFilter;
  sort: TaskSort;
  courseId?: string;
  q?: string;
  openNew?: boolean;
}

export function TaskList({ tasks, total, courses, filter, sort, courseId, q, openNew }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = React.useState(q ?? "");
  const [now] = React.useState(() => Date.now());
  const [dialog, setDialog] = React.useState<{ open: boolean; initial?: TaskFormValues }>({ open: Boolean(openNew) });
  const [busy, setBusy] = React.useState<string | null>(null);

  const setParam = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (!v || v === "all" || v === "priority") next.delete(k);
        else next.set(k, v);
      }
      next.delete("new");
      router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`);
    },
    [params, pathname, router],
  );

  React.useEffect(() => {
    if ((q ?? "") === search) return;
    const t = setTimeout(() => setParam({ q: search || undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function toggleComplete(task: TaskCard) {
    setBusy(task.id);
    try {
      await apiPatch(`/api/tasks/${task.id}`, { status: task.status === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED" });
      toast.success(task.status === "COMPLETED" ? "Task reopened" : "Nice work — task completed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update task");
    } finally {
      setBusy(null);
    }
  }

  async function remove(task: TaskCard) {
    if (!window.confirm(`Delete “${task.title}”? You can not undo this from the app.`)) return;
    setBusy(task.id);
    try {
      await apiDelete(`/api/tasks/${task.id}`);
      toast.success("Task deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete task");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 scrollbar-thin" role="tablist" aria-label="Task filters">
          {filters.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setParam({ filter: f.value })}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                filter === f.value ? "bg-primary text-white shadow-sm" : "bg-surface text-muted hover:bg-surface-muted hover:text-foreground border border-border",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input leftIcon={<Search />} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" className="h-9 w-full sm:w-56" aria-label="Search tasks" />
          <Select value={courseId ?? "all"} onValueChange={(v) => setParam({ courseId: v })}>
            <SelectTrigger className="h-9 w-[11rem]" aria-label="Filter by course">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setParam({ sort: v })}>
            <SelectTrigger className="h-9 w-[9.5rem]" aria-label="Sort tasks">
              <ArrowUpDown className="size-3.5 text-subtle" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="dueDate">Deadline</SelectItem>
              <SelectItem value="createdAt">Newest</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setDialog({ open: true, initial: emptyTaskForm(courseId ?? "") })} size="sm" className="h-9">
            <Plus /> New task
          </Button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title={filter === "completed" ? "Nothing completed yet" : q ? "No tasks match your search" : "No tasks here"}
          description={
            filter === "all" && !q
              ? "Once assignments are imported or added, they'll appear here."
              : "Try a different filter, or add a task to get started."
          }
          action={
            <Button onClick={() => setDialog({ open: true, initial: emptyTaskForm(courseId ?? "") })}>
              <Plus /> Add task
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-subtle">
            Showing {tasks.length} of {total} task{total === 1 ? "" : "s"}
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {tasks.map((task) => {
              const completed = task.status === "COMPLETED";
              const overdue = !completed && task.dueDate && task.dueDate.getTime() < now;
              return (
                <li key={task.id} className={cn("group flex items-start gap-3 px-4 py-3.5 transition hover:bg-surface-muted/60 sm:items-center", busy === task.id && "opacity-60")}>
                  <button
                    type="button"
                    onClick={() => toggleComplete(task)}
                    className="mt-0.5 shrink-0 text-subtle transition hover:text-success sm:mt-0"
                    aria-label={completed ? "Mark as not completed" : "Mark as completed"}
                    disabled={busy === task.id}
                  >
                    {completed ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link href={`/tasks/${task.id}`} className={cn("truncate text-sm font-semibold hover:text-primary", completed && "text-muted line-through")}>
                        {task.title}
                      </Link>
                      <PriorityBadge priority={task.priority} className="hidden sm:inline-flex" />
                      {task.aiAnalyzedAt ? <Sparkles className="size-3.5 text-brand-500" aria-label="AI analyzed" /> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      {task.course ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CourseDot color={task.course.color} /> {task.course.name}
                        </span>
                      ) : (
                        <span>{taskTypeLabel[task.type]}</span>
                      )}
                      <span className={cn(overdue && "font-medium text-danger")}>{formatDeadline(task.dueDate)}</span>
                      {task.estimatedMinutes ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" /> {formatMinutes(task.estimatedMinutes)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center gap-2 sm:hidden">
                      <Progress value={task.progress} size="sm" className="flex-1" tone={completed ? "success" : "brand"} />
                      <span className="text-[11px] tabular-nums text-subtle">{task.progress}%</span>
                    </div>
                  </div>

                  <div className="hidden w-32 items-center gap-2 sm:flex">
                    <Progress value={task.progress} size="sm" tone={completed ? "success" : "brand"} aria-label="Progress" />
                    <span className="w-8 text-right text-xs tabular-nums text-muted">{task.progress}%</span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button asChild size="sm" variant="secondary" className="hidden md:inline-flex">
                      <Link href={task.workspace ? `/workspace/${task.workspace.id}` : `/tasks/${task.id}?workspace=1`}>Workspace</Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Task actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/tasks/${task.id}`}>Open details</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDialog({ open: true, initial: taskToForm(task) })}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => remove(task)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <TaskFormDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} courses={courses} initial={dialog.initial} />
    </div>
  );
}
