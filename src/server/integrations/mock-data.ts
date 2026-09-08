import { addDays, setHours, setMinutes, startOfDay, subDays } from "date-fns";
import type { IntegrationProvider } from "@/generated/prisma/enums";
import type { NormalizedAnnouncement, NormalizedCourse, NormalizedGrade, NormalizedTask } from "@/server/ingestion/types";

/**
 * Realistic demo payloads shared by every provider in mock mode. Deterministic
 * so repeated syncs are idempotent (same externalIds), with deadlines relative
 * to "now" so the demo never looks stale.
 */
export function mockDataset(provider: IntegrationProvider, seed = "demo") {
  const today = startOfDay(new Date());
  const at = (d: Date, h: number, m = 0) => setMinutes(setHours(d, h), m);
  const prefix = `${provider.toLowerCase()}-${seed}`;

  const courses: NormalizedCourse[] = [
    { externalId: `${prefix}-c-101`, source: "LMS", name: "Data Structures and Algorithms", code: "CS201", instructor: "Dr. Elena Ramos", instructorEmail: "eramos@example.edu", term: "Current term", url: `https://lms.example.edu/courses/101` },
    { externalId: `${prefix}-c-102`, source: "LMS", name: "Technical Communication", code: "ENG210", instructor: "Prof. Miguel Torres", term: "Current term", url: `https://lms.example.edu/courses/102` },
    { externalId: `${prefix}-c-103`, source: "LMS", name: "Discrete Mathematics", code: "MATH230", instructor: "Dr. Priya Nair", term: "Current term", url: `https://lms.example.edu/courses/103` },
  ];

  const tasks: NormalizedTask[] = [
    {
      externalId: `${prefix}-a-1001`,
      source: "LMS",
      course: { externalId: `${prefix}-c-101`, name: "Data Structures and Algorithms", code: "CS201" },
      title: "Programming Assignment 3: Balanced Binary Search Trees",
      description: "Implement an AVL tree with insert, delete and range queries. Include complexity analysis in the README.",
      instructions: "Submit a zip with source, tests and README.md. Use the provided test harness. Late penalty 10%/day.",
      rubric: [
        { criterion: "Correct rotations & balance", points: 40 },
        { criterion: "Range query implementation", points: 20 },
        { criterion: "Tests", points: 20 },
        { criterion: "Complexity analysis", points: 20 },
      ],
      type: "ASSIGNMENT",
      dueDate: at(addDays(today, 4), 23, 59),
      url: "https://lms.example.edu/courses/101/assignments/1001",
      pointsPossible: 100,
      attachments: [{ name: "pa3-handout.pdf", url: "https://lms.example.edu/files/pa3-handout.pdf", mimeType: "application/pdf" }],
    },
    {
      externalId: `${prefix}-a-1002`,
      source: "LMS",
      course: { externalId: `${prefix}-c-101`, name: "Data Structures and Algorithms", code: "CS201" },
      title: "Quiz 4: Hashing",
      description: "Online quiz, 20 questions, 30 minutes.",
      type: "QUIZ",
      dueDate: at(addDays(today, 2), 18),
      url: "https://lms.example.edu/courses/101/quizzes/1002",
      pointsPossible: 20,
    },
    {
      externalId: `${prefix}-a-2001`,
      source: "LMS",
      course: { externalId: `${prefix}-c-102`, name: "Technical Communication", code: "ENG210" },
      title: "Progress Report Draft",
      description: "Two-page progress report on your semester project following the template in Module 5.",
      type: "ASSIGNMENT",
      dueDate: at(addDays(today, 6), 12),
      url: "https://lms.example.edu/courses/102/assignments/2001",
      pointsPossible: 50,
    },
    {
      externalId: `${prefix}-a-2002`,
      source: "LMS",
      course: { externalId: `${prefix}-c-102`, name: "Technical Communication", code: "ENG210" },
      title: "Discussion: Audience analysis",
      description: "Post an initial response (200 words) and reply to two classmates.",
      type: "DISCUSSION",
      dueDate: at(addDays(today, 1), 23, 59),
      url: "https://lms.example.edu/courses/102/discussions/2002",
      pointsPossible: 10,
    },
    {
      externalId: `${prefix}-a-3001`,
      source: "LMS",
      course: { externalId: `${prefix}-c-103`, name: "Discrete Mathematics", code: "MATH230" },
      title: "Homework 6: Graph Theory",
      description: "Problems 6.1–6.18. Show all work.",
      type: "ASSIGNMENT",
      dueDate: at(addDays(today, 3), 9),
      url: "https://lms.example.edu/courses/103/assignments/3001",
      pointsPossible: 40,
    },
    {
      externalId: `${prefix}-a-3002`,
      source: "LMS",
      course: { externalId: `${prefix}-c-103`, name: "Discrete Mathematics", code: "MATH230" },
      title: "Midterm 2",
      description: "Covers relations, functions, counting and graph theory.",
      type: "EXAM",
      dueDate: at(addDays(today, 11), 10),
      url: "https://lms.example.edu/courses/103/assignments/3002",
      pointsPossible: 100,
    },
  ];

  const grades: NormalizedGrade[] = [
    { externalId: `${prefix}-g-1`, source: "LMS", courseExternalId: `${prefix}-c-101`, title: "Programming Assignment 2: Linked Lists", score: 88, maxScore: 100, gradedAt: subDays(today, 9), category: "Assignments" },
    { externalId: `${prefix}-g-2`, source: "LMS", courseExternalId: `${prefix}-c-101`, title: "Quiz 3: Recursion", score: 17, maxScore: 20, gradedAt: subDays(today, 5), category: "Quizzes" },
    { externalId: `${prefix}-g-3`, source: "LMS", courseExternalId: `${prefix}-c-102`, title: "Memo Assignment", score: 45, maxScore: 50, gradedAt: subDays(today, 12), category: "Assignments" },
    { externalId: `${prefix}-g-4`, source: "LMS", courseExternalId: `${prefix}-c-103`, title: "Homework 5: Counting", score: 34, maxScore: 40, gradedAt: subDays(today, 6), category: "Homework" },
  ];

  const announcements: NormalizedAnnouncement[] = [
    { externalId: `${prefix}-n-1`, source: "LMS", courseExternalId: `${prefix}-c-101`, title: "Office hours moved to Thursday", body: "This week only, office hours are Thursday 3–5pm in Room 214.", postedAt: subDays(today, 1) },
    { externalId: `${prefix}-n-2`, source: "LMS", courseExternalId: `${prefix}-c-103`, title: "Midterm 2 review session", body: "Review session on the Monday before the exam, 6pm. Bring questions on graph theory.", postedAt: subDays(today, 2) },
  ];

  return { courses, tasks, grades, announcements };
}
