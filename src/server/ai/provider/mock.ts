import type { z } from "zod";
import type { AIProvider, AITool, AIUsage, BaseOptions, StreamEvent, StreamOptions, StructuredOptions } from "@/server/ai/provider/types";

/**
 * Deterministic offline provider. Used in tests and whenever no API key is
 * configured, so every AI feature stays exercisable end-to-end. Responses are
 * clearly labelled as demo output in the UI via provider name "mock".
 */
export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "mock-1";
  private delayMs: number;

  constructor(options: { delayMs?: number } = {}) {
    this.delayMs = options.delayMs ?? (process.env.NODE_ENV === "test" ? 0 : 12);
  }

  private usage(input: string, output: string): AIUsage {
    return { inputTokens: Math.ceil(input.length / 4), outputTokens: Math.ceil(output.length / 4), cacheReadTokens: 0 };
  }

  async complete(options: BaseOptions) {
    const raw = options.messages.at(-1)?.content ?? "";
    const last = options.feature === "document-summary" ? raw : studentMessage(raw);
    const text = options.feature === "document-summary" ? composeSummary(last) : composeTutorReply(last, options.system);
    return { text, usage: this.usage(options.system + last, text), model: this.model };
  }

  async structured<T>(options: StructuredOptions<T>) {
    const last = options.messages.at(-1)?.content ?? "";
    const data = mockStructured(options.schemaName, last, options.schema);
    return { data, usage: this.usage(options.system + last, JSON.stringify(data)), model: this.model };
  }

  async *stream(options: StreamOptions): AsyncGenerator<StreamEvent, void, void> {
    const last = studentMessage(options.messages.at(-1)?.content ?? "");
    const tools = options.tools ?? [];
    let text: string;

    const planTools = pickPlanningTools(tools, last);
    if (planTools.length > 0) {
      const gathered: Record<string, unknown> = {};
      for (const tool of planTools) {
        yield { type: "tool_call", name: tool.name, label: tool.label ?? `Running ${tool.name}`, input: {} };
        try {
          const defaults = defaultInput(tool);
          const out = await tool.execute(defaults);
          gathered[tool.name] = out;
          yield { type: "tool_result", name: tool.name, ok: true, summary: Array.isArray((out as { items?: unknown[] })?.items) ? `${(out as { items: unknown[] }).items.length} items` : "Done" };
        } catch (err) {
          yield { type: "tool_result", name: tool.name, ok: false, summary: err instanceof Error ? err.message : "failed" };
        }
      }
      text = composePlanFromTools(gathered, last);
    } else {
      text = composeTutorReply(last, options.system);
    }

    for (const chunk of chunkText(text)) {
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      yield { type: "text", text: chunk };
    }
    yield { type: "done", usage: this.usage(options.system + last, text), model: this.model, stopReason: "end_turn" };
  }

  async healthcheck() {
    return { ok: true, detail: "mock provider" };
  }
}

/** The real request wraps context in tags; the mock should react to the student's own words only. */
function studentMessage(content: string): string {
  return content
    .replace(/<student_context>[\s\S]*?<\/student_context>/g, "")
    .replace(/<sources>[\s\S]*?<\/sources>/g, "")
    .trim();
}

function chunkText(text: string): string[] {
  const words = text.split(/(\s+)/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 3) chunks.push(words.slice(i, i + 3).join(""));
  return chunks;
}

function defaultInput(tool: AITool): unknown {
  // Best-effort: parse an empty object; fall back to a permissive shape.
  const result = tool.inputSchema.safeParse({});
  if (result.success) return result.data;
  const loose = tool.inputSchema.safeParse({ limit: 10, days: 7, query: "" });
  return loose.success ? loose.data : {};
}

function pickPlanningTools(tools: AITool[], prompt: string): AITool[] {
  const p = prompt.toLowerCase();
  const wantsPlan = /study|plan|tonight|today|week|schedule|what should i|prioriti|due|deadline/.test(p);
  if (!wantsPlan) return [];
  const names = ["get_upcoming_deadlines", "get_tasks", "get_student_preferences"];
  return names.map((n) => tools.find((t) => t.name === n)).filter((t): t is AITool => Boolean(t));
}

interface TaskLike {
  title?: string;
  course?: string | null;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  priority?: string;
  progress?: number;
}

