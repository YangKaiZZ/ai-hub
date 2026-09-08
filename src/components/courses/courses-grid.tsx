"use client";

import * as React from "react";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CourseCard } from "@/components/courses/course-card";
import { CourseFormDialog, emptyCourseForm } from "@/components/courses/course-form-dialog";
import type { CourseSummary } from "@/server/courses/service";

export function CoursesGrid({ courses, openNew }: { courses: CourseSummary[]; openNew?: boolean }) {
  const [open, setOpen] = React.useState(Boolean(openNew));
  const active = courses.filter((c) => c.isActive);
  const inactive = courses.filter((c) => !c.isActive);

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus /> Add course
        </Button>
      </div>
      {courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="No courses"
          description="Add your first course to start building your academic workspace."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus /> Add course
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
          {inactive.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">Archived</h2>
              <div className="grid gap-4 opacity-75 sm:grid-cols-2 xl:grid-cols-3">
                {inactive.map((c) => (
                  <CourseCard key={c.id} course={c} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
      <CourseFormDialog open={open} onOpenChange={setOpen} initial={emptyCourseForm()} />
    </div>
  );
}
