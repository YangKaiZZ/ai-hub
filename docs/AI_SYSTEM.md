# AI Hub — AI System

## Principles
- **Tutor, not a shortcut.** Every prompt carries the integrity clause: explain, hint, guide, review, practice — never produce a submission-ready answer to graded work, never claim to submit anything. Three assistance modes (Learning / Guided / Review) tune how much is revealed.
- **Provider-agnostic.** Business logic talks to the `AIProvider` interface; the Anthropic, DeepSeek and offline mock implementations are interchangeable (`AI_PROVIDER=anthropic|deepseek|mock`).
- **Context is data.** Student context, retrieved documents and tool results are wrapped in tags and the model is told to treat them as data (prompt-injection defence).
- **Streaming first.** Chat responses stream over SSE with tool-activity and source events so the UI feels immediate.
- **Observable.** Every call logs tokens, latency and success per feature to `AIUsageLog` (admin dashboard).

## Provider abstraction — `src/server/ai/provider`

```ts
interface AIProvider {
  complete(opts): Promise<{ text, usage, model }>;                 // one-shot text
  structured<T>(opts & { schema: ZodType<T> }): Promise<{ data: T }>; // validated JSON
  stream(opts & { tools?: AITool[] }): AsyncGenerator<StreamEvent>;   // text + tool loop
  healthcheck(): Promise<{ ok, detail? }>;
}
```

### AnthropicProvider (`anthropic.ts`)
- `@anthropic-ai/sdk` with `claude-opus-5` by default (`AI_MODEL`). Adaptive thinking is on by default for this model; `output_config.effort` maps our `low|medium|high`.
- System prompts are sent as a cached text block (`cache_control: ephemeral`) — prompts are stable, per-request context goes into messages.
- `structured()` uses `client.messages.parse()` with `zodOutputFormat(schema)`.
- `stream()` runs a manual agentic loop: streams text deltas, executes `tool_use` blocks against our `AITool`s (Zod-validated input), returns results (errors as `is_error`), handles `pause_turn`, caps tool rounds.
- Errors map to `AIUnavailableError` / `RateLimitError`; refusal stop reasons become a friendly message.

### DeepSeekProvider (`deepseek.ts`)
- The official `openai` client pointed at `DEEPSEEK_BASE_URL`, since DeepSeek implements the OpenAI chat-completions protocol. Default model `deepseek-chat` (`DEEPSEEK_MODEL`).
- No cache directive to send: DeepSeek caches identical prefixes itself and reports hits as `prompt_cache_hit_tokens`, which we surface as `cacheReadTokens`.
- No strict JSON-schema mode, so `structured()` asks for `json_object`, passes the JSON Schema in the system prompt, validates with Zod, and gets exactly one repair attempt before raising `AIUnavailableError`.
- `stream()` runs the same agentic loop as the Anthropic path. Tool-call arguments arrive split across chunks and keyed by index, so they are reassembled before parsing. Tool results go back as `role: "tool"` messages.
- `deepseek-reasoner` cannot call tools; the provider omits tool definitions on that model rather than failing the request.
- `effort` has no equivalent and is accepted and ignored.

### MockProvider (`mock.ts`)
Deterministic, dependency-free. Used automatically when no API key is set in development and always in tests. It returns schema-valid task analyses and study plans, streams tutoring-style replies, and exercises planning tools (`get_upcoming_deadlines`, `get_tasks`, `get_student_preferences`) to build a plan — so every AI feature is demoable offline. UI labels mock output as demo.

## Prompts — `src/server/ai/prompts.ts`
`TUTOR_SYSTEM`, `WORKSPACE_SYSTEM`, `AGENT_SYSTEM`, `TASK_ANALYSIS_SYSTEM`, `STUDY_PLAN_SYSTEM`, `SUMMARIZE_DOCUMENT_SYSTEM`, `ASSISTANCE_MODES`, `INTEGRITY_CLAUSE`. Keep them stable (cache), put volatile data in messages.

