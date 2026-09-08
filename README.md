# AI Hub

> **Your entire student life. One intelligent hub.**

AI Hub is a production-grade SaaS for students at any school, university or learning environment. It brings courses, deadlines, study materials and academic work into one place, with an AI tutor and study agent built around the way students actually study — designed as an academic assistant, never a shortcut.

- **Dashboard** that answers "what do I need to do?" — prioritized tasks, AI recommendations, courses, upcoming timeline
- **Tasks** with an explainable priority engine (deadline × workload × importance), filters, search, AI analysis
- **Assignment Workspaces** — instructions, rubric, files, your draft, checklist, notes, sources and a context-aware AI panel
- **AI Tutor & Study Agent** — streaming chat, Learning/Guided/Review modes, tools that read your real tasks/deadlines/grades
- **Documents + RAG** — upload PDF/DOCX/PPTX/text, get summaries and cited answers ("Week 4 lecture notes, p. 3")
- **Courses, Grades** (weighted categories, projections, target calculator), **Calendar** (month/week/agenda), **Study Planner** (AI Plan My Week with confirm-before-save)
- **LMS integrations** — Canvas / Moodle / Blackboard / Generic providers behind one interface, realistic mock mode, CSV import
- **Multi-tenant** — institutions carry their own grading/term/timezone config; strict per-user data isolation
- **Admin** — users, institutions, integrations, AI usage, system health

Demo login after seeding: `andrew@demo.aihub.local` / `Password123` (admin: `admin@demo.aihub.local`).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Styling | Tailwind CSS 4, Radix UI primitives, Lucide icons — custom design system in `src/components/ui` |
| Database | PostgreSQL + Prisma 7 (`@prisma/adapter-pg`) |
| Auth | Email/password (bcrypt), DB-backed sessions, OAuth-ready schema, RBAC |
| AI | `@anthropic-ai/sdk` (Claude Opus 5 by default) behind an `AIProvider` interface; offline `MockProvider` |
| Search/RAG | Postgres full-text search + local embeddings, hybrid retriever with source attribution |
| Storage | `StorageProvider` interface (local disk implementation) |
| Tests | Vitest (unit + integration), Playwright (e2e) |
| Deploy | Docker, docker-compose, `/api/health` |

Architecture details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Data model: [`docs/DATABASE.md`](docs/DATABASE.md) · LMS layer: [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) · AI: [`docs/AI_SYSTEM.md`](docs/AI_SYSTEM.md) · Security: [`docs/SECURITY.md`](docs/SECURITY.md)

---

## Quick start

### Prerequisites
- Node.js ≥ 20.9 (tested on 24)
- PostgreSQL 14+ — via Docker (`docker compose up -d db`) **or** Prisma's local server (`npx prisma dev`) **or** any hosted Postgres

### 1. Install
```bash
npm install
```
`postinstall` runs `prisma generate` (client is emitted to `src/generated/prisma`).

### 2. Configure
```bash
cp .env.example .env
```
Then edit `.env`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | ≥ 32 random chars (`node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`) |
| `INTEGRATION_ENCRYPTION_KEY` | 64 hex chars (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) — encrypts LMS tokens |
| `AI_PROVIDER` | `anthropic` (needs `ANTHROPIC_API_KEY`) or `mock` (offline, default in tests) |
| `AI_MODEL` | Claude model id, default `claude-opus-5` |
| `EMBEDDING_PROVIDER` | `local` (offline feature-hashing embeddings) |
| `STORAGE_PROVIDER` / `STORAGE_LOCAL_DIR` | `local` + directory for uploads (default `./storage`) |
| `MAX_UPLOAD_MB` | Upload size limit (default 25) |
| `LMS_MOCK_MODE` | `true` = LMS providers return demo data; `false` = live APIs |
| `EMAIL_PROVIDER` | `console` logs password-reset links to the server console |

In development, if `AI_PROVIDER=anthropic` but no key is present, the app falls back to the mock provider so every screen keeps working.

