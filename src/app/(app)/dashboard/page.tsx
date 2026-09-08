import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CheckSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { StatCards } from "@/components/dashboard/stat-cards";
import { Recommendations } from "@/components/dashboard/recommendations";
import { UpcomingTimeline } from "@/components/dashboard/upcoming-timeline";
import { TaskCard } from "@/components/tasks/task-card";
import { CourseCard } from "@/components/courses/course-card";
import { requirePageUser } from "@/lib/auth/guards";
import { getDashboardData } from "@/server/dashboard/service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  const data = await getDashboardData(user.id);

  return (
    <div className="space-y-6 lg:space-y-8">
      <WelcomeBanner firstName={user.firstName} activeTasks={data.stats.active} analyzedCount={data.analyzedCount} />

      <StatCards stats={data.stats} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="attention-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="attention-heading" className="text-lg font-semibold tracking-tight">
              Needs Your Attention
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/tasks">See all</Link>
            </Button>
          </div>
          {data.attention.length === 0 ? (
            <EmptyState
              icon={<CheckSquare />}
              title="No tasks yet"
              description="Once assignments are imported or added, they'll appear here ranked by what matters most."
              action={
                <Button asChild>
                  <Link href="/tasks?new=1">
                    <Plus /> Add task
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.attention.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-6">
          <Recommendations items={data.recommendations} />
          <UpcomingTimeline events={data.upcoming} />
        </div>
      </div>

      <section aria-labelledby="courses-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="courses-heading" className="text-lg font-semibold tracking-tight">
            My Courses
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/courses">Manage courses</Link>
          </Button>
        </div>
        {data.courses.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title="No courses"
            description="Add your first course to start building your academic workspace."
            action={
              <Button asChild>
                <Link href="/courses?new=1">
                  <Plus /> Add course
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.courses.slice(0, 4).map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
