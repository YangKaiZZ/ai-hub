import { z } from "zod";
import { ok, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { retrieveChunks } from "@/server/rag/retriever";

const schema = z.object({ q: z.string().trim().min(2).max(300), courseId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(20).default(8) });

/** AI-powered semantic search over the user's indexed documents. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const { q, courseId, limit } = parseQuery(req, schema);
  const results = await retrieveChunks({ userId: user.id, query: q, courseId: courseId ?? null, limit });
  return ok({
    results: results.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentName: r.documentName,
      page: r.page,
      snippet: r.content.slice(0, 400),
      score: Math.round(r.score * 100) / 100,
    })),
  });
});
