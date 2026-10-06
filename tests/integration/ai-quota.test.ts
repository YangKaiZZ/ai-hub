import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { assertAIQuota, startOfUtcDay } from "@/server/ai/quota";
import { createTestUser, deleteTestUser, hasDatabase } from "./helpers";

/**
 * The quota is counted from AIUsageLog, so these tests write log rows directly
 * and check where the line falls. Only "deepseek" rows count: other test files
 * use the mock provider, whose rows are excluded, so they cannot interfere.
 */

const dbAvailable = await hasDatabase();
const saved = {
  user: process.env.AI_DAILY_LIMIT_PER_USER,
  demo: process.env.AI_DAILY_LIMIT_DEMO,
  total: process.env.AI_DAILY_LIMIT_TOTAL,
};

let userId = "";
let demoUserId = "";
const now = new Date();

function setLimits(limits: { user: number; demo: number; total: number }) {
  process.env.AI_DAILY_LIMIT_PER_USER = String(limits.user);
  process.env.AI_DAILY_LIMIT_DEMO = String(limits.demo);
  process.env.AI_DAILY_LIMIT_TOTAL = String(limits.total);
  resetEnvCache();
}

async function logCalls(forUser: string, n: number, extra: { createdAt?: Date; success?: boolean; provider?: string } = {}) {
  await db.aIUsageLog.createMany({
    data: Array.from({ length: n }, () => ({
      userId: forUser,
      feature: "tutor",
      provider: extra.provider ?? "deepseek",
      model: "deepseek-chat",
      inputTokens: 100,
      outputTokens: 20,
      success: extra.success ?? true,
      createdAt: extra.createdAt ?? now,
    })),
  });
}

beforeAll(async () => {
  if (!dbAvailable) return;
  userId = (await createTestUser("quota")).id;
  const demoId = randomUUID();
  await db.user.create({
    data: {
      id: demoId,
      email: `quota+${demoId.slice(0, 8)}@demo.aihub.local`,
      firstName: "Demo",
      passwordHash: "x",
      onboardingCompletedAt: now,
      preference: { create: {} },
    },
  });
  demoUserId = demoId;
});

afterAll(async () => {
  if (dbAvailable) {
    await db.aIUsageLog.deleteMany({ where: { userId: { in: [userId, demoUserId] } } });
    await Promise.all([deleteTestUser(userId), deleteTestUser(demoUserId)]);
  }
  process.env.AI_DAILY_LIMIT_PER_USER = saved.user;
  process.env.AI_DAILY_LIMIT_DEMO = saved.demo;
  process.env.AI_DAILY_LIMIT_TOTAL = saved.total;
  resetEnvCache();
});

describe.skipIf(!dbAvailable)("daily AI quota", () => {
  it("allows calls up to the per-user limit and refuses the next one", async () => {
    setLimits({ user: 3, demo: 100, total: 0 });
    await logCalls(userId, 2);
    await expect(assertAIQuota(userId, now)).resolves.toBeUndefined();
    await logCalls(userId, 1);
    await expect(assertAIQuota(userId, now)).rejects.toMatchObject({ code: "AI_QUOTA_EXCEEDED", details: { scope: "user" } });
  });

  it("only counts today's successful calls to a paid provider", async () => {
    await db.aIUsageLog.deleteMany({ where: { userId } });
    setLimits({ user: 2, demo: 100, total: 0 });
    const yesterday = new Date(startOfUtcDay(now).getTime() - 60_000);
    await logCalls(userId, 5, { createdAt: yesterday });
    await logCalls(userId, 5, { success: false });
    await logCalls(userId, 5, { provider: "mock" });
    await logCalls(userId, 1);
    await expect(assertAIQuota(userId, now)).resolves.toBeUndefined();
  });

  it("gives the shared demo login its own, separate allowance", async () => {
    setLimits({ user: 1, demo: 4, total: 0 });
    await logCalls(demoUserId, 3);
    await expect(assertAIQuota(demoUserId, now)).resolves.toBeUndefined();
    await logCalls(demoUserId, 1);
    await expect(assertAIQuota(demoUserId, now)).rejects.toMatchObject({ details: { scope: "user" } });
  });

  it("stops everyone once the deployment-wide ceiling is reached", async () => {
    const since = startOfUtcDay(now);
    const billableToday = await db.aIUsageLog.count({ where: { success: true, provider: { not: "mock" }, createdAt: { gte: since } } });
    setLimits({ user: 0, demo: 0, total: billableToday + 1 });
    await expect(assertAIQuota(undefined, now)).resolves.toBeUndefined();
    await logCalls(userId, 1);
    await expect(assertAIQuota(undefined, now)).rejects.toMatchObject({ details: { scope: "total" } });
    // The total applies even to a user who has room left in their own allowance.
    await expect(assertAIQuota(userId, now)).rejects.toMatchObject({ details: { scope: "total" } });
  });

  it("treats 0 as no limit", async () => {
    setLimits({ user: 0, demo: 0, total: 0 });
    await logCalls(userId, 20);
    await expect(assertAIQuota(userId, now)).resolves.toBeUndefined();
  });
});
