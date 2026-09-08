import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ValidationError, toAppError } from "@/lib/errors";
import { logger, recordSystemEvent } from "@/lib/logger";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown } };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, init);
}

export function fail(error: AppError) {
  const body: ApiFailure = {
    ok: false,
    error: {
      code: error.code,
      message: error.userMessage,
      ...(error.code === "VALIDATION_ERROR" && error.details ? { details: error.details } : {}),
    },
  };
  const headers: Record<string, string> = {};
  if (error.code === "RATE_LIMITED") {
    const retry = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    if (retry) headers["Retry-After"] = String(retry);
  }
  return NextResponse.json<ApiFailure>(body, { status: error.status, headers });
}

/** Parse and validate a JSON body; throws ValidationError with field issues. */
export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  return parseWith(schema, raw);
}

export function parseQuery<T extends z.ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  const url = new URL(req.url);
  const obj: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams.entries()) {
    const existing = obj[k];
    if (existing === undefined) obj[k] = v;
    else obj[k] = Array.isArray(existing) ? [...existing, v] : [existing, v];
  }
  return parseWith(schema, obj);
}

export function parseWith<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] ??= issue.message;
    }
    throw new ValidationError("Validation failed", fieldErrors);
  }
  return result.data;
}

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response>;

/**
 * Wrap a route handler so every thrown error is converted into a safe JSON
 * response and logged. Unknown errors are recorded as system events.
 */
export function route<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const appErr = toAppError(err);
      if (appErr.status >= 500) {
        logger.error("api", appErr.message, { url: req.url, method: req.method, cause: String(appErr.cause ?? "") });
        void recordSystemEvent("ERROR", "api", appErr.message, { url: new URL(req.url).pathname, method: req.method });
      } else if (appErr.status === 401 || appErr.status === 403) {
        logger.warn("api", `${appErr.status} ${appErr.message}`, { url: new URL(req.url).pathname });
      }
      return fail(appErr);
    }
  };
}

/** Standard pagination query params. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const uuidSchema = z.string().uuid();
