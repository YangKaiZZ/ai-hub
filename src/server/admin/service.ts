import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getAIProvider } from "@/server/ai/provider";
import { listLmsProviders } from "@/server/integrations/registry";

/**
 * Admin read models. Deliberately aggregate-first: user rows expose only
 * identity/activity fields, never content (tasks, files, conversations).
 */
export async function getAdminOverview() {
  const now = new Date();
  const since7 = subDays(now, 7);
  const since30 = subDays(now, 30);

  const [users, activeUsers7, newUsers30, institutions, tasks, documents, conversations, integrations, aiUsage7, errors24h, recentEvents, recentUsers, aiByFeature, providers] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.user.count({ where: { deletedAt: null, lastActiveAt: { gte: since7 } } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: since30 } } }),
    db.institution.count(),
    db.task.count({ where: { deletedAt: null } }),
    db.document.count({ where: { deletedAt: null } }),
    db.aIConversation.count({ where: { deletedAt: null } }),
    db.integration.groupBy({ by: ["provider", "status"], _count: { _all: true } }),
    db.aIUsageLog.aggregate({ where: { createdAt: { gte: since7 } }, _sum: { inputTokens: true, outputTokens: true }, _count: { _all: true }, _avg: { latencyMs: true } }),
    db.systemEvent.count({ where: { level: "ERROR", createdAt: { gte: subDays(now, 1) } } }),
    db.systemEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, level: true, area: true, message: true, createdAt: true } }),
    db.user.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true, lastActiveAt: true, onboardingCompletedAt: true, institution: { select: { name: true } } } }),
    db.aIUsageLog.groupBy({ by: ["feature"], where: { createdAt: { gte: since7 } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true } }),
    Promise.resolve(listLmsProviders()),
  ]);

  const failedAi7 = await db.aIUsageLog.count({ where: { createdAt: { gte: since7 }, success: false } });
  const aiProvider = getAIProvider();
  const aiHealth = await aiProvider.healthcheck().catch((e) => ({ ok: false, detail: String(e) }));

  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }

  return {
    counts: { users, activeUsers7, newUsers30, institutions, tasks, documents, conversations },
    ai: {
      provider: aiProvider.name,
      model: aiProvider.model,
      healthy: aiHealth.ok,
      detail: aiHealth.detail ?? null,
      requests7: aiUsage7._count._all,
      failed7: failedAi7,
      inputTokens7: aiUsage7._sum.inputTokens ?? 0,
      outputTokens7: aiUsage7._sum.outputTokens ?? 0,
      avgLatencyMs: Math.round(aiUsage7._avg.latencyMs ?? 0),
      byFeature: aiByFeature.map((f) => ({ feature: f.feature, requests: f._count._all, inputTokens: f._sum.inputTokens ?? 0, outputTokens: f._sum.outputTokens ?? 0 })),
    },
    integrations: {
      providers,
      mockMode: env.LMS_MOCK_MODE,
      connections: integrations.map((i) => ({ provider: i.provider, status: i.status, count: i._count._all })),
    },
    health: { database: dbOk, storage: env.STORAGE_PROVIDER, environment: env.NODE_ENV, errors24h },
    recentEvents,
    recentUsers,
  };
}

export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;

export async function listAdminInstitutions() {
  const institutions = await db.institution.findMany({ orderBy: [{ isVerified: "desc" }, { name: "asc" }], select: { id: true, name: true, slug: true, country: true, type: true, isVerified: true, isUserCreated: true, defaultLms: true, _count: { select: { users: true, courses: true } } }, take: 200 });
  return institutions;
}

export async function setInstitutionVerified(id: string, verified: boolean) {
  return db.institution.update({ where: { id }, data: { isVerified: verified } });
}
