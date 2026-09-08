import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { CoursesGrid } from "@/components/courses/courses-grid";
import { requirePageUser } from "@/lib/auth/guards";
import { listCoursesWithSummary } from "@/server/courses/service";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requirePageUser();
  const { new: openNew } = await searchParams;
  const courses = await listCoursesWithSummary(user.id, { includeInactive: true });

  return (
    <div className="space-y-6">
      <PageHeader title="Courses" description="Your classes this term, with tasks, grades and resources for each." />
      <CoursesGrid courses={courses} openNew={openNew === "1"} />
    </div>
  );
}
