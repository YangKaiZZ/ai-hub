import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/auth/crypto";
import { IntegrationError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { TaskIngestionEngine } from "@/server/ingestion/engine";
import { getLmsProvider } from "@/server/integrations/registry";
import type { ProviderCredentials } from "@/server/integrations/types";
import type { IntegrationProvider as ProviderName } from "@/generated/prisma/enums";

export const connectIntegrationSchema = z.object({
  provider: z.enum(["CANVAS", "MOODLE", "BLACKBOARD", "GENERIC"]),
  baseUrl: z.string().trim().url().max(2048),
  accessToken: z.string().trim().min(8).max(4096).optional(),
});
export type ConnectIntegrationInput = z.infer<typeof connectIntegrationSchema>;

export const integrationSelect = { id: true, provider: true, status: true, baseUrl: true, externalUserId: true, isMock: true, scopes: true, lastSyncedAt: true, lastError: true, createdAt: true, updatedAt: true } as const;

export async function listIntegrations(userId: string) {
  const items = await db.integration.findMany({ where: { userId }, select: { ...integrationSelect, syncLogs: { orderBy: { startedAt: "desc" }, take: 5 } }, orderBy: { createdAt: "asc" } });
  return items;
}

/** Connect (or reconnect) an LMS. Tokens are encrypted at rest; passwords are never accepted. */
export async function connectIntegration(userId: string, input: ConnectIntegrationInput) {
  const provider = getLmsProvider(input.provider);
  const result = await provider.connect({ baseUrl: input.baseUrl, accessToken: input.accessToken });
  const baseUrl = result.credentials.baseUrl;

  const integration = await db.integration.upsert({
    where: { userId_provider_baseUrl: { userId, provider: input.provider, baseUrl } },
    update: {
      status: "CONNECTED",
      externalUserId: result.externalUserId,
      accessTokenEncrypted: result.credentials.accessToken ? encryptSecret(result.credentials.accessToken) : null,
      refreshTokenEncrypted: result.credentials.refreshToken ? encryptSecret(result.credentials.refreshToken) : null,
      tokenExpiresAt: result.tokenExpiresAt ?? null,
      scopes: result.scopes ?? [],
      isMock: env.LMS_MOCK_MODE,
      lastError: null,
      settings: { displayName: result.displayName ?? null },
    },
    create: {
      userId,
      provider: input.provider,
      baseUrl,
      status: "CONNECTED",
      externalUserId: result.externalUserId,
      accessTokenEncrypted: result.credentials.accessToken ? encryptSecret(result.credentials.accessToken) : null,
      refreshTokenEncrypted: result.credentials.refreshToken ? encryptSecret(result.credentials.refreshToken) : null,
      tokenExpiresAt: result.tokenExpiresAt ?? null,
      scopes: result.scopes ?? [],
      isMock: env.LMS_MOCK_MODE,
      settings: { displayName: result.displayName ?? null },
    },
    select: integrationSelect,
  });

  // Remove the onboarding placeholder (empty baseUrl) for this provider if present.
  await db.integration.deleteMany({ where: { userId, provider: input.provider, baseUrl: "", status: "PENDING" } });
  logger.info("integrations", "connected", { userId, provider: input.provider, mock: env.LMS_MOCK_MODE });
  return integration;
}

export async function disconnectIntegration(userId: string, integrationId: string) {
  const integration = await db.integration.findFirst({ where: { id: integrationId, userId } });
  if (!integration) throw new NotFoundError("Integration");
  try {
    await getLmsProvider(integration.provider).disconnect(credentialsFor(integration));
  } catch (err) {
    logger.warn("integrations", "remote disconnect failed", { error: String(err) });
  }
  await db.integration.update({ where: { id: integration.id }, data: { status: "DISCONNECTED", accessTokenEncrypted: null, refreshTokenEncrypted: null, tokenExpiresAt: null } });
}

export async function deleteIntegration(userId: string, integrationId: string) {
  const integration = await db.integration.findFirst({ where: { id: integrationId, userId }, select: { id: true } });
  if (!integration) throw new NotFoundError("Integration");
  await db.integration.delete({ where: { id: integration.id } });
}

function credentialsFor(integration: { baseUrl: string | null; accessTokenEncrypted: string | null; refreshTokenEncrypted: string | null; externalUserId: string | null }): ProviderCredentials {
  return {
    baseUrl: integration.baseUrl ?? "",
    accessToken: integration.accessTokenEncrypted ? decryptSecret(integration.accessTokenEncrypted) : undefined,
    refreshToken: integration.refreshTokenEncrypted ? decryptSecret(integration.refreshTokenEncrypted) : undefined,
    externalUserId: integration.externalUserId ?? undefined,
  };
}

/** Pull courses, tasks, grades and announcements and hand them to the ingestion engine. */
export async function syncIntegration(userId: string, integrationId: string) {
  const integration = await db.integration.findFirst({ where: { id: integrationId, userId } });
  if (!integration) throw new NotFoundError("Integration");
  if (integration.status === "DISCONNECTED") throw new IntegrationError("This integration is disconnected. Reconnect it first.");

  const provider = getLmsProvider(integration.provider as ProviderName);
  const log = await db.syncLog.create({ data: { integrationId: integration.id, status: "RUNNING" } });

  try {
    let creds = credentialsFor(integration);
    creds = await provider.authenticate(creds);
    const scope = { since: integration.lastSyncedAt };

    const [courses, tasks, announcements, grades] = await Promise.all([
      provider.syncCourses(creds),
      provider.syncTasks(creds, scope),
      provider.syncAnnouncements(creds, scope).catch((err) => (logger.warn("integrations", "announcements failed", { error: String(err) }), [])),
      provider.syncGrades(creds, scope).catch((err) => (logger.warn("integrations", "grades failed", { error: String(err) }), [])),
    ]);

    const engine = new TaskIngestionEngine(userId);
    const result = await engine.ingest({ courses, tasks, grades, announcements });

    await db.$transaction([
      db.syncLog.update({ where: { id: log.id }, data: { status: result.errors.length ? "PARTIAL" : "SUCCESS", finishedAt: new Date(), coursesImported: result.coursesCreated, tasksImported: result.tasksCreated, tasksUpdated: result.tasksUpdated, gradesImported: result.gradesImported, error: result.errors.length ? result.errors.slice(0, 5).join("\n") : null } }),
      db.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), lastError: null, status: "CONNECTED" } }),
    ]);
    return { ...result, logId: log.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await db.$transaction([
      db.syncLog.update({ where: { id: log.id }, data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 1000) } }),
      db.integration.update({ where: { id: integration.id }, data: { lastError: message.slice(0, 500), status: "ERROR" } }),
    ]);
    logger.error("integrations", "sync failed", { integrationId, error: message });
    if (err instanceof IntegrationError) throw err;
    throw new IntegrationError(message, err);
  }
}