function composePlanFromTools(gathered: Record<string, unknown>, prompt: string): string {
  const deadlines = ((gathered.get_upcoming_deadlines as { items?: TaskLike[] })?.items ?? (gathered.get_tasks as { items?: TaskLike[] })?.items ?? []).slice(0, 4);
  const prefs = (gathered.get_student_preferences as { studyPreferences?: { preferredStartHour?: number; sessionMinutes?: number } })?.studyPreferences;
  const start = prefs?.preferredStartHour ?? 18;
  const session = prefs?.sessionMinutes ?? 45;

  if (deadlines.length === 0) {
    return "You have no open deadlines right now, so tonight is a good time to review this week's material or get ahead on reading. Want me to suggest a light 45-minute review block?";
  }

  const lines: string[] = [];
  lines.push(`**Tonight's plan** _(based on ${deadlines.length} upcoming task${deadlines.length === 1 ? "" : "s"})_\n`);
  let minutes = start * 60;
  const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(1, "0")}:${String(m % 60).padStart(2, "0")}`;
  deadlines.forEach((t, i) => {
    const length = Math.min(session + (t.priority === "CRITICAL" || t.priority === "HIGH" ? 30 : 0), 90);
    lines.push(`- **${fmt(minutes)}–${fmt(minutes + length)}** · ${t.course ? `${t.course}: ` : ""}${t.title ?? "Task"}${t.dueDate ? ` (due ${new Date(t.dueDate).toLocaleDateString()})` : ""}`);
    minutes += length;
    if (i < deadlines.length - 1) {
      lines.push(`- **${fmt(minutes)}–${fmt(minutes + 10)}** · Break`);
      minutes += 10;
    }
  });
  lines.push(`- **${fmt(minutes)}–${fmt(minutes + 15)}** · Review tomorrow's tasks`);
  lines.push("");
  lines.push(`I put **${deadlines[0]?.title ?? "your top task"}** first because it has the nearest deadline and the highest priority. ${/tonight|today/.test(prompt.toLowerCase()) ? "If you only have time for one block, do that one." : "Tell me your available hours and I can spread this across the week."}`);
  lines.push("\n_Demo response — connect an AI provider for personalized plans._");
  return lines.join("\n");
}

function composeSummary(input: string): string {
  const body = input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const sentences = body.split(/(?<=[.!?])\s+/).filter((s) => s.length > 30).slice(0, 3);
  if (sentences.length === 0) return "This document was uploaded and indexed. Open it to review the content, or ask the AI Tutor questions about it.";
  return `${sentences.join(" ").slice(0, 480)} — Useful as a reference when working on related tasks. (Demo summary.)`;
}

function composeTutorReply(prompt: string, system: string): string {
  const p = prompt.trim();
  const mode = /LEARNING/.test(system) ? "learning" : /REVIEW/.test(system) ? "review" : "guided";
  const topic = p.length > 0 ? p.replace(/\s+/g, " ").slice(0, 140) : "this topic";

  if (/rubric/i.test(p)) {
    return `Let's read the rubric together. The highest-weighted criteria are where your effort pays off most, so:\n\n1. **Identify the top two criteria** by points.\n2. For each, write one sentence describing what "full marks" would look like.\n3. Check your current draft against those sentences.\n\nWhich criterion feels least clear to you right now?\n\n_Demo response — connect an AI provider for full tutoring._`;
  }
  if (/step|break (this|it) (down|into)|where (do|should) i start|first/i.test(p)) {
    return `Here's a way to break this into steps:\n\n1. **Understand the deliverable** — restate the task in one sentence.\n2. **Collect inputs** — notes, readings, the rubric.\n3. **Outline** — headings or components before any detail.\n4. **Draft the hardest part first** while you're fresh.\n5. **Review against the rubric** and fix gaps.\n\nStart with step 1: how would you describe the deliverable in your own words?\n\n_Demo response — connect an AI provider for full tutoring._`;
  }
  if (/check|review|feedback|look at my/i.test(p) || mode === "review") {
    return `Happy to review. Here's how I'd assess it:\n\n- **Strengths:** you've clearly stated the goal and your structure is easy to follow.\n- **Gaps:** one claim needs supporting evidence, and the conclusion restates rather than synthesizes.\n- **Next step:** add one concrete example under your second point, then tighten the conclusion to two sentences.\n\nPaste the section you're least sure about and I'll go deeper.\n\n_Demo response — connect an AI provider for full tutoring._`;
  }
  if (/practice|quiz me|questions/i.test(p)) {
    return `Here are three practice questions, easiest first:\n\n1. Define the core concept in one sentence.\n2. Apply it to a simple example and explain each step.\n3. Find the mistake in a flawed solution and correct it.\n\nAnswer #1 and I'll give feedback before we move on.\n\n_Demo response — connect an AI provider for full tutoring._`;
  }
  if (mode === "learning") {
    return `Good question. Before I explain, let's find what you already know about **${topic}**.\n\n- What do you think the key idea is?\n- Where exactly does it stop making sense?\n\nOnce you answer, I'll give a hint that targets that step rather than the whole answer.\n\n_Demo response — connect an AI provider for full tutoring._`;
  }
  return `Let's work through **${topic}**.\n\n**The core idea:** break the problem into the definition, the rule that applies, and the step where the rule is used.\n\n**A simpler example:** take the smallest version of the same problem and solve it fully, then scale up.\n\n**Your turn:** try the first step and tell me what you get — I'll check it and guide the next one.\n\n_Demo response — connect an AI provider for full tutoring._`;
}

