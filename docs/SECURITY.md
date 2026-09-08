# AI Hub — Security

Security is a first-class requirement. This document lists the controls in place and how to keep them intact.

## Authentication
- **Passwords** are hashed with bcrypt (cost 12) — `src/lib/auth/password.ts`. Policy: ≥ 8 chars with a letter and a number.
- **Sessions** are database-backed (`Session` table). The cookie (`aihub_session`) holds an opaque random token; only its SHA-256 hash is stored. Cookies are `httpOnly`, `SameSite=Lax`, `Secure` in production, 30-day expiry.
- **Login** always runs a bcrypt comparison even for unknown emails to avoid timing-based account enumeration; the error is the same for wrong email and wrong password.
- **Password reset** uses single-use, hashed, 1-hour tokens; requesting a reset always returns success. Completing a reset invalidates every session.
- **OAuth-ready**: `Account` table + `Session` model support external identity providers without schema changes.
- Users can view and revoke active sessions in Settings → Security.

## Authorization & tenant isolation
- Every service function requires `userId` and includes it in each query (`where: { id, userId }`). There is no code path that loads a user-owned record by id alone.
- Relations are checked explicitly where needed (`assertOwnership`), e.g. attaching a task to a course verifies the course belongs to the same user.
- Admin routes use `requireAdmin()`; admin read models are aggregates and identity fields only — never student content.
- AI agent tools are constructed per request with the caller's `userId` bound; the model cannot pass a user id.

## Input validation
- All route bodies/queries are validated with Zod (`parseBody`, `parseQuery`); IDs must be UUIDs.
- Prisma parameterises every query; raw SQL in the retriever uses `Prisma.sql` tagged templates (parameterised).
- React renders text, never `dangerouslySetInnerHTML`; the Markdown renderer for AI output emits React elements only (no HTML pass-through).

## Files
- MIME type is derived from filename + browser type and then verified against **magic bytes** (`sniffMatches`) — a renamed executable cannot pass as a PDF.
- Size limit `MAX_UPLOAD_MB` (default 25) enforced server-side; empty files rejected.
- Storage keys are app-generated (`<userId>/<uuid>.<ext>`); the local provider rejects any key that escapes its root.
- Downloads are served with `Content-Disposition`, `X-Content-Type-Options: nosniff`, `no-store`, only to the owner.
- Documents are soft-deleted and their chunks removed; the blob is deleted from storage.

## AI safety & prompt injection
- System prompts instruct the model to treat `<student_context>`, `<sources>`, task text and tool results as **data, not instructions**.
- Retrieved chunks are wrapped in `<source>` tags with escaped attributes.
- Tool inputs from the model are validated with Zod before execution; tool errors are returned to the model as `is_error` results rather than thrown.
- Academic integrity rules are part of every system prompt; there is no "submit assignment" capability anywhere.
- AI usage (tokens, latency, failures) is logged per user/feature for monitoring and abuse detection; AI endpoints are rate-limited.
- Fable-family / Opus refusal stop reasons are handled: a refusal yields a friendly message, never an exception leak.

## Secrets
- `SESSION_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL` come from the environment (`.env` is git-ignored; `.env.example` documents them).
- LMS access/refresh tokens are encrypted at rest with AES-256-GCM (`encryptSecret`) and decrypted only for the duration of a sync. **Raw LMS passwords are never accepted or stored.**
- The logger redacts keys matching `password|token|secret|authorization|cookie|apikey`.

## Transport & headers
- `next.config.ts` sets a Content-Security-Policy (`default-src 'self'`, no remote scripts, `frame-ancestors 'none'`), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and HSTS in production.
- `src/proxy.ts` re-applies baseline headers and redirects unauthenticated requests away from protected routes.

## Rate limiting
`src/lib/rate-limit.ts` — per-IP for login/signup/password reset, per-user for AI, uploads and LMS sync. In-memory store by default; implement `RateLimitStore` with Redis for multi-instance deployments.

## CSRF
State-changing requests are JSON `fetch` calls with `SameSite=Lax` cookies; browsers do not attach the session cookie to cross-site POSTs of `application/json`. Forms are not submitted cross-origin (`form-action 'self'` in CSP).

## Error handling
`route()` converts every thrown error into `{ ok: false, error: { code, message } }` with a user-safe message. Server errors are logged (redacted) and recorded as `SystemEvent`s for the admin dashboard. The client error boundary shows a friendly page with a digest reference.

## Operational checklist
- Rotate `SESSION_SECRET` and `INTEGRATION_ENCRYPTION_KEY` per environment; rotating the encryption key invalidates stored LMS tokens (users reconnect).
- Run `npm audit` regularly; the Docker image runs as a non-root user.
- Enable database backups; soft-deleted data (`deletedAt`) should be purged on a retention schedule.
- Consider moving rate limiting and document processing to shared infrastructure (Redis, queue) before horizontal scaling.
