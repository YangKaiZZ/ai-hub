"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { CourseIcon, courseStyles } from "@/components/courses/course-visual";
import { ApiClientError, apiPatch, apiPost } from "@/lib/client/api";
import { COURSE_COLORS, COURSE_ICONS } from "@/server/courses/schemas";
import { cn } from "@/lib/utils";

export interface CourseFormValues {
  id?: string;
  name: string;
  code: string;
  instructor: string;
  instructorEmail: string;
  description: string;
  color: string;
  icon: string;
  credits: string;
  targetGrade: string;
}

export function emptyCourseForm(): CourseFormValues {
  return { name: "", code: "", instructor: "", instructorEmail: "", description: "", color: "violet", icon: "book-open", credits: "", targetGrade: "" };
}

export function courseToForm(c: {
  id: string;
  name: string;
  code: string | null;
  instructor: string | null;
  instructorEmail?: string | null;
  description?: string | null;
  color: string;
  icon: string;
  credits?: number | null;
  targetGrade: number | null;
}): CourseFormValues {
  return {
    id: c.id,
    name: c.name,
    code: c.code ?? "",
    instructor: c.instructor ?? "",
    instructorEmail: c.instructorEmail ?? "",
    description: c.description ?? "",
    color: c.color,
    icon: c.icon,
    credits: c.credits != null ? String(c.credits) : "",
    targetGrade: c.targetGrade != null ? String(c.targetGrade) : "",
  };
}

export function CourseFormDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: CourseFormValues }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">{open ? <CourseForm key={initial?.id ?? "new"} initial={initial ?? emptyCourseForm()} onOpenChange={onOpenChange} /> : null}</DialogContent>
    </Dialog>
  );
}

function CourseForm({ initial, onOpenChange }: { initial: CourseFormValues; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [values, setValues] = React.useState<CourseFormValues>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const isEdit = Boolean(values.id);

  const set = <K extends keyof CourseFormValues>(k: K, v: CourseFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = {
      name: values.name,
      code: values.code,
      instructor: values.instructor,
      instructorEmail: values.instructorEmail,
      description: values.description,
      color: values.color,
      icon: values.icon,
      credits: values.credits ? Number(values.credits) : null,
      targetGrade: values.targetGrade ? Number(values.targetGrade) : null,
    };
    try {
      if (isEdit) await apiPatch(`/api/courses/${values.id}`, payload);
      else await apiPost("/api/courses", payload);
      toast.success(isEdit ? "Course updated" : "Course added");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) setErrors(err.details);
      else toast.error(err instanceof Error ? err.message : "Could not save course");
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit course" : "Add course"}</DialogTitle>
        <DialogDescription>Courses group your tasks, grades, resources and AI conversations.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="flex items-start gap-4">
          <CourseIcon icon={values.icon} color={values.color} size="lg" className="mt-6" />
          <div className="flex-1 space-y-4">
            <Field id="course-name" label="Course name" required error={errors.name}>
              <Input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Database Systems" autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="course-code" label="Code" error={errors.code}>
                <Input value={values.code} onChange={(e) => set("code", e.target.value)} placeholder="CS135" />
              </Field>
              <Field id="course-credits" label="Credits" error={errors.credits}>
                <Input type="number" min={0} step={0.5} value={values.credits} onChange={(e) => set("credits", e.target.value)} placeholder="3" />
              </Field>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="course-instructor" label="Instructor" error={errors.instructor}>
            <Input value={values.instructor} onChange={(e) => set("instructor", e.target.value)} placeholder="Prof. Santos" />
          </Field>
          <Field id="course-instructor-email" label="Instructor email" error={errors.instructorEmail}>
            <Input type="email" value={values.instructorEmail} onChange={(e) => set("instructorEmail", e.target.value)} placeholder="santos@school.edu" />
          </Field>
        </div>
        <Field id="course-target" label="Target grade (%)" hint="Used for grade projections." error={errors.targetGrade}>
          <Input type="number" min={0} max={100} value={values.targetGrade} onChange={(e) => set("targetGrade", e.target.value)} placeholder="90" />
        </Field>
        <Field id="course-description" label="Description" error={errors.description}>
          <Textarea value={values.description} onChange={(e) => set("description", e.target.value)} rows={2} />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium">Color</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Course color">
            {COURSE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={values.color === c}
                aria-label={c}
                onClick={() => set("color", c)}
                className={cn("flex size-8 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface transition", courseStyles(c).solid, values.color === c && "ring-2 ring-foreground/60")}
              >
                {values.color === c ? <Check className="size-4" /> : null}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Icon</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Course icon">
            {COURSE_ICONS.map((ic) => (
              <button key={ic} type="button" role="radio" aria-checked={values.icon === ic} aria-label={ic} onClick={() => set("icon", ic)} className={cn("rounded-xl ring-offset-2 ring-offset-surface transition", values.icon === ic && "ring-2 ring-primary")}>
                <CourseIcon icon={ic} color={values.color} size="sm" />
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? "Save changes" : "Add course"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
