# AI Hub — Integrations

AI Hub is not tied to one institution or LMS. Two abstractions keep it that way:

1. **`LmsProvider`** (`src/server/integrations/types.ts`) — how we talk to a learning platform.
2. **`TaskIngestionEngine`** (`src/server/ingestion/engine.ts`) — how normalized data becomes courses, tasks, grades and announcements for a student, regardless of where it came from.

```
Canvas ─┐
Moodle ─┤ LmsProvider.sync*() ─► Normalized{Course,Task,Grade,Announcement} ─► TaskIngestionEngine ─► DB
Blackboard ┤                                     ▲
Generic ─┘                                       │
CSV adapter ─────────────────────────────────────┤
(calendar / email / API / extension adapters) ───┘
```

## LmsProvider interface

```ts
interface LmsProvider {
  name: "CANVAS" | "MOODLE" | "BLACKBOARD" | "GENERIC";
  label: string; connectionHelp: string; supportsOAuth: boolean;
  connect(input: { baseUrl; accessToken?; authorizationCode? }): Promise<ConnectResult>;
  authenticate(creds): Promise<ProviderCredentials>;   // refresh tokens if needed
  disconnect(creds): Promise<void>;
  syncCourses(creds): Promise<NormalizedCourse[]>;
  syncTasks(creds, { since }): Promise<NormalizedTask[]>;
  syncAnnouncements(creds, { since }): Promise<NormalizedAnnouncement[]>;
  syncGrades(creds, { since }): Promise<NormalizedGrade[]>;
}
```

`NormalizedTask` is the canonical shape:

```ts
{ externalId, source, institution?, course?: { externalId?, name, code? }, title, description?, instructions?,
  rubric?, type?, dueDate?, startDate?, attachments?, url?, instructor?, pointsPossible?, rawData? }
```

## Providers

| Provider | Live implementation | Mock mode | Notes |
|---|---|---|---|
| `CanvasProvider` | REST `/api/v1` with a student **personal access token**: `users/self`, `courses`, `courses/:id/assignments`, `announcements`, `students/submissions` | ✔ | Read-only scopes. HTML descriptions are converted to text; rubrics mapped. |
| `MoodleProvider` | Web Services REST (`core_webservice_get_site_info`, `core_enrol_get_users_courses`, `mod_assign_get_assignments`) with a WS token | ✔ | Grades/announcements return empty until implemented. |
| `BlackboardProvider` | Requires an institution-registered OAuth app; interface is OAuth-ready | ✔ | Ships mock-only; implement `real*` methods with app key/secret. |
| `GenericProvider` | Reserved for a documented JSON feed | ✔ | Lets schools integrate without a bespoke provider. |

All providers extend `BaseLmsProvider`, which implements mock mode using `mock-data.ts` (deterministic externalIds, deadlines relative to today). Set **`LMS_MOCK_MODE=false`** to use live calls.

### Adding a provider
1. Create `src/server/integrations/providers/<name>.ts` extending `BaseLmsProvider`; override `realConnect`, `realSyncCourses`, `realSyncTasks` (and optionally grades/announcements).
2. Add the enum value to `IntegrationProvider` in `schema.prisma` + a migration.
3. Register it in `registry.ts`.
4. The UI (Settings → Integrations, onboarding) picks it up from `listLmsProviders()`.

## Credentials & security
- `connectIntegration()` validates credentials via the provider, then stores tokens with AES-256-GCM (`INTEGRATION_ENCRYPTION_KEY`). Tokens are decrypted only inside `syncIntegration()`.
- **Raw LMS passwords are never accepted.** Students use personal access tokens or OAuth. The UI explains how to obtain a token per provider (`connectionHelp`).
- Disconnecting wipes the stored tokens; deleting removes the integration (imported tasks remain).
- AI Hub never bypasses authentication or access controls of the LMS; it uses documented, read-only APIs.

## Sync lifecycle
`POST /api/integrations/:id { action: "sync" }` → `syncIntegration()`:
1. `SyncLog` row (RUNNING)
2. `authenticate()` (token refresh hook)
3. Fetch courses, tasks, announcements, grades (announcements/grades failures are non-fatal)
4. `TaskIngestionEngine.ingest()` — upserts by `(userId, source, externalId)`, preserves student edits, runs Task Intelligence on new tasks, notifies
5. `SyncLog` → SUCCESS / PARTIAL / FAILED, `Integration.lastSyncedAt` / `lastError`

Rate limit: 6 syncs per 10 minutes per user. Scheduling automatic syncs is a matter of calling `syncIntegration` from a cron/worker — no API changes required.

## Other ingestion sources
- **CSV** — `src/server/ingestion/adapters/csv.ts` + `POST /api/tasks/import` (Settings → Integrations → Import from CSV). Columns: `title, course, code, type, due, description, estimated_minutes, url, instructor`. Stable `externalId` = hash of course+title+due, so re-importing updates instead of duplicating.
- **Manual** — the task form; `source = MANUAL`.
- **Planned adapters** (same `NormalizedTask` contract): calendar (ICS), email-like import, public API (`source = API`), browser extension (`source = EXTENSION`). The `DataSource` enum already includes them.

## Institutions
`Institution` rows carry `gradingConfig`, `termConfig`, `timezone` and `defaultLms`. A seed list is provided (`SEED_INSTITUTIONS`); students can add unlisted schools during onboarding (`isUserCreated`, unverified), and admins can verify them. Grade labels (`gradeLabel()`) use the institution's bands when present, so a 1.00–5.00 scale and an A–F scale coexist.
