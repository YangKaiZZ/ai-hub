import { createHash } from "node:crypto";
import type { NormalizedTask } from "@/server/ingestion/types";

/**
 * CSV import adapter. Accepts a header row with any of:
 *   title, course, code, type, due | due_date | deadline, description, estimated_minutes, url, instructor
 * Dates are parsed with `new Date()`; unparseable dates leave the task without a deadline.
 */
export interface CsvParseResult {
  tasks: NormalizedTask[];
  skipped: { row: number; reason: string }[];
}

export function parseCsvTasks(csv: string): CsvParseResult {
  const rows = parseCsv(csv);
  if (rows.length < 2) return { tasks: [], skipped: [{ row: 0, reason: "No data rows" }] };
  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const col = {
    title: idx(["title", "task", "assignment", "name"]),
    course: idx(["course", "course_name", "class", "subject"]),
    code: idx(["code", "course_code"]),
    type: idx(["type", "category", "kind"]),
    due: idx(["due", "due_date", "deadline", "due_at"]),
    description: idx(["description", "details", "notes"]),
    est: idx(["estimated_minutes", "estimate", "minutes", "est_minutes"]),
    url: idx(["url", "link"]),
    instructor: idx(["instructor", "teacher", "professor"]),
  };
  if (col.title < 0) return { tasks: [], skipped: [{ row: 1, reason: "Missing a title column" }] };

  const tasks: NormalizedTask[] = [];
  const skipped: { row: number; reason: string }[] = [];
  rows.slice(1).forEach((r, i) => {
    const get = (c: number) => (c >= 0 ? (r[c] ?? "").trim() : "");
    const title = get(col.title);
    if (!title) {
      if (r.some((v) => v.trim())) skipped.push({ row: i + 2, reason: "Empty title" });
      return;
    }
    const due = get(col.due);
    const dueDate = due ? new Date(due) : null;
    const courseName = get(col.course);
    const est = Number.parseInt(get(col.est), 10);
    const rawType = get(col.type).toUpperCase().replace(/\s+/g, "_");
    const type = (["ASSIGNMENT", "PROJECT", "QUIZ", "EXAM", "READING", "LAB", "DISCUSSION", "PRESENTATION"].includes(rawType) ? rawType : rawType.includes("EXAM") || rawType.includes("TEST") ? "EXAM" : rawType.includes("QUIZ") ? "QUIZ" : rawType.includes("PROJECT") ? "PROJECT" : rawType.includes("READ") ? "READING" : "ASSIGNMENT") as NormalizedTask["type"];
    const externalId = createHash("sha1").update(`${courseName}|${title}|${due}`).digest("hex").slice(0, 24);
    tasks.push({
      externalId,
      source: "CSV",
      course: courseName ? { name: courseName, code: get(col.code) || null } : null,
      title,
      description: get(col.description) || null,
      type,
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      url: get(col.url) || null,
      instructor: get(col.instructor) || null,
      rawData: Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])),
      ...(Number.isFinite(est) && est > 0 ? { estimatedMinutes: est } : {}),
    } as NormalizedTask & { estimatedMinutes?: number });
  });
  return { tasks, skipped };
}

/** RFC-4180-ish parser: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}
