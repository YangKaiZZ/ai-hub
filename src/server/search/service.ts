import { db } from "@/lib/db";

export type SearchResultKind = "task" | "course" | "resource" | "document" | "workspace";

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
}

/**
 * Global keyword search across the user's own data. Uses case-insensitive
 * substring matching (backed by trigram indexes) and returns a merged, ranked
 * list. Semantic search over documents lives in the RAG retriever.
 */
export async function globalSearch(userId: string, q: string, limit = 12): Promise<SearchResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const contains = { contains: term, mode: "insensitive" as const };
  const per = Math.max(3, Math.ceil(limit / 2));

  const [tasks, courses, resources, documents] = await Promise.all([
    db.task.findMany({
      where: { userId, deletedAt: null, OR: [{ title: contains }, { description: contains }] },
      select: { id: true, title: true, dueDate: true, status: true, course: { select: { name: true } }, workspace: { select: { id: true } } },
      take: per,
      orderBy: { updatedAt: "desc" },
    }),
    db.course.findMany({
      where: { userId, deletedAt: null, OR: [{ name: contains }, { code: contains }, { instructor: contains }] },
      select: { id: true, name: true, code: true, instructor: true },
      take: per,
    }),
    db.resource.findMany({
      where: { userId, deletedAt: null, OR: [{ title: contains }, { content: contains }, { tags: { has: term.toLowerCase() } }] },
      select: { id: true, title: true, type: true, course: { select: { name: true } } },
      take: per,
      orderBy: { updatedAt: "desc" },
    }),
    db.document.findMany({
      where: { userId, deletedAt: null, OR: [{ name: contains }, { summary: contains }] },
      select: { id: true, name: true, status: true, course: { select: { name: true } } },
      take: per,
    }),
  ]);

  const lower = term.toLowerCase();
  const rank = (title: string, base: number) => {
    const t = title.toLowerCase();
    if (t === lower) return base + 30;
    if (t.startsWith(lower)) return base + 20;
    if (t.includes(lower)) return base + 10;
    return base;
  };

  const results: SearchResult[] = [
    ...tasks.map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.title,
      subtitle: [t.course?.name, t.dueDate ? `Due ${t.dueDate.toLocaleDateString()}` : null].filter(Boolean).join(" · "),
      href: `/tasks/${t.id}`,
      score: rank(t.title, t.status === "COMPLETED" ? 40 : 60),
    })),
    ...tasks
      .filter((t) => t.workspace)
      .map((t) => ({
        kind: "workspace" as const,
        id: t.workspace!.id,
        title: `Workspace: ${t.title}`,
        subtitle: t.course?.name ?? undefined,
        href: `/workspace/${t.workspace!.id}`,
        score: rank(t.title, 55),
      })),
    ...courses.map((c) => ({
      kind: "course" as const,
      id: c.id,
      title: c.name,
      subtitle: [c.code, c.instructor].filter(Boolean).join(" · "),
      href: `/courses/${c.id}`,
      score: rank(c.name, 65),
    })),
    ...resources.map((r) => ({
      kind: "resource" as const,
      id: r.id,
      title: r.title,
      subtitle: [r.type.replace("_", " ").toLowerCase(), r.course?.name].filter(Boolean).join(" · "),
      href: `/resources/${r.id}`,
      score: rank(r.title, 50),
    })),
    ...documents.map((d) => ({
      kind: "document" as const,
      id: d.id,
      title: d.name,
      subtitle: [d.course?.name, d.status === "READY" ? "Ready" : d.status.toLowerCase()].filter(Boolean).join(" · "),
      href: `/resources?document=${d.id}`,
      score: rank(d.name, 45),
    })),
  ];

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
