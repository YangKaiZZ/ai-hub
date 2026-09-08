import type { z } from "zod";

export type AIRole = "user" | "assistant";

export interface AIMessage {
  role: AIRole;
  content: string;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

export type Effort = "low" | "medium" | "high";

export interface BaseOptions {
  /** Stable, cacheable system prompt. Volatile context goes into messages. */
  system: string;
  messages: AIMessage[];
  maxTokens?: number;
  effort?: Effort;
  /** For usage logging / rate limiting. */
  feature: string;
  userId?: string;
  signal?: AbortSignal;
}

export interface StructuredOptions<T> extends BaseOptions {
  schema: z.ZodType<T>;
  schemaName: string;
}

/**
 * A tool the model may call. `execute` runs on our side with the caller's
 * userId already bound, so tools never receive or trust a user id from the model.
 */
export interface AITool<I = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  // Method syntax keeps parameter checking bivariant so AITool<{...}> is assignable to AITool<unknown>.
  execute(input: I): Promise<unknown>;
  /** Short human-friendly label shown in the UI while running ("Checking your deadlines"). */
  label?: string;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; label: string; input: unknown }
  | { type: "tool_result"; name: string; ok: boolean; summary: string }
  | { type: "done"; usage: AIUsage; model: string; stopReason: string | null }
  | { type: "error"; message: string; code: string };

export interface StreamOptions extends BaseOptions {
  tools?: AITool[];
  maxToolRounds?: number;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  complete(options: BaseOptions): Promise<{ text: string; usage: AIUsage; model: string }>;
  structured<T>(options: StructuredOptions<T>): Promise<{ data: T; usage: AIUsage; model: string }>;
  stream(options: StreamOptions): AsyncGenerator<StreamEvent, void, void>;
  healthcheck(): Promise<{ ok: boolean; detail?: string }>;
}
