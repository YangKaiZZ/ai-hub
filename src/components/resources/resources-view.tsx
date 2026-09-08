"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResourceList } from "@/components/resources/resource-list";
import { UploadDropzone } from "@/components/resources/upload-dropzone";
import { apiGet } from "@/lib/client/api";
import type { ResourceItem } from "@/server/resources/service";

interface SemanticHit {
  chunkId: string;
  documentId: string;
  documentName: string;
  page: number | null;
  snippet: string;
  score: number;
}

interface Props {
  resources: ResourceItem[];
  courses: { id: string; name: string; code: string | null; color: string }[];
  courseId?: string;
  type?: string;
  q?: string;
  maxUploadMb: number;
}

export function ResourcesView({ resources, courses, courseId, type, q, maxUploadMb }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = React.useState(q ?? "");
  const [semantic, setSemantic] = React.useState<{ q: string; hits: SemanticHit[] } | null>(null);
  const [semanticLoading, setSemanticLoading] = React.useState(false);

  const setParam = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (!v || v === "all") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`);
    },
    [params, pathname, router],
  );

  React.useEffect(() => {
    if ((q ?? "") === search) return;
    const t = setTimeout(() => setParam({ q: search || undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function runSemantic() {
    if (search.trim().length < 2) return;
    setSemanticLoading(true);
    try {
      const res = await apiGet<{ results: SemanticHit[] }>(`/api/resources/search?q=${encodeURIComponent(search)}${courseId ? `&courseId=${courseId}` : ""}`);
      setSemantic({ q: search, hits: res.results });
    } catch {
      setSemantic({ q: search, hits: [] });
    } finally {
      setSemanticLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <UploadDropzone courses={courses} maxMb={maxUploadMb} fixedCourseId={courseId} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <Input
            leftIcon={<Search />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSemantic()}
            placeholder="Search resources, or ask about your documents"
            className="h-10"
            aria-label="Search resources"
          />
          <button
            type="button"
            onClick={runSemantic}
            disabled={search.trim().length < 2 || semanticLoading}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary-soft px-3 text-sm font-medium text-brand-700 transition hover:bg-brand-200 disabled:opacity-50 dark:text-brand-200 dark:hover:bg-brand-800/40"
          >
            <Sparkles className="size-4" /> {semanticLoading ? "Searching…" : "AI search"}
          </button>
        </div>
        <Select value={courseId ?? "all"} onValueChange={(v) => setParam({ courseId: v })}>
          <SelectTrigger className="h-10 sm:w-56" aria-label="Filter by course">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {semantic ? (
        <section className="rounded-2xl border border-brand-200 bg-primary-soft/40 p-4 dark:border-brand-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-brand-500" /> Passages matching “{semantic.q}”
            </h2>
            <button type="button" className="text-xs text-muted hover:text-foreground" onClick={() => setSemantic(null)}>
              Clear
            </button>
          </div>
          {semantic.hits.length === 0 ? (
            <p className="text-sm text-muted">No matching passages in your indexed documents. Upload PDFs, slides or notes to search inside them.</p>
          ) : (
            <ul className="space-y-2">
              {semantic.hits.map((h) => (
                <li key={h.chunkId} className="rounded-xl bg-surface p-3 shadow-xs">
                  <Link href={`/resources?document=${h.documentId}#chunk-${h.chunkId}`} className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
                    <FileText className="size-3.5" /> {h.documentName}
                    {h.page ? <span className="text-subtle">· p. {h.page}</span> : null}
                  </Link>
                  <p className="mt-1 line-clamp-3 text-sm text-foreground/90">{h.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <ResourceList resources={resources} courses={courses} activeType={type} onTypeChange={(t) => setParam({ type: t })} />
    </div>
  );
}
