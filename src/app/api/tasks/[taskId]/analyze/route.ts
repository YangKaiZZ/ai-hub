import { ok, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { analyzeTask } from "@/server/ai/intelligence/service";
import { isMockAI } from "@/server/ai/provider";

type Ctx = { params: Promise<{ taskId: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  await enforceRateLimit(RATE_LIMITS.ai, user.id);
  const taskId = parseWith(uuidSchema, (await params).taskId);
  const analysis = await analyzeTask(user.id, taskId);
  return ok({ analysis, mock: isMockAI() });
});
