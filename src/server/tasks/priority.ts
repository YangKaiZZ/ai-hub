import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

/**
 * Priority engine — a pure function so it is trivially unit-testable.
 *
 * Score (0-100) is a weighted blend of:
 *  - deadline proximity (closer = higher)
 *  - workload (larger = higher, scaled by how much is left)
 *  - importance (1-5, user/AI set)
 *  - overdue boost
 * Users can tune the weights via UserPreference.priorityRules.
 */
export interface PriorityRules {
  deadlineWeight: number;
  workloadWeight: number;
  importanceWeight: number;
  overdueBoost: number;
  /** Score thresholds for mapping to labels. */
  thresholds: { critical: number; high: number; medium: number };
}

export const DEFAULT_PRIORITY_RULES: PriorityRules = {
  deadlineWeight: 0.55,
  workloadWeight: 0.2,
  importanceWeight: 0.25,
  overdueBoost: 15,
  thresholds: { critical: 80, high: 60, medium: 35 },
};

export interface PriorityInput {
  dueDate: Date | null | undefined;
  estimatedMinutes: number | null | undefined;
  importance: number; // 1-5
  progress: number; // 0-100
  status: TaskStatus;
  now?: Date;
}

export interface PriorityResult {
  score: number;
  priority: TaskPriority;
  /** Human-readable reasons, surfaced in the UI ("Due in 1 day", "Large workload"). */
  reasons: string[];
}

export function resolveRules(overrides?: Partial<PriorityRules> | null): PriorityRules {
  if (!overrides) return DEFAULT_PRIORITY_RULES;
  return {
    ...DEFAULT_PRIORITY_RULES,
    ...overrides,
    thresholds: { ...DEFAULT_PRIORITY_RULES.thresholds, ...(overrides.thresholds ?? {}) },
  };
}

/** 0-100: how urgent the deadline is. */
export function deadlineUrgency(dueDate: Date | null | undefined, now: Date): number {
  if (!dueDate) return 20; // no deadline → low baseline urgency
  const hours = (dueDate.getTime() - now.getTime()) / 36e5;
  if (hours <= 0) return 100;
  if (hours <= 24) return 95;
  if (hours <= 48) return 85;
  if (hours <= 72) return 75;
  if (hours <= 24 * 7) return 60 - ((hours - 72) / (24 * 4)) * 20; // 60 → 40 over days 3-7
  if (hours <= 24 * 14) return 40 - ((hours - 24 * 7) / (24 * 7)) * 20; // 40 → 20 over week 2
  if (hours <= 24 * 30) return 20 - ((hours - 24 * 14) / (24 * 16)) * 12; // 20 → 8
  return 5;
}

/** 0-100: how heavy the remaining workload is. */
export function workloadPressure(estimatedMinutes: number | null | undefined, progress: number): number {
  if (!estimatedMinutes || estimatedMinutes <= 0) return 40;
  const remaining = estimatedMinutes * (1 - Math.min(100, Math.max(0, progress)) / 100);
  if (remaining <= 30) return 15;
  if (remaining <= 60) return 30;
  if (remaining <= 120) return 50;
  if (remaining <= 240) return 70;
  if (remaining <= 480) return 85;
  return 100;
}

export function importanceScore(importance: number): number {
  const i = Math.min(5, Math.max(1, Math.round(importance)));
  return ((i - 1) / 4) * 100;
}

export function scoreToPriority(score: number, rules: PriorityRules = DEFAULT_PRIORITY_RULES): TaskPriority {
  if (score >= rules.thresholds.critical) return "CRITICAL";
  if (score >= rules.thresholds.high) return "HIGH";
  if (score >= rules.thresholds.medium) return "MEDIUM";
  return "LOW";
}

export function calculatePriority(input: PriorityInput, rulesOverride?: Partial<PriorityRules> | null): PriorityResult {
  const rules = resolveRules(rulesOverride);
  const now = input.now ?? new Date();

  if (input.status === "COMPLETED" || input.status === "ARCHIVED") {
    return { score: 0, priority: "LOW", reasons: ["Completed"] };
  }

  const urgency = deadlineUrgency(input.dueDate, now);
  const workload = workloadPressure(input.estimatedMinutes, input.progress);
  const importance = importanceScore(input.importance);

  let score = urgency * rules.deadlineWeight + workload * rules.workloadWeight + importance * rules.importanceWeight;

  const reasons: string[] = [];
  const overdue = Boolean(input.dueDate && input.dueDate.getTime() < now.getTime());
  if (overdue) {
    score += rules.overdueBoost;
    reasons.push("Overdue");
  } else if (input.dueDate) {
    const hours = (input.dueDate.getTime() - now.getTime()) / 36e5;
    if (hours <= 24) reasons.push("Due within 24 hours");
    else if (hours <= 72) reasons.push(`Due in ${Math.ceil(hours / 24)} days`);
  }
  if (workload >= 70) reasons.push("Large workload remaining");
  if (input.importance >= 4) reasons.push("Marked important");
  if (input.progress === 0 && urgency >= 60) reasons.push("Not started yet");

  score = Math.round(Math.min(100, Math.max(0, score)));
  return { score, priority: scoreToPriority(score, rules), reasons };
}

/** Sort comparator: highest priority first, then nearest deadline. */
export function comparePriority<T extends { priorityScore: number; dueDate: Date | null }>(a: T, b: T): number {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  const ad = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const bd = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  return ad - bd;
}
