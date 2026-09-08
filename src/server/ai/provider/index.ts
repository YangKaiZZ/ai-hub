import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { AnthropicProvider } from "@/server/ai/provider/anthropic";
import { MockProvider } from "@/server/ai/provider/mock";
import type { AIProvider, AIUsage } from "@/server/ai/provider/types";

let provider: AIProvider | undefined;

/** Resolve the configured provider. Swappable at runtime for tests. */
export function getAIProvider(): AIProvider {
  if (provider) return provider;
  if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) {
    provider = new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL });
  } else {
    provider = new MockProvider();
  }
  logger.info("ai", `AI provider ready: ${provider.name} (${provider.model})`);
  return provider;
}

export function setAIProvider(next: AIProvider | undefined) {
  provider = next;
}

export function isMockAI() {
  return getAIProvider().name === "mock";
}

/** Persist token usage for admin analytics. Never throws. */
export async function logAIUsage(input: {
  userId?: string;
  feature: string;
  provider: string;
  model: string;
  usage: AIUsage;
  latencyMs?: number;
  success?: boolean;
  errorCode?: string;
}) {
  try {
    await db.aIUsageLog.create({
      data: {
        userId: input.userId ?? null,
        feature: input.feature,
        provider: input.provider,
        model: input.model,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        cacheReadTokens: input.usage.cacheReadTokens ?? 0,
        latencyMs: input.latencyMs ?? null,
        success: input.success ?? true,
        errorCode: input.errorCode ?? null,
      },
    });
  } catch (err) {
    logger.warn("ai", "failed to log usage", { error: String(err) });
  }
}

export type { AIProvider, AITool, AIMessage, StreamEvent } from "@/server/ai/provider/types";
