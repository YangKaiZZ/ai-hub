import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { GradesOverview } from "@/components/grades/grades-overview";
import { CourseGradesPanel } from "@/components/grades/course-grades-panel";
import { CourseIcon } from "@/components/courses/course-visual";
import { requirePageUser } from "@/lib/auth/guards";
import { isAppError } from "@/lib/errors";
import { getCourseGradeReport, getGradesOverview } from "@/server/grades/service";

export const metadata: Metadata = { title: "Grades" };

export default async function GradesPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const user = await requirePageUser();
  const { course } = await searchParams;

  if (course) {
    let report: Awaited<ReturnType<typeof getCourseGradeReport>> | null = null;
    try {
      report = await getCourseGradeReport(user.id, course);
    } catch (err) {
      if (!(isAppError(err) && err.code === "NOT_FOUND")) throw err;
    }
    if (report) {
      return (
        <div className="space-y-6">
          <Link href="/grades" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
            <ArrowLeftIcon className="size-4" /> All grades
          </Link>
          <div className="flex items-center gap-4">
            <CourseIcon icon={report.course.icon} color={report.course.color} size="lg" />
            <PageHeader title={report.course.name} description={report.course.code ?? undefined} />
          </div>
          <CourseGradesPanel report={report} />
        </div>
      );
    }
  }

  const overview = await getGradesOverview(user.id);
  return (
    <div className="space-y-6">
      <PageHeader title="Grades" description="Your standing in every course, with projections toward your targets." />
      <GradesOverview overview={overview} selectedId={course} />
    </div>
  );
}