function mockStructured<T>(schemaName: string, prompt: string, schema: z.ZodType<T>): T {
  if (schemaName === "task_analysis") {
    const lower = prompt.toLowerCase();
    const type = /exam|midterm|final/.test(lower) ? "EXAM" : /quiz/.test(lower) ? "QUIZ" : /project/.test(lower) ? "PROJECT" : /read|chapter/.test(lower) ? "READING" : /lab/.test(lower) ? "LAB" : "ASSIGNMENT";
    const words = prompt.split(/\s+/).length;
    const estimated = type === "EXAM" ? 300 : type === "PROJECT" ? 240 : type === "READING" ? 45 : Math.min(240, 60 + Math.round(words / 8) * 15);
    const candidate = {
      taskType: type,
      difficulty: type === "EXAM" || type === "PROJECT" ? "hard" : "medium",
      estimatedMinutes: estimated,
      importance: type === "EXAM" ? 5 : type === "PROJECT" ? 4 : 3,
      summary: `This ${type.toLowerCase()} asks you to produce a complete deliverable that meets each stated requirement. Focus first on understanding what is being asked, then on the parts that carry the most weight.`,
      requiredMaterials: ["Course notes", "Assignment brief", ...(/data|sql|erd|schema/.test(lower) ? ["Sample dataset / schema"] : []), ...(/code|program|c\+\+|java|python/.test(lower) ? ["Development environment"] : [])],
      rubricRequirements: /rubric|criteria|points/.test(lower) ? ["Meet every listed criterion", "Show your reasoning clearly", "Follow submission format"] : ["Address every part of the brief", "Show reasoning and cite sources where relevant"],
      importantDates: [],
      recommendedSteps: ["Re-read the brief and list the deliverables", "Gather notes and references", "Outline the structure", "Draft the hardest section first", "Review against requirements and polish"],
      keyConcepts: /erd|database|normal/.test(lower) ? ["Entities & relationships", "Normalization"] : /deriv|calculus|integral/.test(lower) ? ["Chain rule", "Derivative rules"] : /class|object|inherit/.test(lower) ? ["Inheritance", "Encapsulation"] : ["Core concepts from this unit"],
      risks: [`Starting late for a task estimated at ${estimated} minutes`],
    };
    return schema.parse(candidate);
  }
  if (schemaName === "study_plan") {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const day2 = new Date(today.getTime() + 864e5);
    const candidate = {
      title: "Demo study plan",
      rationale: "Sessions are placed in the evening study window with breaks between blocks, prioritizing the nearest deadlines. This is a demo plan; connect an AI provider for a personalized one.",
      sessions: [
        { date: iso(today), startTime: "18:00", endTime: "18:45", type: "ASSIGNMENT_WORK", title: "Work on top-priority task", taskId: null, courseId: null, note: null },
        { date: iso(today), startTime: "18:45", endTime: "19:00", type: "BREAK", title: "Break", taskId: null, courseId: null, note: null },
        { date: iso(today), startTime: "19:00", endTime: "19:45", type: "REVIEW", title: "Review this week's notes", taskId: null, courseId: null, note: null },
        { date: iso(day2), startTime: "18:00", endTime: "19:00", type: "PRACTICE", title: "Practice problems", taskId: null, courseId: null, note: null },
      ],
    };
    return schema.parse(candidate);
  }
  const attempt = schema.safeParse({});
  if (attempt.success) return attempt.data;
  throw new Error(`MockProvider has no fixture for schema "${schemaName}"`);
}
