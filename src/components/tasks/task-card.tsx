import Link from "next/link";
import { ArrowUpRightIcon, ClockIcon, LightbulbIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CourseDot } from "@/components/courses/course-visual";
import { PriorityBadge, taskTypeLabel } from "@/components/tasks/priority-badge";
import { cn, formatDeadline, formatMinutes } from "@/lib/utils";
import type { TaskCard as TaskCardData } from "@/server/tasks/service";

function deadlineTone(due: Date | null, status: string) {
  if (!due || status === "COMPLETED") return "text-muted";
  const hours = (due.getTime() - Date.now()) / 36e5;
  if (hours < 0) return "text-danger font-medium";
  if (hours <= 24) return "text-warning font-medium";
  return "text-muted";
}

export function TaskCard({ task, className }: { task: TaskCardData; className?: string }) {
  const analyzed = Boolean(task.aiAnalyzedAt);
  const workspaceHref = task.workspace ? `/workspace/${task.workspace.id}` : `/tasks/${task.id}?workspace=1`;

  return (
    <Card interactive className={cn("flex flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {task.course ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <CourseDot color={task.course.color} />
              <span className="truncate">{task.course.name}</span>
            </p>
          ) : (
            <p className="text-xs font-medium text-subtle">{taskTypeLabel[task.type]}</p>
          )}
          <Link href={`/tasks/${task.id}`} className="mt-1 block truncate text-base font-semibold hover:text-primary">
            {task.title}
          </Link>
        </div>
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className={deadlineTone(task.dueDate, task.status)}>{formatDeadline(task.dueDate)}</span>
        {task.estimatedMinutes ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <ClockIcon className="size-3.5" /> Est. {formatMinutes(task.estimatedMinutes)}
          </span>
        ) : null}
        <span className={cn("inline-flex items-center gap-1", analyzed ? "text-brand-600 dark:text-brand-300" : "text-subtle")}>
          <LightbulbIcon className="size-3.5" /> {analyzed ? "AI analyzed" : "Not analyzed"}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Progress value={task.progress} size="sm" tone={task.progress === 100 ? "success" : "brand"} className="flex-1" aria-label="Progress" />
        <span className="w-9 text-right text-xs tabular-nums text-muted">{task.progress}%</span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-subtle">{taskTypeLabel[task.type]}</span>
        <Button asChild size="sm" variant={task.priority === "CRITICAL" || task.priority === "HIGH" ? "primary" : "secondary"}>
          <Link href={workspaceHref}>
            Open Workspace <ArrowUpRightIcon />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
