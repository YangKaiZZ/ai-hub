"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ExternalLink, FileText, FolderOpen, Layers, Link2, MoreHorizontal, Pin, PinOff, Plus, Sparkles, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";
import { CourseDot } from "@/components/courses/course-visual";
import { ResourceFormDialog } from "@/components/resources/resource-form-dialog";
import { apiDelete, apiPatch } from "@/lib/client/api";
import { cn, formatRelative, truncate } from "@/lib/utils";
import type { ResourceItem } from "@/server/resources/service";

export const resourceTypeMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  NOTE: { label: "Note", icon: StickyNote },
  DOCUMENT: { label: "Document", icon: FileText },
  LINK: { label: "Link", icon: Link2 },
  STUDY_GUIDE: { label: "Study guide", icon: BookOpen },
  FLASHCARD_SET: { label: "Flashcards", icon: Layers },
  AI_SUMMARY: { label: "AI summary", icon: Sparkles },
  LECTURE: { label: "Lecture", icon: FolderOpen },
};

interface Props {
  resources: ResourceItem[];
  courses: { id: string; name: string; code: string | null; color: string }[];
  fixedCourseId?: string;
  activeType?: string;
  onTypeChange?: (t: string | undefined) => void;
}

export function ResourceList({ resources, courses, fixedCourseId, activeType, onTypeChange }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function togglePin(r: ResourceItem) {
    setBusy(r.id);
    try {
      await apiPatch(`/api/resources/${r.id}`, { isPinned: !r.isPinned });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: ResourceItem) {
    if (!window.confirm(`Delete “${r.title}”?`)) return;
    setBusy(r.id);
    try {
      await apiDelete(`/api/resources/${r.id}`);
      toast.success("Resource deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(null);
    }
  }

  const types = Object.keys(resourceTypeMeta);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {onTypeChange ? (
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 scrollbar-thin">
            <TypeChip active={!activeType} onClick={() => onTypeChange(undefined)}>
              All
            </TypeChip>
            {types.map((t) => (
              <TypeChip key={t} active={activeType === t} onClick={() => onTypeChange(t)}>
                {resourceTypeMeta[t]!.label}
              </TypeChip>
            ))}
          </div>
        ) : (
          <span />
        )}
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus /> Add note or link
        </Button>
      </div>

      {resources.length === 0 ? (
        <EmptyState
          icon={<FolderOpen />}
          title="No resources yet"
          description="Upload documents, save links, or write notes. Everything here becomes context for the AI Tutor."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Add resource
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {resources.map((r) => {
            const meta = resourceTypeMeta[r.type] ?? resourceTypeMeta.NOTE!;
            const Icon = meta.icon;
            const href = r.type === "LINK" && r.url ? r.url : `/resources/${r.id}`;
            const external = r.type === "LINK" && Boolean(r.url);
            return (
              <li key={r.id} className={cn("group relative flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", busy === r.id && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-brand-600 dark:text-brand-300">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {external ? (
                        <a href={href} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold hover:text-primary">
                          {r.title}
                        </a>
                      ) : (
                        <Link href={href} className="truncate text-sm font-semibold hover:text-primary">
                          {r.title}
                        </Link>
                      )}
                      {external ? <ExternalLink className="size-3 shrink-0 text-subtle" /> : null}
                      {r.isPinned ? <Pin className="size-3 shrink-0 text-brand-500" aria-label="Pinned" /> : null}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{meta.label}</span>
                      {r.course ? (
                        <span className="inline-flex items-center gap-1">
                          <CourseDot color={r.course.color} /> {r.course.code ?? r.course.name}
                        </span>
                      ) : null}
                      <span>· {formatRelative(r.updatedAt)}</span>
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Resource actions" className="-mr-1 -mt-1">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => togglePin(r)}>
                        {r.isPinned ? <PinOff /> : <Pin />}
                        {r.isPinned ? "Unpin" : "Pin"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => remove(r)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {r.document?.summary || (r.content && r.type !== "FLASHCARD_SET") ? (
                  <p className="mt-3 line-clamp-3 text-sm text-muted">{truncate((r.document?.summary ?? r.content ?? "").replace(/[#*_`>]/g, ""), 220)}</p>
                ) : null}
                {r.document ? (
                  <p className="mt-2 text-[11px] text-subtle">
                    {r.document.status === "READY" ? `${r.document.pageCount ? `${r.document.pageCount} pages · ` : ""}Indexed for AI` : r.document.status === "FAILED" ? "Processing failed" : "Processing…"}
                  </p>
                ) : null}
                {r.tags.length ? (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {r.tags.slice(0, 4).map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        #{t}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ResourceFormDialog open={createOpen} onOpenChange={setCreateOpen} courses={courses} fixedCourseId={fixedCourseId} />
    </div>
  );
}

function TypeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition", active ? "border-primary bg-primary text-white" : "border-border bg-surface text-muted hover:bg-surface-muted")}
    >
      {children}
    </button>
  );
}
