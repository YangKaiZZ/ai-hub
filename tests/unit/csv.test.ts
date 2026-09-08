import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvTasks } from "@/server/ingestion/adapters/csv";

describe("parseCsv", () => {
  it("handles quoted fields, escaped quotes and CRLF", () => {
    const rows = parseCsv('a,b,c\r\n"x, y","He said ""hi""",3\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x, y", 'He said "hi"', "3"],
    ]);
  });
  it("skips blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvTasks", () => {
  it("normalizes rows into NormalizedTask records", () => {
    const csv = ["title,course,type,due,estimated_minutes,url", "Problem Set 5,Calculus,assignment,2026-03-14 08:00,90,https://lms.example/ps5", "Midterm,Calculus,Exam,2026-03-20,", ",Calculus,quiz,2026-03-01,30"].join("\n");
    const { tasks, skipped } = parseCsvTasks(csv);
    expect(tasks).toHaveLength(2);
    expect(skipped).toEqual([{ row: 4, reason: "Empty title" }]);
    const [ps, exam] = tasks;
    expect(ps!.source).toBe("CSV");
    expect(ps!.course?.name).toBe("Calculus");
    expect(ps!.type).toBe("ASSIGNMENT");
    expect(ps!.dueDate?.getFullYear()).toBe(2026);
    expect(ps!.url).toBe("https://lms.example/ps5");
    expect(exam!.type).toBe("EXAM");
  });

  it("is idempotent: same row → same externalId", () => {
    const csv = "title,course,due\nEssay,Writing,2026-04-01";
    const a = parseCsvTasks(csv).tasks[0]!;
    const b = parseCsvTasks(csv).tasks[0]!;
    expect(a.externalId).toBe(b.externalId);
  });

  it("reports a missing title column", () => {
    const { tasks, skipped } = parseCsvTasks("course,due\nMath,2026-01-01");
    expect(tasks).toHaveLength(0);
    expect(skipped[0]!.reason).toMatch(/title/i);
  });
});
