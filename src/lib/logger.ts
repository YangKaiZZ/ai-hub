import { env } from "@/lib/env";

type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYS = /password|token|secret|authorization|cookie|apikey|api_key/i;

/** Strip anything that looks like a credential before it hits stdout or the DB. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, area: string, message: string, context?: Record<string, unknown>) {
  if (level === "debug" && env.NODE_ENV === "production") return;
  const line = {
    ts: new Date().toISOString(),
    level,
    area,
    message,
    ...(context ? { context: redact(context) } : {}),
  };
  const out = level === "error" || level === "warn" ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  debug: (area: string, message: string, context?: Record<string, unknown>) => emit("debug", area, message, context),
  info: (area: string, message: string, context?: Record<string, unknown>) => emit("info", area, message, context),
  warn: (area: string, message: string, context?: Record<string, unknown>) => emit("warn", area, message, context),
  error: (area: string, message: string, context?: Record<string, unknown>) => emit("error", area, message, context),
};

/**
 * Persist an operational event for the admin dashboard. Imported lazily to keep
 * this module usable in places (edge/proxy) where the DB client cannot load.
 */
export async function recordSystemEvent(
  level: "INFO" | "WARN" | "ERROR",
  area: string,
  message: string,
  context?: Record<string, unknown>,
) {
  try {
    const { db } = await import("@/lib/db");
    await db.systemEvent.create({
      data: { level, area, message, context: context ? (redact(context) as object) : undefined },
    });
  } catch (err) {
    logger.warn("system-event", "failed to persist system event", { error: String(err) });
  }
}
