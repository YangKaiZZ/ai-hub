"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";
const NONE = "__none__";

interface UploadState {
  name: string;
  status: "uploading" | "done" | "error";
  message?: string;
}

export function UploadDropzone({ courses, fixedCourseId, maxMb }: { courses: { id: string; name: string; code: string | null }[]; fixedCourseId?: string; maxMb: number }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [courseId, setCourseId] = React.useState(fixedCourseId ?? NONE);
  const [uploads, setUploads] = React.useState<UploadState[]>([]);

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    for (const file of list) {
      if (file.size > maxMb * 1024 * 1024) {
        setUploads((u) => [...u, { name: file.name, status: "error", message: `Larger than ${maxMb} MB` }]);
        continue;
      }
      setUploads((u) => [...u, { name: file.name, status: "uploading" }]);
      const form = new FormData();
      form.append("file", file);
      if (courseId !== NONE) form.append("courseId", courseId);
      try {
        const res = await fetch("/api/documents", { method: "POST", body: form });
        const json = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string }; data?: { document: { status: string; chunkCount: number } } } | null;
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Upload failed");
        const doc = json.data!.document;
        setUploads((u) => u.map((x) => (x.name === file.name && x.status === "uploading" ? { ...x, status: "done", message: doc.status === "READY" ? `Indexed ${doc.chunkCount} section${doc.chunkCount === 1 ? "" : "s"}` : "Uploaded" } : x)));
      } catch (err) {
        setUploads((u) => u.map((x) => (x.name === file.name && x.status === "uploading" ? { ...x, status: "error", message: err instanceof Error ? err.message : "Upload failed" } : x)));
      }
    }
    router.refresh();
    toast.success("Upload complete");
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload documents"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void uploadFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition",
          dragging ? "border-brand-400 bg-primary-soft" : "border-border-strong bg-surface hover:border-brand-300 hover:bg-surface-muted/60",
        )}
      >
        <span className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-brand-600 dark:text-brand-300">
          <FileUp className="size-6" />
        </span>
        <p className="text-sm font-semibold">Drop files here or click to upload</p>
        <p className="mt-1 text-xs text-muted">PDF, DOCX, PPTX, images and text files · up to {maxMb} MB each</p>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && void uploadFiles(e.target.files)} />
      </div>

      {!fixedCourseId ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Attach uploads to</span>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="h-9 w-56" aria-label="Course for uploads">
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
        </div>
      ) : null}

      {uploads.length ? (
        <ul className="space-y-1.5 text-sm" aria-live="polite">
          {uploads.map((u, i) => (
            <li key={`${u.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2">
              {u.status === "uploading" ? <Loader2 className="size-4 animate-spin text-brand-500" /> : u.status === "done" ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-danger" />}
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <span className="text-xs text-muted">{u.status === "uploading" ? "Processing…" : u.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
