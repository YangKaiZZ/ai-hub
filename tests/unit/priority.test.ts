import { describe, expect, it } from "vitest";
import { addDays, addHours, subDays } from "date-fns";
import {
  DEFAULT_PRIORITY_RULES,
  calculatePriority,
  comparePriority,
  deadlineUrgency,
  importanceScore,
  resolveRules,
  scoreToPriority,
  workloadPressure,
} from "@/server/tasks/priority";

const now = new Date("2026-03-03T12:00:00Z");

describe("deadlineUrgency", () => {
  it("is maximal for overdue tasks", () => {
    expect(deadlineUrgency(subDays(now, 1), now)).toBe(100);
  });
  it("decreases as the deadline moves further away", () => {
    const d1 = deadlineUrgency(addHours(now, 12), now);
    const d3 = deadlineUrgency(addDays(now, 3), now);
    const d10 = deadlineUrgency(addDays(now, 10), now);
    const d40 = deadlineUrgency(addDays(now, 40), now);
    expect(d1).toBeGreaterThan(d3);
    expect(d3).toBeGreaterThan(d10);
    expect(d10).toBeGreaterThan(d40);
  });
  it("uses a low baseline when there is no deadline", () => {
    expect(deadlineUrgency(null, now)).toBe(20);
  });
});

describe("workloadPressure", () => {
  it("accounts for progress already made", () => {
    expect(workloadPressure(240, 0)).toBeGreaterThan(workloadPressure(240, 75));
  });
  it("returns a neutral value when no estimate exists", () => {
    expect(workloadPressure(null, 0)).toBe(40);
  });
});

describe("importanceScore", () => {
  it("maps 1..5 onto 0..100", () => {
    expect(importanceScore(1)).toBe(0);
    expect(importanceScore(3)).toBe(50);
    expect(importanceScore(5)).toBe(100);
  });
  it("clamps out-of-range values", () => {
    expect(importanceScore(9)).toBe(100);
    expect(importanceScore(-2)).toBe(0);
  });
});

describe("calculatePriority", () => {
  it("marks a large, important task due tomorrow as critical", () => {
    const r = calculatePriority({ dueDate: addHours(now, 20), estimatedMinutes: 180, importance: 5, progress: 10, status: "IN_PROGRESS", now });
    expect(r.priority).toBe("CRITICAL");
    expect(r.reasons).toContain("Due within 24 hours");
  });

  it("marks a small task due in a month as low", () => {
    const r = calculatePriority({ dueDate: addDays(now, 30), estimatedMinutes: 30, importance: 2, progress: 0, status: "NOT_STARTED", now });
    expect(r.priority).toBe("LOW");
  });

  it("boosts overdue tasks and explains why", () => {
    const base = calculatePriority({ dueDate: addHours(now, 2), estimatedMinutes: 60, importance: 3, progress: 0, status: "NOT_STARTED", now });
    const overdue = calculatePriority({ dueDate: subDays(now, 1), estimatedMinutes: 60, importance: 3, progress: 0, status: "NOT_STARTED", now });
    expect(overdue.score).toBeGreaterThan(base.score);
    expect(overdue.reasons).toContain("Overdue");
  });

  it("returns zero for completed tasks", () => {
    const r = calculatePriority({ dueDate: subDays(now, 1), estimatedMinutes: 600, importance: 5, progress: 100, status: "COMPLETED", now });
    expect(r.score).toBe(0);
    expect(r.priority).toBe("LOW");
  });

  it("respects user-configured weights", () => {
    const input = { dueDate: addDays(now, 20), estimatedMinutes: 30, importance: 5, progress: 0, status: "NOT_STARTED" as const, now };
    const balanced = calculatePriority(input);
    const importanceHeavy = calculatePriority(input, { deadlineWeight: 0.1, workloadWeight: 0.1, importanceWeight: 0.8 });
    expect(importanceHeavy.score).toBeGreaterThan(balanced.score);
  });

  it("always yields a score within 0..100", () => {
    const r = calculatePriority({ dueDate: subDays(now, 30), estimatedMinutes: 100000, importance: 5, progress: 0, status: "NOT_STARTED", now });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreToPriority / resolveRules", () => {
  it("uses default thresholds", () => {
    expect(scoreToPriority(85)).toBe("CRITICAL");
    expect(scoreToPriority(65)).toBe("HIGH");
    expect(scoreToPriority(40)).toBe("MEDIUM");
    expect(scoreToPriority(10)).toBe("LOW");
  });
  it("merges partial overrides with defaults", () => {
    const rules = resolveRules({ thresholds: { critical: 90, high: 70, medium: 50 } });
    expect(rules.deadlineWeight).toBe(DEFAULT_PRIORITY_RULES.deadlineWeight);
    expect(scoreToPriority(85, rules)).toBe("HIGH");
  });
});

describe("comparePriority", () => {
  it("sorts by score, then by nearest deadline", () => {
    const a = { priorityScore: 70, dueDate: addDays(now, 5) };
    const b = { priorityScore: 70, dueDate: addDays(now, 1) };
    const c = { priorityScore: 90, dueDate: null };
    const sorted = [a, b, c].sort(comparePriority);
    expect(sorted[0]).toBe(c);
    expect(sorted[1]).toBe(b);
    expect(sorted[2]).toBe(a);
  });
});
