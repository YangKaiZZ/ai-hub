import { db } from "@/lib/db";
import { isDemoEmail } from "@/lib/demo";
import { env } from "@/lib/env";
import { AIQuotaExceededError } from "@/lib/errors";

/**
 * Daily AI allowance, counted from the usage log every AI call already writes.
 *
 * Three ceilings, each in successful AI calls per UTC day, 0 meaning no limit:
 *
 *  - AI_DAILY_LIMIT_PER_USER   each ordinary account
 *  - AI_DAILY_LIMIT_DEMO       the shared demo login, which every visitor uses,
 *                              so this is effectively the budget for all of them
 *  - AI_DAILY_LIMIT_TOTAL      everyone combined: the hard ceiling on what the
 *                              API key can be charged for in a day
 *
 * Counting the log rather than keeping a counter means the limit survives
 * restarts and needs no extra table. Logging is fire-and-forget, so a burst of
 * simultaneous requests can overshoot by a few calls; the per-minute rate limit
 * on the chat route bounds how far.
 */

/** Only calls that reached a paid provider and succeeded count. Mock output is free. */
const billable = { success: true, provider: { not: "mock" } } as const;

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcMidnight(now: Date): Date {
  const next = startOfUtcDay(now);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Throws AIQuotaExceededError when this call would exceed today's allowance. */
export async function assertAIQuota(userId: string | undefined, now: Date = new Date()): Promise<void> {
  const since = startOfUtcDay(now);
  const resetsAt = nextUtcMidnight(now);

  // The deployment-wide ceiling first: it protects the bill even for calls
  // that carry no user.
  if (env.AI_DAILY_LIMIT_TOTAL > 0) {
    const total = await db.aIUsageLog.count({ where: { ...billable, createdAt: { gte: since } } });
    if (total >= env.AI_DAILY_LIMIT_TOTAL) throw new AIQuotaExceededError("total", resetsAt);
  }

  if (!userId) return;

  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  const limit = isDemoEmail(user?.email) ? env.AI_DAILY_LIMIT_DEMO : env.AI_DAILY_LIMIT_PER_USER;
  if (limit <= 0) return;

  const used = await db.aIUsageLog.count({ where: { ...billable, userId, createdAt: { gte: since } } });
  if (used >= limit) throw new AIQuotaExceededError("user", resetsAt);
}
