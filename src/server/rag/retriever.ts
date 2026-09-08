import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { cosineSimilarity, getEmbeddingProvider } from "@/server/ai/embeddings";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  courseId: string | null;
  index: number;
  page: number | null;
  content: string;
  score: number;
}

export interface RetrieveOptions {
  userId: string;
  query: string;
  limit?: number;
  /** Restrict to these documents (e.g. pinned into a conversation). */
  documentIds?: string[];
  courseId?: string | null;
}

/**
 * Hybrid retrieval scoped to one user:
 *  1. PostgreSQL full-text search (tsvector) for lexical candidates
 *  2. Embedding cosine re-ranking over candidates (+ a recency fallback so
 *     short or unusual queries still surface something relevant)
 */
export async function retrieveChunks(options: RetrieveOptions): Promise<RetrievedChunk[]> {
  const limit = options.limit ?? 6;
  const query = options.query.trim();
  if (!query) return [];

  const scopeDocs = Prisma.sql`d."userId" = ${options.userId}::uuid AND d."deletedAt" IS NULL AND d."status" = 'READY'`;
  const docFilter = options.documentIds?.length
    ? Prisma.sql`AND d."id" IN (${Prisma.join(options.documentIds.map((id) => Prisma.sql`${id}::uuid`))})`
    : options.courseId
      ? Prisma.sql`AND (d."courseId" = ${options.courseId}::uuid OR d."courseId" IS NULL)`
      : Prisma.empty;

  type Row = { id: string; documentId: string; documentName: string; courseId: string | null; index: number; page: number | null; content: string; embedding: number[]; rank: number };

  const ftsRows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT c."id", c."documentId", d."name" AS "documentName", d."courseId", c."index", c."page", c."content", c."embedding",
           ts_rank_cd(c."search_vector", websearch_to_tsquery('english', ${query})) AS "rank"
    FROM "DocumentChunk" c
    JOIN "Document" d ON d."id" = c."documentId"
    WHERE ${scopeDocs} ${docFilter}
      AND c."search_vector" @@ websearch_to_tsquery('english', ${query})
    ORDER BY "rank" DESC
    LIMIT 40
  `);

  let candidates = ftsRows;
  if (candidates.length < limit) {
    // Fallback: recent chunks from the scoped documents, ranked purely by embedding.
    const seen = new Set(candidates.map((c) => c.id));
    const extra = await db.$queryRaw<Row[]>(Prisma.sql`
      SELECT c."id", c."documentId", d."name" AS "documentName", d."courseId", c."index", c."page", c."content", c."embedding", 0::float AS "rank"
      FROM "DocumentChunk" c
      JOIN "Document" d ON d."id" = c."documentId"
      WHERE ${scopeDocs} ${docFilter}
      ORDER BY d."updatedAt" DESC, c."index" ASC
      LIMIT 120
    `);
    candidates = [...candidates, ...extra.filter((c) => !seen.has(c.id))];
  }
  if (candidates.length === 0) return [];

  const [queryVec] = await getEmbeddingProvider().embed([query]);
  const maxRank = Math.max(...candidates.map((c) => Number(c.rank) || 0), 1e-9);

  return candidates
    .map((c) => {
      const lexical = (Number(c.rank) || 0) / maxRank; // 0..1
      const semantic = c.embedding?.length ? Math.max(0, cosineSimilarity(queryVec ?? [], c.embedding)) : 0;
      const score = lexical * 0.55 + semantic * 0.45;
      return { chunkId: c.id, documentId: c.documentId, documentName: c.documentName, courseId: c.courseId, index: c.index, page: c.page, content: c.content, score };
    })
    .filter((c) => c.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface SourceRef {
  documentId: string;
  chunkId: string;
  title: string;
  page: number | null;
  snippet: string;
}

/** Format retrieved chunks as <source> blocks for the prompt plus UI-ready refs. */
export function formatSources(chunks: RetrievedChunk[]): { prompt: string; refs: SourceRef[] } {
  if (chunks.length === 0) return { prompt: "", refs: [] };
  const refs: SourceRef[] = chunks.map((c) => ({
    documentId: c.documentId,
    chunkId: c.chunkId,
    title: c.documentName.replace(/\.[a-z0-9]+$/i, ""),
    page: c.page,
    snippet: c.content.slice(0, 220).replace(/\s+/g, " ").trim(),
  }));
  const prompt = chunks
    .map((c, i) => `<source id="${i + 1}" title="${escapeAttr(refs[i]!.title)}"${c.page ? ` page="${c.page}"` : ""}>\n${c.content.slice(0, 3000)}\n</source>`)
    .join("\n");
  return { prompt, refs };
}

function escapeAttr(s: string) {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