## Chat & context — `src/server/ai/chat/service.ts`
- **Conversations** (`AIConversation` + `AIMessage`) for the Tutor (kind `TUTOR`) and the Study Agent (kind `AGENT`); **workspace chats** use `WorkspaceMessage`.
- `buildContext()` assembles `<student_context>` (student, course, assignment, and for workspaces the student's draft/notes/checklist) plus `<sources>` retrieved from the user's documents (pinned docs → task attachments → course docs).
- `streamConversationTurn()` / `streamWorkspaceTurn()` persist the user message, stream `meta → text/tool_call/tool_result → done → saved` events, then persist the assistant message with sources, tool calls and token counts.
- Endpoint: `POST /api/ai/chat` (SSE). Client: `useChatStream()`.

## Agent tools — `src/server/ai/agent/tools.ts`
Bound to the caller's `userId`; inputs validated with Zod.

| Tool | Purpose | Writes? |
|---|---|---|
| `get_tasks`, `get_upcoming_deadlines`, `get_course`, `get_grades`, `get_calendar`, `get_student_preferences` | Read the student's real data | no |
| `search_resources`, `search_workspace_files` | Hybrid retrieval over documents/notes | no |
| `calculate_grade` | What-if / needed-average grade math | no |
| `create_task`, `update_task` | Only when the student asks | yes (AGENT only) |
| `create_study_plan` | Saves a **proposal** the student confirms in the planner | yes (AGENT only) |
| `analyze_assignment` | Runs Task Intelligence on a task | yes (AGENT only) |

The Tutor gets read-only tools; the Agent gets all of them. Nothing can submit coursework.

## Task Intelligence — `src/server/ai/intelligence`
`analyzeTask()` → structured `TaskAnalysis` (type, difficulty, estimated minutes, importance, summary, materials, rubric requirements, dates, steps, concepts, risks). Stored in `Task.aiAnalysis`; fills in estimate/importance when the student left them blank; re-scores priority. Runs automatically for imported tasks and on demand from the task page.

## Study planner — `src/server/planner/service.ts`
Structured `StudyPlanOutput` from the model, sanitized (in range, no overlaps with commitments, ≤ 4h sessions), with a deterministic greedy fallback. Plans stay `PROPOSED` until confirmed; confirmation writes `CalendarEvent`s.

## Documents & RAG
- Pipeline: `uploadDocument()` → `processDocument()` (extract → chunk → embed → index → summarize).
- Extraction: `pdf-parse` (PDF, page-aware), `mammoth` (DOCX), zip+XML (PPTX), UTF-8 text; images are stored without text (OCR is a future provider).
- Chunking: paragraph-aware ~2.8k chars with overlap and page attribution.
- Embeddings: `EmbeddingProvider` — default `LocalHashEmbeddingProvider` (feature-hashed n-grams, 384 dims, offline). Swap in a hosted model by implementing the interface.
- Retrieval: Postgres FTS (`websearch_to_tsquery` over a generated tsvector) → cosine re-rank → top-k, scoped to the user and optionally documents/course. `SourceRef`s power clickable citations ("Week 4 lecture notes, p. 3").
- Semantic search UI: Resources → "AI search" (`GET /api/resources/search`).

## Recommendations
`src/server/recommendations/service.ts` produces deterministic, explainable dashboard recommendations from the student's data (top priority, deadline clusters, overdue, untouched tasks, nearly-done nudges). No model call required; the agent builds richer plans on the same signals.

## Notifications
`notify()` respects per-type preferences (`UserPreference.notificationSettings`). Deadline/overdue notifications are generated idempotently on dashboard load (`generateDeadlineNotifications`). Email delivery is provider-based (`console` in dev).

## Configuration
```
AI_PROVIDER=anthropic|deepseek|mock   ANTHROPIC_API_KEY=...   AI_MODEL=claude-opus-5   AI_FAST_MODEL=claude-haiku-4-5
DEEPSEEK_API_KEY=...   DEEPSEEK_MODEL=deepseek-chat   DEEPSEEK_BASE_URL=https://api.deepseek.com
EMBEDDING_PROVIDER=local
```
Rate limits: 40 AI requests / minute / user (`RATE_LIMITS.ai`).

## Extending
- New provider (e.g. Bedrock, Vertex): implement `AIProvider`, register in `provider/index.ts`. `deepseek.ts` is the worked example of a non-Anthropic one, including how to cope without schema-enforced output.
- New tool: add to `buildAgentTools()` with a Zod schema; decide whether it is read-only.
- New structured task: add a schema in `intelligence/schemas.ts`, a prompt, and a fixture in `MockProvider.structured()` so offline mode keeps working.
