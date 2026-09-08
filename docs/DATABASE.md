# AI Hub — Database

PostgreSQL 14+ (tested on 16/17), managed with **Prisma 7** (`prisma/schema.prisma`, driver adapter `@prisma/adapter-pg`). Configuration lives in `prisma.config.ts` (reads `DATABASE_URL`).

## Conventions
- UUID primary keys (`@db.Uuid`), `createdAt` / `updatedAt` on every aggregate.
- **Soft deletion** (`deletedAt`) on user-facing aggregates: `User`, `Course`, `Task`, `Document`, `Resource`, `AIConversation`. Queries always filter `deletedAt: null`.
- **Tenant isolation**: every user-owned table carries `userId` and an index that starts with it. Cascades follow ownership (`onDelete: Cascade`), references that are merely informational use `SetNull`.
- **Idempotent imports**: `@@unique([userId, source, externalId])` on `Course` and `Task`; `@@unique([courseId, source, externalId])` on `Announcement`.
- Institution-specific behaviour (grading scale, term system, timezone, default LMS) is configuration on `Institution`, not code.

## Entity overview

| Area | Tables |
|---|---|
| Identity | `User`, `Account` (OAuth), `Session`, `PasswordResetToken`, `UserPreference` |
| Academic structure | `Institution`, `Term`, `Course`, `Enrollment`, `Announcement` |
| Work | `Task`, `TaskAttachment`, `AssignmentWorkspace`, `WorkspaceMessage` |
| Knowledge | `Document`, `DocumentChunk`, `Resource` |
| Assessment | `GradeCategory`, `Grade` |
| Time | `CalendarEvent`, `StudyPlan`, `StudySession` |
| AI | `AIConversation`, `AIMessage`, `AIUsageLog` |
| Integrations | `Integration`, `SyncLog` |
| System | `Notification`, `SystemEvent` |

### Relationships (simplified)

```
User 1─* Course 1─* Task 1─1 AssignmentWorkspace 1─* WorkspaceMessage
User 1─* Task 1─* TaskAttachment *─1 Document 1─* DocumentChunk
User 1─* Document / Resource / Grade / CalendarEvent / StudyPlan 1─* StudySession 1─1 CalendarEvent
User 1─* AIConversation 1─* AIMessage
User 1─* Integration 1─* SyncLog
User *─1 Institution 1─* Term 1─* Course
Course 1─* GradeCategory 1─* Grade
```

### Notable columns
- `Task.priorityScore` (0-100) and `Task.priority` are computed by the priority engine; `priorityLocked` marks a manual override. `aiAnalysis` stores the Task Intelligence JSON; `rawData` keeps the source payload.
- `AssignmentWorkspace.draft` is the student's own work; `checklist` is JSON `[{ id, text, done, source }]`.
- `DocumentChunk.embedding` is `float[]` (works without pgvector). The `search_vector` tsvector column is a generated column added by the `search_indexes` migration.
- `Integration.accessTokenEncrypted` / `refreshTokenEncrypted` — AES-256-GCM ciphertext; never plaintext.
- `UserPreference.studyPreferences`, `notificationSettings`, `priorityRules` — JSON with defaults defined in code (`DEFAULT_STUDY_PREFERENCES`, `DEFAULT_NOTIFICATION_SETTINGS`, `DEFAULT_PRIORITY_RULES`).

## Indexes
Every per-user access path has a composite index starting with `userId` (e.g. `Task(userId, status, dueDate)`, `CalendarEvent(userId, startAt)`, `Notification(userId, readAt, createdAt)`). Full-text: GIN on `DocumentChunk.search_vector`. Fuzzy search: trigram GIN indexes on task/course/resource/document/institution names **when `pg_trgm` is available** (the migration skips them otherwise).

## Migrations
```
prisma/migrations/
  20260909052511_init/             full schema
  20260909052600_search_indexes/   tsvector column + FTS / trigram indexes
```
- Development: `npm run db:migrate` (creates + applies), `npm run db:reset` (drop, re-apply, seed).
- Production: `npm run db:deploy` (applies pending migrations only). The Docker entrypoint runs this automatically.
- After changing `schema.prisma`, run `npx prisma migrate dev --name <change>` and commit the generated folder. Hand-written SQL (extensions, generated columns) goes in its own migration.

## Seed data
`npm run db:seed` (`prisma/seed.ts`) creates verified institutions, the demo student **andrew@demo.aihub.local / Password123** with four courses, twelve tasks, grades, resources, an indexed document, a study plan, a workspace with chat history, notifications and a mock LMS connection, plus **admin@demo.aihub.local / Password123**. Re-running the seed resets the demo users only.

## Local database options
1. **Docker**: `docker compose up -d db` → `postgresql://aihub:aihub@localhost:5432/aihub`.
2. **Prisma local Postgres** (no Docker): `npx prisma dev --detach --name aihub` prints a TCP URL; create a database and point `DATABASE_URL` at it.
3. Any hosted Postgres (Neon, Supabase, RDS…) — set `DATABASE_URL` and run `npm run db:deploy`.

## Future
- Switch `DocumentChunk.embedding` to `vector(n)` with pgvector for ANN indexes at scale.
- Partition `AIUsageLog` / `SystemEvent` by month if volume grows.
- Read replicas: services are read/write-agnostic; add a second Prisma client for reads.
