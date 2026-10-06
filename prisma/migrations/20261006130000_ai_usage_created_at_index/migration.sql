-- Daily AI quota (src/server/ai/quota.ts) counts every billable call since
-- midnight UTC across all users, which filters on createdAt alone.
-- CreateIndex
CREATE INDEX "AIUsageLog_createdAt_idx" ON "AIUsageLog"("createdAt");
