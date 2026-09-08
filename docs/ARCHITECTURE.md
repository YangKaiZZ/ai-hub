# AI Hub — Architecture

AI Hub is a multi-tenant SaaS for students at any institution. It is a single Next.js 16 application (App Router, TypeScript) with a clean server layer, PostgreSQL via Prisma 7, and pluggable external services (AI, storage, embeddings, LMS, email) hidden behind interfaces.

## High-level view

```
Browser ──► Next.js (App Router)
             ├── Pages / Server Components   src/app/**            render with data from src/server/**
             ├── Route Handlers (JSON + SSE) src/app/api/**        validate → services → JSON
             ├── Services (business logic)   src/server/**         own authorization + data rules
             │     ├── tasks, courses, grades, calendar, planner, workspace, resources, documents
             │     ├── ai/        provider abstraction, prompts, chat, agent tools, task intelligence, embeddings
             │     ├── rag/       hybrid retriever (FTS + embeddings)
             │     ├── ingestion/ TaskIngestionEngine + adapters (CSV, …)
             │     ├── integrations/ LMS providers (Canvas, Moodle, Blackboard, Generic) + sync
             │     └── storage/ email/ notifications/ search/ admin/ settings/
             └── Lib                          src/lib/**            env, db, auth, errors, api helpers, rate limit, logger
PostgreSQL ◄── Prisma Client (src/generated/prisma) via @prisma/adapter-pg
```

### Layering rules

1. **UI never talks to the database.** Pages and components call services (server components) or `/api/*` routes (client components).
2. **Services own authorization.** Every service function takes `userId` and scopes every query with it. Records fetched by id always use `where: { id, userId }`.
3. **External systems sit behind interfaces**: `AIProvider`, `EmbeddingProvider`, `StorageProvider`, `EmailProvider`, `LmsProvider`, `RateLimitStore`. Each has a default implementation and a mock/local one.
4. **Validation at the edge.** Every route parses its body/query with Zod (`parseBody`, `parseQuery`) and converts failures into structured 400s.
5. **Errors are typed.** Services throw `AppError` subclasses; `route()` maps them to safe JSON responses and logs 5xx as `SystemEvent`s. Stack traces never reach the client.

## Request lifecycle

```
POST /api/tasks
  → route()                 wraps handler, maps errors
  → requireUser()           session cookie → DB session → user (cached per request)
  → enforceRateLimit()      optional, per policy
  → parseBody(schema)       Zod validation
  → createTask(userId, in)  service: ownership checks, priority engine, calendar sync
  → ok(data)                { ok: true, data }
```

Pages use `requirePageUser()` which redirects to `/login` or `/onboarding`. `src/proxy.ts` (Next 16 proxy) does a cheap cookie presence check for protected prefixes and adds security headers; real auth always happens server-side.

## Key subsystems

### Priority engine (`src/server/tasks/priority.ts`)
Pure function: `calculatePriority({ dueDate, estimatedMinutes, importance, progress, status }, rules)` → `{ score 0-100, priority, reasons[] }`. Weighted blend of deadline urgency, remaining workload and importance, plus an overdue boost. Weights/thresholds are user-configurable (`UserPreference.priorityRules`). Tasks are re-scored lazily (`recalculateIfStale`, hourly per user) and on every edit.

### Task Ingestion Engine (`src/server/ingestion/engine.ts`)
Adapters normalize external data into `NormalizedTask` / `NormalizedCourse` / `NormalizedGrade` / `NormalizedAnnouncement`. The engine upserts idempotently on `(userId, source, externalId)`, never overwrites student-owned fields (status, progress, importance, manual priority), runs Task Intelligence on new tasks, links grades to tasks, and emits notifications.

### AI layer (`src/server/ai/**`) — see `AI_SYSTEM.md`
- `provider/` — `AIProvider` interface with `complete`, `structured` (Zod-validated JSON), `stream` (text + tool calls). `AnthropicProvider` (Claude via `@anthropic-ai/sdk`) and `MockProvider` (deterministic offline).
- `chat/` — conversation persistence + context assembly (student, course, task, workspace draft, retrieved sources) + SSE streaming.
- `agent/tools.ts` — tools bound to the caller's `userId`.
- `intelligence/` — task analysis and study-plan schemas.
- `embeddings/` — `EmbeddingProvider` (local feature-hashing default).

### Documents & RAG (`src/server/documents`, `src/server/rag`)
Upload → validate (size, MIME + magic bytes) → store → extract (PDF/DOCX/PPTX/text) → chunk (paragraph-aware, page-attributed) → embed → index (tsvector generated column) → summarize. Retrieval is hybrid: Postgres full-text candidates re-ranked by cosine similarity, scoped to the user and optionally to pinned documents or a course. Responses carry `SourceRef`s the UI renders as clickable citations.

### Study planner (`src/server/planner/service.ts`)
Gathers open tasks, preferences and calendar commitments → asks the AI for a structured plan → sanitizes (range, overlap, duration) → falls back to a deterministic greedy scheduler when needed. Plans are `PROPOSED` until the student confirms; confirmation publishes sessions to the calendar.

### Integrations (`src/server/integrations`) — see `INTEGRATIONS.md`
`LmsProvider` interface (`connect`, `authenticate`, `disconnect`, `syncCourses`, `syncTasks`, `syncAnnouncements`, `syncGrades`). Providers run in mock mode (`LMS_MOCK_MODE=true`) with realistic data or live mode with encrypted tokens. Sync results go through the ingestion engine and are logged in `SyncLog`.

## Frontend

- **Design system** in `src/components/ui` (Radix primitives + Tailwind 4 tokens defined in `globals.css`). Violet/lavender brand, neutral surfaces, semantic colours, light/dark themes.
- **App shell**: sticky sidebar (desktop), drawer + bottom bar (mobile), header with global search (⌘K), notifications and account menu.
- **Feature components** under `src/components/<feature>`; client components fetch via `src/lib/client/api.ts` and refresh server components with `router.refresh()`.
- **Streaming chat**: `useChatStream` consumes SSE from `/api/ai/chat` and renders text, tool activity and sources incrementally.

## Data model
See `DATABASE.md`. Every user-facing aggregate is scoped by `userId`; user-created content is soft-deleted (`deletedAt`).

## Configuration & environments
`src/lib/env.ts` validates all environment variables at boot. Institutions carry their own grading/term configuration (`Institution.gradingConfig`, `termConfig`) so nothing about a school is hard-coded.

## Scaling notes
- Stateless app servers; sessions live in the database.
- Rate limiting has a `RateLimitStore` interface (in-memory default → Redis).
- Document processing runs inline today (files ≤ `MAX_UPLOAD_MB`); the pipeline is isolated in `processDocument()` so it can move to a queue/worker without API changes.
- Embeddings are stored as `float[]`; switching to `pgvector` is a migration plus a new `EmbeddingProvider`.
- Heavy dashboard queries are aggregated with `groupBy`/`count` (no N+1) and indexes exist on all per-user access paths.
