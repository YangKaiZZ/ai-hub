import { z } from "zod";
import { ok, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { globalSearch } from "@/server/search/service";

const schema = z.object({ q: z.string().trim().max(120).default(""), limit: z.coerce.number().int().min(1).max(30).default(12) });

export const GET = route(async (req) => {
  const user = await requireUser();
  const { q, limit } = parseQuery(req, schema);
  const results = await globalSearch(user.id, q, limit);
  return ok({ results });
});
