import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { assertAIQuota } from "@/server/ai/quota";
import { AnthropicProvider } from "@/server/ai/provider/anthropic";
import { DeepSeekProvider } from "@/server/ai/provider/deepseek";
import { MockProvider } from "@/server/ai/provider/mock";
import type { AIProvider, AIUsage, BaseOptions, StreamEvent, StreamOptions, StructuredOptions } from "@/server/ai/provider/types";

type QuotaCheck = (userId: string | undefined) => Promise<void>;

/**
 * Checks the daily allowance before handing a call to the real provider.
 *
 * Wrapping the provider, rather than checking in each feature, means no call
 * site can forget: tutor chat, task analysis, document summaries and the study
 * planner all pass through here. A refused stream ends with an error event the
 * chat UI already knows how to show; the other calls throw, and their callers
 * already fall back to non-AI behaviour when the provider fails.
 */
export class QuotaGuardedProvider implements AIProvider {
  constructor(
    private readonly inner: AIProvider,
    private readonly check: QuotaCheck = assertAIQuota,
  ) {}

  get name() {
    return this.inner.name;
  }

  get model() {
    return this.inner.model;
  }

  async complete(options: BaseOptions) {
    await this.check(options.userId);
    return this.inner.complete(options);
  }

  async structured<T>(options: StructuredOptions<T>) {
    await this.check(options.userId);
    return this.inner.structured(options);
  }

  async *stream(options: StreamOptions): AsyncGenerator<StreamEvent, void, void> {
    try {
      await this.check(options.userId);
    } catch (err) {
      if (!isAppError(err)) throw err;
      yield { type: "error", message: err.userMessage, code: err.code };
      return;
    }
    yield* this.inner.stream(options);
  }

  healthcheck() {
    return this.inner.healthcheck();
  }
}

let provider: AIProvider | undefined;

/** Resolve the configured provider. Swappable at runtime for tests. */
export function getAIProvider(): AIProvider {
  if (provider) return provider;
  // Real providers cost money per call, so they sit behind the daily allowance.
  // The mock is free and stays unwrapped, which also keeps tests independent of it.
  if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) {
    provider = new QuotaGuardedProvider(new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL }));
  } else if (env.AI_PROVIDER === "deepseek" && env.DEEPSEEK_API_KEY) {
    provider = new QuotaGuardedProvider(
      new DeepSeekProvider({ apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL, baseUrl: env.DEEPSEEK_BASE_URL }),
    );
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
