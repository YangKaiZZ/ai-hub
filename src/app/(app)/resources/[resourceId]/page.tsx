import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, FileText, Layers, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CourseDot } from "@/components/courses/course-visual";
import { FlashcardDeck } from "@/components/resources/flashcard-deck";
import { ReprocessButton } from "@/components/resources/reprocess-button";
import { requirePageUser } from "@/lib/auth/guards";
import { isAppError } from "@/lib/errors";
import { formatDate } from "@/lib/utils";
import { getDocumentChunks } from "@/server/documents/service";
import { getResource } from "@/server/resources/service";
import { resourceTypeMeta } from "@/components/resources/resource-list";

export const metadata: Metadata = { title: "Resource" };

export default async function ResourceDetailPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const user = await requirePageUser();
  const { resourceId } = await params;

  let resource: Awaited<ReturnType<typeof getResource>>;
  try {
    resource = await getResource(user.id, resourceId);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const chunks = resource.document && resource.document.status === "READY" ? await getDocumentChunks(user.id, resource.document.id, 40) : [];
  const meta = resourceTypeMeta[resource.type] ?? resourceTypeMeta.NOTE!;
  const flashcards = resource.type === "FLASHCARD_SET" && resource.content ? safeCards(resource.content) : null;

  return (
    <div className="space-y-6">
      <Link href="/resources" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Resources
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge variant="brand">{meta.label}</Badge>
            {resource.course ? (
              <Link href={`/courses/${resource.course.id}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <CourseDot color={resource.course.color} /> {resource.course.name}
              </Link>
            ) : null}
            <span>· Updated {formatDate(resource.updatedAt)}</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{resource.title}</h1>
          {resource.tags.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {resource.tags.map((t) => (
                <Badge key={t} variant="outline">
                  #{t}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {resource.url ? (
            <Button asChild variant="outline">
              <a href={resource.url} target="_blank" rel="noreferrer">
                Open link <ExternalLink />
              </a>
            </Button>
          ) : null}
          {resource.document ? (
            <>
              <Button asChild variant="outline">
                <a href={`/api/documents/${resource.document.id}/file?download=1`}>
                  <Download /> Download
                </a>
              </Button>
              <ReprocessButton documentId={resource.document.id} />
            </>
          ) : null}
          <Button asChild>
            <Link href={`/tutor?${resource.document ? `document=${resource.document.id}` : resource.course ? `course=${resource.course.id}` : ""}`}>Ask AI about this</Link>
          </Button>
        </div>
      </div>

      {resource.document ? (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-4" /> {resource.document.name}
            </span>
            <span>{(resource.document.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
            {resource.document.pageCount ? <span>{resource.document.pageCount} pages</span> : null}
            <Badge variant={resource.document.status === "READY" ? "success" : resource.document.status === "FAILED" ? "danger" : "warning"}>{resource.document.status.toLowerCase()}</Badge>
          </div>
          {resource.document.summary ? <p className="mt-3 text-sm leading-relaxed">{resource.document.summary}</p> : null}
          {resource.document.mimeType === "application/pdf" ? (
            <iframe title="Document preview" src={`/api/documents/${resource.document.id}/file`} className="mt-4 h-[32rem] w-full rounded-xl border border-border bg-surface-muted" />
          ) : resource.document.mimeType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/documents/${resource.document.id}/file`} alt={resource.title} className="mt-4 max-h-[32rem] rounded-xl border border-border" />
          ) : null}
        </section>
      ) : null}

      {flashcards ? <FlashcardDeck cards={flashcards} /> : null}

      {resource.content && resource.type !== "FLASHCARD_SET" ? (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="prose-chat whitespace-pre-wrap text-sm leading-relaxed">{resource.content}</div>
        </section>
      ) : null}

      {chunks.length > 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Layers className="size-4 text-brand-500" /> Indexed sections ({resource.document?.chunkCount})
          </h2>
          <p className="mb-4 text-xs text-muted">These passages are what the AI Tutor can cite when you ask about this document.</p>
          <ol className="space-y-3">
            {chunks.map((c) => (
              <li key={c.id} id={`chunk-${c.id}`} className="rounded-xl bg-surface-muted p-3 text-sm">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                  Section {c.index + 1}
                  {c.page ? ` · page ${c.page}` : ""}
                </p>
                <p className="line-clamp-6 whitespace-pre-wrap text-foreground/90">{c.content}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : resource.document?.status === "FAILED" ? (
        <section className="rounded-2xl border border-danger/30 bg-danger-soft p-5 text-sm text-red-800 dark:text-red-200">
          <p className="font-semibold">We could not process this file.</p>
          <p className="mt-1">{resource.document.error ?? "Unknown error"}</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs">
            <RefreshCw className="size-3" /> Try “Reprocess” above, or re-upload the file.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function safeCards(json: string): { front: string; back: string }[] | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((c): c is { front: string; back: string } => typeof c === "object" && c !== null && typeof (c as { front?: unknown }).front === "string" && typeof (c as { back?: unknown }).back === "string");
  } catch {
    return null;
  }
}