### 3. Database
```bash
# Option A — Docker
docker compose up -d db

# Option B — Prisma local Postgres (no Docker)
npx prisma dev --detach --name aihub     # prints a TCP URL; create a DB and set DATABASE_URL

npm run db:deploy      # apply migrations (or `npm run db:migrate` while developing schema changes)
npm run db:seed        # demo student, courses, tasks, grades, resources, study plan
```

### 4. Run
```bash
npm run dev            # http://localhost:3000
```

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next + TypeScript + React Compiler rules) |
| `npm test` | Vitest — unit tests (`tests/unit`) and integration tests (`tests/integration`, need `DATABASE_URL`; skipped when no DB) |
| `npm run test:e2e` | Playwright journey tests (`e2e/`) — starts the dev server automatically; first run `npx playwright install chromium` |
| `npm run db:migrate` / `db:deploy` / `db:reset` / `db:seed` / `db:studio` | Prisma workflows |

---

## Project structure

```
prisma/                 schema, migrations, seed
src/app/                routes (landing, (auth), onboarding, (app) shell, api/*)
src/components/         ui/ design system · layout/ · feature components (tasks, courses, chat, tutor, workspace, …)
src/lib/                env, db, auth (session/password/crypto/guards), api helpers, errors, rate-limit, logger, utils
src/server/             business logic by domain (tasks, courses, grades, calendar, planner, workspace, resources,
                        documents, rag, ai/{provider,chat,agent,intelligence,embeddings}, ingestion, integrations,
                        notifications, search, settings, admin, storage, email)
src/generated/prisma/   generated Prisma client (git-ignored)
tests/                  vitest unit + integration · e2e/ playwright
docs/                   architecture, database, integrations, AI system, security
```

---

## AI provider setup
1. Get an API key from the Anthropic Console.
2. Set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=...` in `.env`.
3. (Optional) choose `AI_MODEL` — `claude-opus-5` (default), `claude-sonnet-5`, …
4. Restart the server. The admin page shows provider health and usage.

Without a key, `AI_PROVIDER=mock` keeps tutoring, task analysis, planning and RAG fully exercisable with deterministic demo output (labelled as such in the UI).

## Storage setup
Uploads go to `STORAGE_LOCAL_DIR` (git-ignored) through the `StorageProvider` interface. To move to S3/GCS, implement the interface in `src/server/storage/` and register it in `storage/index.ts`; document records store only opaque keys.

## LMS integrations
Settings → Integrations lets a student connect Canvas/Moodle/Blackboard with a personal access token (never a password). With `LMS_MOCK_MODE=true` the providers return realistic demo courses, assignments, grades and announcements so the whole import flow can be tested. See [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) for live-mode details and how to add providers.

---

## Testing
```bash
npm run typecheck && npm run lint
npm test                       # unit tests + DB-backed integration tests when DATABASE_URL is reachable
npx playwright install chromium
npm run test:e2e               # signup → onboarding → dashboard → task → workspace → upload → AI
```

## Deployment

### Docker
```bash
cp .env.example .env   # set SESSION_SECRET, INTEGRATION_ENCRYPTION_KEY, AI keys
docker compose --profile prod up --build
```
The `app` image runs migrations on start (`scripts/docker-start.sh`), serves on port 3000, stores uploads in a named volume, and exposes `GET /api/health` for probes. Set `SEED_DEMO=true` to seed demo data on first boot.

### Any Node host
```bash
npm ci && npm run build
npm run db:deploy
npm start
```
Requirements: Node 20+, Postgres, the environment variables above, persistent disk (or a storage provider) for uploads. Put a TLS-terminating proxy in front; HSTS and CSP headers are already emitted by the app.

---

## Academic integrity
AI Hub explains concepts, gives hints, breaks assignments into steps, reviews the student's own drafts, generates practice problems and study plans, and summarizes permitted materials. It does not complete graded work and has no "submit assignment" capability. Assistance levels (Learning / Guided / Review) are user-configurable per conversation and workspace.

## License
Proprietary — all rights reserved (update as appropriate).
