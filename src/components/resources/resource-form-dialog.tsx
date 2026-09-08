"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { ApiClientError, apiPost } from "@/lib/client/api";

const NONE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  courses: { id: string; name: string; code: string | null }[];
  fixedCourseId?: string;
}

export function ResourceFormDialog({ open, onOpenChange, courses, fixedCourseId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">{open ? <ResourceForm courses={courses} fixedCourseId={fixedCourseId} onOpenChange={onOpenChange} /> : null}</DialogContent>
    </Dialog>
  );
}

function ResourceForm({ courses, fixedCourseId, onOpenChange }: Omit<Props, "open">) {
  const router = useRouter();
  const [type, setType] = React.useState<"NOTE" | "LINK" | "STUDY_GUIDE" | "FLASHCARD_SET">("NOTE");
  const [courseId, setCourseId] = React.useState(fixedCourseId ?? NONE);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const f = new FormData(e.currentTarget);
    const tags = String(f.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    let content = String(f.get("content") ?? "");
    if (type === "FLASHCARD_SET") {
      const cards = content
        .split("\n")
        .map((line) => line.split("::").map((s) => s.trim()))
        .filter((p) => p.length === 2 && p[0] && p[1])
        .map(([front, back]) => ({ front, back }));
      if (cards.length === 0) {
        setErrors({ content: "Add at least one card as: question :: answer" });
        setSaving(false);
        return;
      }
      content = JSON.stringify(cards);
    }
    try {
      await apiPost("/api/resources", {
        type,
        title: f.get("title"),
        content: type === "LINK" ? null : content,
        url: type === "LINK" ? f.get("url") : null,
        courseId: courseId === NONE ? null : courseId,
        tags,
      });
      toast.success("Resource saved");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) setErrors(err.details);
      else toast.error(err instanceof Error ? err.message : "Could not save resource");
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add resource</DialogTitle>
        <DialogDescription>Notes, study guides, links and flashcards. To add files, use Upload on the Resources page.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="res-type" label="Type">
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger id="res-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NOTE">Note</SelectItem>
                <SelectItem value="STUDY_GUIDE">Study guide</SelectItem>
                <SelectItem value="LINK">Link</SelectItem>
                <SelectItem value="FLASHCARD_SET">Flashcard set</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="res-course" label="Course" error={errors.courseId}>
            <Select value={courseId} onValueChange={setCourseId} disabled={Boolean(fixedCourseId)}>
              <SelectTrigger id="res-course">
                <SelectValue placeholder="No course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No course</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code ? `${c.code} · ` : ""}
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field id="res-title" label="Title" required error={errors.title}>
          <Input name="title" placeholder={type === "LINK" ? "OpenAPI Specification" : "Normalization cheat sheet"} autoFocus />
        </Field>
        {type === "LINK" ? (
          <Field id="res-url" label="URL" required error={errors.url}>
            <Input name="url" type="url" placeholder="https://" />
          </Field>
        ) : (
          <Field
            id="res-content"
            label={type === "FLASHCARD_SET" ? "Cards" : "Content"}
            hint={type === "FLASHCARD_SET" ? "One card per line as: question :: answer" : "Markdown supported."}
            error={errors.content}
          >
            <Textarea name="content" rows={type === "FLASHCARD_SET" ? 8 : 6} placeholder={type === "FLASHCARD_SET" ? "Encapsulation :: Bundling data with the methods that operate on it" : "Write your notes…"} />
          </Field>
        )}
        <Field id="res-tags" label="Tags" hint="Comma separated" error={errors.tags}>
          <Input name="tags" placeholder="database, normalization" />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
