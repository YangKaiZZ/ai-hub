"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArrowUUpLeftIcon, DotsThreeIcon, PencilSimpleIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";
import { CourseFormDialog, courseToForm } from "@/components/courses/course-form-dialog";
import { apiDelete, apiPatch } from "@/lib/client/api";

interface CourseLike {
  id: string;
  name: string;
  code: string | null;
  instructor: string | null;
  instructorEmail: string | null;
  description: string | null;
  color: string;
  icon: string;
  credits: number | null;
  targetGrade: number | null;
  isActive: boolean;
}

export function CourseHeaderActions({ course }: { course: CourseLike }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function toggleArchive() {
    setBusy(true);
    try {
      await apiPatch(`/api/courses/${course.id}`, { isActive: !course.isActive });
      toast.success(course.isActive ? "Course archived" : "Course restored");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update course");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${course.name}” and all of its tasks?`)) return;
    setBusy(true);
    try {
      await apiDelete(`/api/courses/${course.id}`);
      toast.success("Course deleted");
      router.push("/courses");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete course");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="h-9" onClick={() => setEditOpen(true)}>
        <PencilSimpleIcon /> Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-9" aria-label="More actions" disabled={busy}>
            <DotsThreeIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={toggleArchive}>
            {course.isActive ? <ArchiveIcon /> : <ArrowUUpLeftIcon />}
            {course.isActive ? "Archive course" : "Restore course"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={remove}>
            <TrashIcon /> Delete course
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CourseFormDialog open={editOpen} onOpenChange={setEditOpen} initial={courseToForm(course)} />
    </div>
  );
}
