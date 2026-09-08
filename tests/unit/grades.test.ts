import { describe, expect, it } from "vitest";
import { gradeLabel, percentOf, requiredForTarget, summarizeCourse } from "@/server/grades/calculator";

const cats = [
  { id: "a", name: "Assignments", weight: 30, dropLowest: 0 },
  { id: "q", name: "Quizzes", weight: 20, dropLowest: 1 },
  { id: "p", name: "Projects", weight: 25, dropLowest: 0 },
  { id: "e", name: "Exams", weight: 25, dropLowest: 0 },
];

describe("percentOf", () => {
  it("computes rounded percentages and guards against zero", () => {
    expect(percentOf(45, 50)).toBe(90);
    expect(percentOf(1, 3)).toBe(33.33);
    expect(percentOf(5, 0)).toBeNull();
  });
});

describe("summarizeCourse", () => {
  it("weights graded categories only and projects the rest", () => {
    const s = summarizeCourse(cats, [
      { id: "1", categoryId: "a", score: 90, maxScore: 100 },
      { id: "2", categoryId: "q", score: 8, maxScore: 10 },
    ]);
    // Assignments 90% (w30) + Quizzes 80% (w20) → (2700+1600)/50 = 86
    expect(s.current).toBe(86);
    expect(s.weightGraded).toBe(50);
    expect(s.projected).toBe(86);
    expect(s.categories.find((c) => c.id === "p")?.percent).toBeNull();
  });

  it("drops the lowest quiz when configured", () => {
    const s = summarizeCourse(cats, [
      { id: "1", categoryId: "q", score: 2, maxScore: 10 },
      { id: "2", categoryId: "q", score: 9, maxScore: 10 },
      { id: "3", categoryId: "q", score: 8, maxScore: 10 },
    ]);
    const quizzes = s.categories.find((c) => c.id === "q")!;
    expect(quizzes.dropped).toBe(1);
    expect(quizzes.percent).toBe(85);
  });

  it("falls back to a simple average without categories", () => {
    const s = summarizeCourse([], [
      { id: "1", categoryId: null, score: 40, maxScore: 50 },
      { id: "2", categoryId: null, score: 10, maxScore: 10 },
    ]);
    expect(s.current).toBe(83.33);
    expect(s.weightGraded).toBe(100);
  });

  it("returns null when nothing is graded", () => {
    const s = summarizeCourse(cats, []);
    expect(s.current).toBeNull();
    expect(s.projected).toBeNull();
    expect(s.weightGraded).toBe(0);
  });

  it("ignores grades with a non-positive max score", () => {
    const s = summarizeCourse(cats, [{ id: "1", categoryId: "a", score: 5, maxScore: 0 }]);
    expect(s.current).toBeNull();
  });
});

describe("requiredForTarget", () => {
  it("computes the average needed on remaining weight", () => {
    const s = summarizeCourse(cats, [{ id: "1", categoryId: "a", score: 80, maxScore: 100 }]);
    // Need 90 overall: (90*100 - 80*30) / 70 = 94.29
    const r = requiredForTarget(s, 90)!;
    expect(r.needed).toBe(94.29);
    expect(r.achievable).toBe(true);
  });
  it("flags unreachable targets", () => {
    const s = summarizeCourse(cats, [
      { id: "1", categoryId: "a", score: 50, maxScore: 100 },
      { id: "2", categoryId: "q", score: 5, maxScore: 10 },
      { id: "3", categoryId: "p", score: 60, maxScore: 100 },
    ]);
    const r = requiredForTarget(s, 95)!;
    expect(r.achievable).toBe(false);
  });
  it("returns null when everything is graded", () => {
    const s = summarizeCourse(cats, cats.map((c, i) => ({ id: String(i), categoryId: c.id, score: 8, maxScore: 10 })));
    expect(requiredForTarget(s, 90)).toBeNull();
  });
});

describe("gradeLabel", () => {
  it("uses institution bands when present", () => {
    const config = { bands: [{ min: 96, label: "1.00" }, { min: 90, label: "1.25" }, { min: 0, label: "5.00" }] };
    expect(gradeLabel(97, config)).toBe("1.00");
    expect(gradeLabel(91, config)).toBe("1.25");
    expect(gradeLabel(20, config)).toBe("5.00");
  });
  it("supports letter and percentage scales", () => {
    expect(gradeLabel(95, { scale: "letter" })).toBe("A");
    expect(gradeLabel(72, { scale: "letter" })).toBe("C-");
    expect(gradeLabel(88.456, { scale: "percentage" })).toBe("88.46%");
    expect(gradeLabel(null, null)).toBe("—");
  });
});
