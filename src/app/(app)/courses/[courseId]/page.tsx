import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ChalkboardTeacherIcon, MegaphoneIcon, PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { CourseIcon } from "@/components/courses/course-visual";
import { CourseHeaderActions } from "@/components/courses/course-header-actions";
import { TaskCard } from "@/components/tasks/task-card";
import { CourseGradesPanel } from "@/components/grades/course-grades-panel";
import { ResourceList } from "@/components/resources/resource-list";
import { requirePageUser } from "@/lib/auth/guards";
import { isAppError } from "@/lib/errors";
import { formatDate, formatRelative } from "@/lib/utils";
import { getCourse } from "@/server/courses/service";
import { getCourseGradeReport } from "@/server/grades/service";
import { listResources } from "@/server/resources/service";
import { listTasks } from "@/server/tasks/service";

export const metadata: Metadata = { title: "Course" };

export default async function CoursePage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const { courseId } = await params;
  const { tab } = await searchParams;

  let course: Awaited<ReturnType<typeof getCourse>>;
  try {
    course = await getCourse(user.id, courseId);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const [tasks, grades, resources] = await Promise.all([
    listTasks(user.id, { filter: "all", courseId: course.id, sort: "priority", page: 1, pageSize: 100 }),
    getCourseGradeReport(user.id, course.id),
    listResources(user.id, { courseId: course.id }),
  ]);

  const open = tasks.items.filter((t) => t.status !== "COMPLETED" && t.status !== "ARCHIVED");
  const done = tasks.items.filter((t) => t.status === "COMPLETED");
  const progress = tasks.items.length ? Math.round((done.length / tasks.items.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link href="/courses" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> All courses
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <CourseIcon icon={course.icon} color={course.color} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {course.code ? <span className="font-mono">{course.code}</span> : null}
              {course.term ? <span>· {course.term.name}</span> : null}
              {course.institution ? <span>· {course.institution.name}</span> : null}
              {!course.isActive ? <Badge variant="outline">Archived</Badge> : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{course.name}</h1>
            {course.instructor ? (
              <p className="mt-1 text-sm text-muted">
                {course.instructor}
                {course.instructorEmail ? (
                  <>
                    {" · "}
                    <a href={`mailto:${course.instructorEmail}`} className="text-primary hover:underline">
                      {course.instructorEmail}
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        <CourseHeaderActions course={course} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs text-muted">Task progress</p>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={progress} className="flex-1" />
            <span className="text-sm font-semibold tabular-nums">{progress}%</span>
          </div>
          <p className="mt-1.5 text-xs text-subtle">
            {done.length} of {tasks.items.length} tasks completed
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs text-muted">Current grade</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{grades.summary.current != null ? `${grades.summary.current}%` : "—"}</p>
          <p className="text-xs text-subtle">
            {grades.summary.current != null ? `${grades.summary.weightGraded}% of weight graded` : "No grades yet"}
            {course.targetGrade != null ? ` · target ${course.targetGrade}%` : ""}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs text-muted">Next deadline</p>
          {open[0]?.dueDate ? (
            <>
              <p className="mt-1 truncate text-sm font-semibold">{open.find((t) => t.dueDate)?.title}</p>
              <p className="text-xs text-subtle">{formatDate(open.find((t) => t.dueDate)!.dueDate!, "EEE, MMM d · h:mm a")}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Nothing scheduled</p>
          )}
        </div>
      </div>

      <Tabs defaultValue={tab ?? "overview"}>
        <TabsList variant="underline" className="w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({open.length})</TabsTrigger>
          <TabsTrigger value="resources">Resources ({resources.length})</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            {course.description ? (
              <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <h2 className="text-base font-semibold">About this course</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{course.description}</p>
              </section>
            ) : null}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Up next</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/tasks?courseId=${course.id}`}>All tasks</Link>
                </Button>
              </div>
              {open.length === 0 ? (
                <EmptyState compact title="No open tasks" description="Add an assignment or exam for this course." action={<Button asChild size="sm"><Link href={`/tasks?new=1&courseId=${course.id}`}><PlusIcon /> Add task</Link></Button>} />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {open.slice(0, 4).map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </div>
              )}
            </section>
          </div>
          <div className="space-y-6">
            <section className="rounded-2xl brand-gradient-soft border border-brand-200 p-5 dark:border-brand-800">
              <div className="flex items-center gap-2 text-brand-800 dark:text-brand-100">
                <ChalkboardTeacherIcon className="size-4" />
                <h2 className="text-sm font-semibold">Ask the AI Tutor about {course.code ?? "this course"}</h2>
              </div>
              <p className="mt-1.5 text-sm text-brand-900/80 dark:text-brand-100/80">Start a conversation scoped to this course. Your uploaded resources are used as context.</p>
              <Button asChild className="mt-4 w-full">
                <Link href={`/tutor?course=${course.id}`}>Open AI Tutor</Link>
              </Button>
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h2 className="text-sm font-semibold">Recent announcements</h2>
              {course.announcements.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No announcements yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {course.announcements.slice(0, 3).map((a) => (
                    <li key={a.id}>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-subtle">{formatRelative(a.postedAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          {tasks.items.length === 0 ? (
            <EmptyState title="No tasks yet" description="Assignments, quizzes and exams for this course will show here." action={<Button asChild><Link href={`/tasks?new=1&courseId=${course.id}`}><PlusIcon /> Add task</Link></Button>} />
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {open.map((t) => (
                  <TaskCard key={t.id} task={t} />
                ))}
              </div>
              {done.length ? (
                <details className="rounded-2xl border border-border bg-surface p-4">
                  <summary className="cursor-pointer text-sm font-medium text-muted">Completed ({done.length})</summary>
                  <ul className="mt-3 divide-y divide-border text-sm">
                    {done.map((t) => (
                      <li key={t.id} className="flex items-center justify-between py-2">
                        <Link href={`/tasks/${t.id}`} className="text-muted line-through hover:text-foreground">
                          {t.title}
                        </Link>
                        <span className="text-xs text-subtle">{t.completedAt ? formatDate(t.completedAt) : ""}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="resources">
          <ResourceList resources={resources} courses={[{ id: course.id, name: course.name, code: course.code, color: course.color }]} fixedCourseId={course.id} />
        </TabsContent>

        <TabsContent value="grades">
          <CourseGradesPanel report={grades} />
        </TabsContent>

        <TabsContent value="announcements">
          {course.announcements.length === 0 ? (
            <EmptyState icon={<MegaphoneIcon />} title="No announcements" description="Announcements synced from your learning platform will appear here." />
          ) : (
            <ul className="space-y-3">
              {course.announcements.map((a) => (
                <li key={a.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{a.title}</h3>
                    <span className="shrink-0 text-xs text-subtle">{formatDate(a.postedAt, "MMM d, h:mm a")}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
