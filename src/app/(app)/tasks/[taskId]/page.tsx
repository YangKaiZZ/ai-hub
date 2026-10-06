import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, ArrowSquareOutIcon, CalendarDotsIcon, ClockIcon, LightbulbIcon, UserIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseIcon } from "@/components/courses/course-visual";
import { PriorityBadge, StatusBadge, taskTypeLabel } from "@/components/tasks/priority-badge";
import { TaskDetailActions } from "@/components/tasks/task-detail-actions";
import { TaskAnalysisPanel } from "@/components/tasks/task-analysis-panel";
import { requirePageUser } from "@/lib/auth/guards";
import { isAppError } from "@/lib/errors";
import { formatDate, formatDeadline, formatMinutes } from "@/lib/utils";
import { listCourseOptions } from "@/server/courses/service";
import { getTask } from "@/server/tasks/service";
import { openWorkspaceForTask } from "@/server/workspace/service";
import { parseTaskAnalysis } from "@/server/ai/intelligence/normalize";

export const metadata: Metadata = { title: "Task" };

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const user = await requirePageUser();
  const { taskId } = await params;
  const { workspace } = await searchParams;

  let task: Awaited<ReturnType<typeof getTask>>;
  try {
    task = await getTask(user.id, taskId);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (workspace === "1") {
    const ws = await openWorkspaceForTask(user.id, task.id);
    redirect(`/workspace/${ws.id}`);
  }

  const courses = await listCourseOptions(user.id);
  const analysis = parseTaskAnalysis(task.aiAnalysis);
  const rubric = (task.rubric as { criterion: string; points?: number; description?: string }[] | null) ?? null;

  return (
    <div className="space-y-6">
      <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Back to tasks
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {task.course ? <CourseIcon icon={task.course.icon} color={task.course.color} size="lg" /> : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {task.course ? (
                <Link href={`/courses/${task.course.id}`} className="font-medium hover:text-primary">
                  {task.course.name}
                </Link>
              ) : null}
              <span>·</span>
              <span>{taskTypeLabel[task.type]}</span>
              {task.source !== "MANUAL" ? <Badge variant="outline">Imported from {task.source.toLowerCase()}</Badge> : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{task.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PriorityBadge priority={task.priority} />
              <StatusBadge status={task.status} />
              {task.priorityLocked ? <Badge variant="outline">Priority set manually</Badge> : null}
            </div>
          </div>
        </div>
        <TaskDetailActions task={task} courses={courses} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoTile icon={<CalendarDotsIcon />} label="Deadline" value={formatDeadline(task.dueDate)} sub={task.dueDate ? formatDate(task.dueDate, "EEE, MMM d · h:mm a") : undefined} />
        <InfoTile icon={<ClockIcon />} label="Estimated time" value={formatMinutes(task.estimatedMinutes)} sub={analysis?.estimatedMinutes && analysis.estimatedMinutes !== task.estimatedMinutes ? `AI suggests ${formatMinutes(analysis.estimatedMinutes)}` : undefined} />
        <InfoTile icon={<UserIcon />} label="Instructor" value={task.instructor ?? task.course?.instructor ?? "—"} />
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs text-muted">Progress</p>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={task.progress} tone={task.status === "COMPLETED" ? "success" : "brand"} className="flex-1" />
            <span className="text-sm font-semibold tabular-nums">{task.progress}%</span>
          </div>
          <p className="mt-1.5 text-xs text-subtle">Priority score {Math.round(task.priorityScore)}/100</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {task.description ? (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{task.description}</p>
              </CardContent>
            </Card>
          ) : null}
          {task.instructions ? (
            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{task.instructions}</p>
              </CardContent>
            </Card>
          ) : null}
          {rubric && rubric.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Rubric</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {rubric.map((r, i) => (
                    <li key={i} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                      <div>
                        <p className="font-medium">{r.criterion}</p>
                        {r.description ? <p className="text-xs text-muted">{r.description}</p> : null}
                      </div>
                      {r.points != null ? <span className="shrink-0 text-xs font-semibold text-muted">{r.points} pts</span> : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {task.attachments.length > 0 || task.externalUrl ? (
            <Card>
              <CardHeader>
                <CardTitle>Links & files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {task.externalUrl ? (
                  <a href={task.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
                    Open in learning platform <ArrowSquareOutIcon className="size-3.5" />
                  </a>
                ) : null}
                {task.attachments.map((a) => (
                  <p key={a.id} className="text-muted">
                    {a.name}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <TaskAnalysisPanel taskId={task.id} analysis={analysis} analyzedAt={task.aiAnalyzedAt} />
          <Card className="brand-gradient-soft border-brand-200 dark:border-brand-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-brand-800 dark:text-brand-100">
                <LightbulbIcon className="size-4" />
                <p className="text-sm font-semibold">Work on this with AI</p>
              </div>
              <p className="mt-1.5 text-sm text-brand-900/80 dark:text-brand-100/80">
                Open the workspace to break the task into steps, ask about the rubric, and get feedback on your draft.
              </p>
              <Button asChild className="mt-4 w-full">
                <Link href={task.workspace ? `/workspace/${task.workspace.id}` : `/tasks/${task.id}?workspace=1`}>Open Workspace</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs text-muted [&_svg]:size-3.5">
        {icon} {label}
      </p>
      <p className="mt-1.5 truncate text-sm font-semibold">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-subtle">{sub}</p> : null}
    </div>
  );
}
