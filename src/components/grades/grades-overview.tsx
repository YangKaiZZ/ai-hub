import Link from "next/link";
import { ArrowRightIcon, ExamIcon, TargetIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { CourseIcon } from "@/components/courses/course-visual";
import type { getGradesOverview } from "@/server/grades/service";

type Overview = Awaited<ReturnType<typeof getGradesOverview>>;

export function GradesOverview({ overview, selectedId }: { overview: Overview; selectedId?: string }) {
  if (overview.courses.length === 0) {
    return (
      <EmptyState
        icon={<ExamIcon />}
        title="No courses to grade yet"
        description="Add your courses first, then record scores as you receive them."
        action={
          <Button asChild>
            <Link href="/courses?new=1">Add course</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl brand-gradient p-5 text-white shadow-md">
          <p className="text-xs text-brand-100">Overall average</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{overview.overallAverage != null ? `${overview.overallAverage}%` : "—"}</p>
          <p className="mt-1 text-xs text-brand-100/90">Credit-weighted across graded courses</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs text-muted">Courses tracked</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{overview.courses.length}</p>
          <p className="mt-1 text-xs text-subtle">{overview.courses.filter((c) => c.summary.current != null).length} with grades</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs text-muted">Grades recorded</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{overview.totalGrades}</p>
          <p className="mt-1 text-xs text-subtle">Across all courses</p>
        </div>
      </div>

      <ul className="grid gap-4 md:grid-cols-2">
        {overview.courses.map(({ course, summary, gradeCount }) => {
          const belowTarget = course.targetGrade != null && summary.current != null && summary.current < course.targetGrade;
          return (
            <li key={course.id} className={`rounded-2xl border bg-surface p-5 shadow-sm transition hover:shadow-md ${selectedId === course.id ? "border-brand-300 ring-2 ring-brand-500/15" : "border-border"}`}>
              <div className="flex items-start gap-3">
                <CourseIcon icon={course.icon} color={course.color} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-subtle">{course.code ?? "Course"}</p>
                  <h3 className="truncate font-semibold">{course.name}</h3>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tabular-nums">{summary.current != null ? `${summary.current}%` : "—"}</p>
                  {course.targetGrade != null ? (
                    <Badge variant={belowTarget ? "warning" : "success"} className="mt-1">
                      <TargetIcon /> {course.targetGrade}%
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {summary.categories.slice(0, 4).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 text-xs">
                    <span className="w-24 truncate text-muted">{c.name}</span>
                    <Progress value={c.percent ?? 0} size="sm" className="flex-1" tone={c.percent == null ? "neutral" : "brand"} />
                    <span className="w-10 text-right tabular-nums">{c.percent != null ? `${Math.round(c.percent)}%` : "—"}</span>
                  </div>
                ))}
                {summary.categories.length === 0 ? <p className="text-xs text-subtle">{gradeCount} grade{gradeCount === 1 ? "" : "s"} · no weighted categories</p> : null}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-subtle">
                <span>Projected {summary.projected != null ? `${summary.projected}%` : "—"} · {summary.weightGraded}% graded</span>
                <Button asChild variant="ghost" size="xs">
                  <Link href={`/grades?course=${course.id}`}>
                    Details <ArrowRightIcon />
                  </Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
