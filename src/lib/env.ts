import { z } from "zod";

/**
 * Centralised, validated access to environment variables.
 * Import `env` instead of reading `process.env` directly so misconfiguration
 * fails fast at boot with a readable message rather than deep inside a request.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  INTEGRATION_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "INTEGRATION_ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),

  DATABASE_URL: z.string().min(1),
  /** pg pool size. Set to 1 for single-connection embedded servers (e.g. `prisma dev`). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  AI_PROVIDER: z.enum(["anthropic", "mock"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5"),
  AI_FAST_MODEL: z.string().default("claude-haiku-4-5"),
  EMBEDDING_PROVIDER: z.enum(["local"]).default("local"),

  STORAGE_PROVIDER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),

  LMS_MOCK_MODE: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  EMAIL_PROVIDER: z.enum(["console"]).default("console"),
  EMAIL_FROM: z.string().default("AI Hub <no-reply@aihub.local>"),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const value = parsed.data;
  if (value.AI_PROVIDER === "anthropic" && !value.ANTHROPIC_API_KEY) {
    if (value.NODE_ENV === "production") {
      throw new Error("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY in production");
    }
    // In development fall back to the mock provider so the app stays usable offline.
    return { ...value, AI_PROVIDER: "mock" };
  }
  return value;
}

let cached: Env | undefined;

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: keyof Env) {
    cached ??= load();
    return cached[prop];
  },
});

/** Test helper: force re-validation after mutating process.env. */
export function resetEnvCache() {
  cached = undefined;
}

export const isProduction = () => env.NODE_ENV === "production";
export const isDevelopment = () => env.NODE_ENV === "development";
