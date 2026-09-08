import { Badge } from "@/components/ui/badge";
import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

const priorityVariant: Record<TaskPriority, "default" | "info" | "warning" | "danger"> = {
  LOW: "default",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

export const priorityLabel: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  return (
    <Badge variant={priorityVariant[priority]} className={className}>
      {priorityLabel[priority]}
    </Badge>
  );
}

export const statusLabel: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

const statusVariant: Record<TaskStatus, "default" | "brand" | "success" | "outline"> = {
  NOT_STARTED: "default",
  IN_PROGRESS: "brand",
  COMPLETED: "success",
  ARCHIVED: "outline",
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <Badge variant={statusVariant[status]} className={className}>
      {statusLabel[status]}
    </Badge>
  );
}

export const taskTypeLabel: Record<string, string> = {
  ASSIGNMENT: "Assignment",
  PROJECT: "Project",
  QUIZ: "Quiz",
  EXAM: "Exam",
  READING: "Reading",
  LAB: "Lab",
  DISCUSSION: "Discussion",
  PRESENTATION: "Presentation",
  OTHER: "Task",
};
