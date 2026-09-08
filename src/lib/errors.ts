/**
 * Application error hierarchy. Services throw these; the API layer maps them to
 * HTTP responses with friendly messages. Raw stack traces never reach the user.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_FILE"
  | "AI_UNAVAILABLE"
  | "INTEGRATION_ERROR"
  | "PROCESSING_FAILED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** Safe to show to end users. */
  readonly userMessage: string;

  constructor(
    code: ErrorCode,
    message: string,
    options: { status?: number; details?: unknown; userMessage?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? defaultStatus[code];
    this.details = options.details;
    this.userMessage = options.userMessage ?? defaultUserMessage[code];
  }
}

const defaultStatus: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_FILE: 415,
  AI_UNAVAILABLE: 503,
  INTEGRATION_ERROR: 502,
  PROCESSING_FAILED: 500,
  INTERNAL_ERROR: 500,
};

const defaultUserMessage: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Some of the information provided is invalid.",
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You do not have access to this.",
  NOT_FOUND: "We could not find what you were looking for.",
  CONFLICT: "That already exists.",
  RATE_LIMITED: "You are doing that too often. Please wait a moment and try again.",
  PAYLOAD_TOO_LARGE: "That file is too large.",
  UNSUPPORTED_FILE: "That file type is not supported.",
  AI_UNAVAILABLE: "The AI assistant is temporarily unavailable. Please try again shortly.",
  INTEGRATION_ERROR: "We could not reach your learning platform. Please try again later.",
  PROCESSING_FAILED: "We could not process that file.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super("VALIDATION_ERROR", message, { details });
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not authenticated") {
    super("UNAUTHORIZED", message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Resource") {
    super("NOT_FOUND", `${entity} not found`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", userMessage?: string) {
    super("CONFLICT", message, { userMessage });
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds?: number) {
    super("RATE_LIMITED", "Rate limit exceeded", { details: { retryAfterSeconds } });
    this.name = "RateLimitError";
  }
}

export class AIUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super("AI_UNAVAILABLE", "AI provider unavailable", { cause });
    this.name = "AIUnavailableError";
  }
}

export class IntegrationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("INTEGRATION_ERROR", message, { cause });
    this.name = "IntegrationError";
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Normalise any thrown value into an AppError without leaking internals. */
export function toAppError(err: unknown): AppError {
  if (isAppError(err)) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new AppError("INTERNAL_ERROR", message, { cause: err });
}
