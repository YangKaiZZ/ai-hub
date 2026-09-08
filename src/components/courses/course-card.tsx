import Link from "next/link";
import { ArrowRight, CalendarClock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CourseIcon, courseStyles } from "@/components/courses/course-visual";
import { cn, formatDeadline } from "@/lib/utils";
import type { CourseSummary } from "@/server/courses/service";

export function CourseCard({ course, className }: { course: CourseSummary; className?: string }) {
  const styles = courseStyles(course.color);
  return (
    <Card interactive className={cn("flex flex-col overflow-hidden", className)}>
      <div className={cn("h-1.5", styles.solid)} aria-hidden />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-3">
          <CourseIcon icon={course.icon} color={course.color} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-subtle">{course.code ?? "Course"}</p>
            <Link href={`/courses/${course.id}`} className="block truncate text-base font-semibold hover:text-primary">
              {course.name}
            </Link>
            {course.instructor ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                <User className="size-3.5" /> {course.instructor}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-surface-muted px-3 py-2">
            <p className="text-subtle">Open tasks</p>
            <p className="mt-0.5 text-base font-semibold">{course.openTasks}</p>
          </div>
          <div className="rounded-xl bg-surface-muted px-3 py-2">
            <p className="text-subtle">Next deadline</p>
            <p className="mt-0.5 flex items-center gap-1 truncate font-semibold">
              <CalendarClock className="size-3.5 shrink-0 text-subtle" />
              {course.nextDeadline ? formatDeadline(course.nextDeadline.dueDate).replace("Due ", "") : "None"}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Progress</span>
            <span className="tabular-nums">{course.progress}%</span>
          </div>
          <Progress value={course.progress} size="sm" tone={course.progress === 100 ? "success" : "brand"} aria-label={`${course.name} progress`} />
        </div>

        <Button asChild variant="outline" size="sm" className="mt-5 w-full">
          <Link href={`/courses/${course.id}`}>
            View course <ArrowRight />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
