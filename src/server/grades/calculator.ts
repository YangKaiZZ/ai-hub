/**
 * Grade calculator — pure functions, unit-tested.
 * Supports weighted categories (with optional drop-lowest) and an unweighted
 * fallback when a course has no categories or grades outside categories.
 */
export interface GradeEntry {
  id: string;
  categoryId: string | null;
  score: number;
  maxScore: number;
}

export interface CategoryDef {
  id: string;
  name: string;
  weight: number; // percentage 0-100
  dropLowest: number;
}

export interface CategoryBreakdown {
  id: string;
  name: string;
  weight: number;
  /** Percentage 0-100 or null when no graded items yet. */
  percent: number | null;
  earned: number;
  possible: number;
  count: number;
  dropped: number;
}

export interface CourseGradeSummary {
  /** Weighted percentage considering only categories with grades (0-100), or null if nothing graded. */
  current: number | null;
  /** Weighted percentage assuming ungraded categories score the same as the current average. */
  projected: number | null;
  /** Share of total weight that already has grades (0-100). */
  weightGraded: number;
  categories: CategoryBreakdown[];
  uncategorized: { percent: number | null; earned: number; possible: number; count: number };
}

export function percentOf(earned: number, possible: number): number | null {
  if (possible <= 0) return null;
  return round2((earned / possible) * 100);
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function categoryStats(entries: GradeEntry[], dropLowest: number) {
  // Drop the lowest N items by percentage before aggregating.
  const sorted = [...entries].sort((a, b) => a.score / a.maxScore - b.score / b.maxScore);
  const kept = dropLowest > 0 && sorted.length > dropLowest ? sorted.slice(dropLowest) : sorted;
  const earned = kept.reduce((s, g) => s + g.score, 0);
  const possible = kept.reduce((s, g) => s + g.maxScore, 0);
  return { earned, possible, dropped: sorted.length - kept.length, count: entries.length };
}

export function summarizeCourse(categories: CategoryDef[], grades: GradeEntry[]): CourseGradeSummary {
  const validGrades = grades.filter((g) => g.maxScore > 0);
  const breakdown: CategoryBreakdown[] = categories.map((c) => {
    const entries = validGrades.filter((g) => g.categoryId === c.id);
    const stats = categoryStats(entries, c.dropLowest);
    return { id: c.id, name: c.name, weight: c.weight, percent: percentOf(stats.earned, stats.possible), earned: stats.earned, possible: stats.possible, count: stats.count, dropped: stats.dropped };
  });

  const knownIds = new Set(categories.map((c) => c.id));
  const uncategorizedEntries = validGrades.filter((g) => !g.categoryId || !knownIds.has(g.categoryId));
  const un = categoryStats(uncategorizedEntries, 0);
  const uncategorized = { percent: percentOf(un.earned, un.possible), earned: un.earned, possible: un.possible, count: un.count };

  const totalWeight = categories.reduce((s, c) => s + c.weight, 0);

  if (totalWeight <= 0) {
    // No weighting: simple points-based average across everything.
    const all = categoryStats(validGrades, 0);
    const pct = percentOf(all.earned, all.possible);
    return { current: pct, projected: pct, weightGraded: pct == null ? 0 : 100, categories: breakdown, uncategorized };
  }

  const graded = breakdown.filter((b) => b.percent != null);
  const gradedWeight = graded.reduce((s, b) => s + b.weight, 0);
  if (gradedWeight === 0) {
    return { current: uncategorized.percent, projected: uncategorized.percent, weightGraded: 0, categories: breakdown, uncategorized };
  }

  const weightedSum = graded.reduce((s, b) => s + (b.percent ?? 0) * b.weight, 0);
  const current = round2(weightedSum / gradedWeight);
  // Projection: remaining weight performs at the current average.
  const projected = round2((weightedSum + current * (totalWeight - gradedWeight)) / totalWeight);

  return { current, projected, weightGraded: round2((gradedWeight / totalWeight) * 100), categories: breakdown, uncategorized };
}

/**
 * What average is needed on the remaining (ungraded) weight to reach `target`?
 * Returns null when everything is already graded or there are no categories.
 */
export function requiredForTarget(summary: CourseGradeSummary, target: number): { needed: number; achievable: boolean } | null {
  const total = summary.categories.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return null;
  const gradedWeight = summary.categories.filter((c) => c.percent != null).reduce((s, c) => s + c.weight, 0);
  const remaining = total - gradedWeight;
  if (remaining <= 0) return null;
  const earnedSoFar = summary.categories.reduce((s, c) => s + (c.percent ?? 0) * c.weight, 0);
  const needed = round2((target * total - earnedSoFar) / remaining);
  return { needed, achievable: needed <= 100 };
}

/** Letter/band label from an institution grading config. */
export function gradeLabel(percent: number | null, config: { scale?: string; bands?: { min: number; label: string }[] } | null | undefined): string {
  if (percent == null) return "—";
  const bands = config?.bands;
  if (bands && bands.length) {
    const sorted = [...bands].sort((a, b) => b.min - a.min);
    return sorted.find((b) => percent >= b.min)?.label ?? sorted[sorted.length - 1]!.label;
  }
  switch (config?.scale) {
    case "gpa4":
      return (Math.max(0, Math.min(4, (percent - 60) / 10))).toFixed(2);
    case "letter":
      if (percent >= 93) return "A";
      if (percent >= 90) return "A-";
      if (percent >= 87) return "B+";
      if (percent >= 83) return "B";
      if (percent >= 80) return "B-";
      if (percent >= 77) return "C+";
      if (percent >= 73) return "C";
      if (percent >= 70) return "C-";
      if (percent >= 60) return "D";
      return "F";
    default:
      return `${round2(percent)}%`;
  }
}
