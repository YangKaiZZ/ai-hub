import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { requirePageUser } from "@/lib/auth/guards";
import { listCourseOptions } from "@/server/courses/service";
import { listTasksQuerySchema } from "@/server/tasks/schemas";
import { listTasks, recalculateIfStale } from "@/server/tasks/service";

export const metadata: Metadata = { title: "My Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const parsed = listTasksQuerySchema.safeParse(sp);
  const query = parsed.success ? parsed.data : listTasksQuerySchema.parse({});

  await recalculateIfStale(user.id);
  const [result, courses] = await Promise.all([listTasks(user.id, query), listCourseOptions(user.id)]);

  return (
    <div className="space-y-6">
      <PageHeader title="My Tasks" description="Everything you need to do, ranked by what matters most." />
      <TaskList
        tasks={result.items}
        total={result.total}
        courses={courses}
        filter={query.filter}
        sort={query.sort}
        courseId={query.courseId}
        q={query.q}
        openNew={sp.new === "1"}
      />
    </div>
  );
}
