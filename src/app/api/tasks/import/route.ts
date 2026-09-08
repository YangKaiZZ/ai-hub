import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { parseCsvTasks } from "@/server/ingestion/adapters/csv";
import { TaskIngestionEngine } from "@/server/ingestion/engine";

const schema = z.object({ csv: z.string().min(1).max(500_000), analyze: z.boolean().default(false) });

/** Bulk import tasks from CSV text. */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit(RATE_LIMITS.upload, user.id);
  const { csv, analyze } = await parseBody(req, schema);
  const parsed = parseCsvTasks(csv);
  const engine = new TaskIngestionEngine(user.id, { analyze, notifyNewTasks: false });
  const result = await engine.ingest({ tasks: parsed.tasks });
  return ok({ ...result, skipped: parsed.skipped, parsedRows: parsed.tasks.length });
});
