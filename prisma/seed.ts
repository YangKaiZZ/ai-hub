/**
 * Demo data seed. Creates the sample student "Andrew" with realistic courses,
 * tasks, grades, resources, notifications and a study plan so the app looks
 * populated immediately in development.
 *
 *   npm run db:seed
 *
 * Login: andrew@demo.aihub.local / Password123
 * Admin: admin@demo.aihub.local / Password123
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { addDays, addHours, setHours, setMinutes, startOfDay, subDays } from "date-fns";
import { PrismaClient } from "../src/generated/prisma/client";
import { SEED_INSTITUTIONS } from "../src/server/institutions/service";
import { calculatePriority } from "../src/server/tasks/priority";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEMO_EMAIL = "andrew@demo.aihub.local";
const ADMIN_EMAIL = "admin@demo.aihub.local";
const PASSWORD = "Password123";

function at(day: Date, hour: number, minute = 0) {
  return setMinutes(setHours(startOfDay(day), hour), minute);
}

async function seedInstitutions() {
  for (const inst of SEED_INSTITUTIONS) {
    await prisma.institution.upsert({
      where: { slug: inst.slug },
      update: { isVerified: true },
      create: {
        name: inst.name,
        slug: inst.slug,
        shortName: inst.shortName ?? null,
        country: inst.country,
        city: inst.city ?? null,
        type: inst.type ?? "UNIVERSITY",
        emailDomains: inst.emailDomains ?? [],
        timezone: inst.timezone,
        defaultLms: inst.defaultLms ?? null,
        gradingConfig: inst.gradingConfig as object,
        termConfig: inst.termConfig as object,
        isVerified: true,
      },
    });
  }
}

async function main() {
  console.log("Seeding institutions…");
  await seedInstitutions();
  const mapua = await prisma.institution.findUniqueOrThrow({ where: { slug: "mapua-university" } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  console.log("Resetting demo users…");
  await prisma.user.deleteMany({ where: { email: { in: [DEMO_EMAIL, ADMIN_EMAIL] } } });

  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
      timezone: "Asia/Manila",
      onboardingCompletedAt: new Date(),
      onboardingStep: 5,
      preference: { create: {} },
    },
  });

  const now = new Date();
  const today = startOfDay(now);

  const andrew = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      firstName: "Andrew",
      lastName: "Reyes",
      timezone: "Asia/Manila",
      institutionId: mapua.id,
      onboardingCompletedAt: subDays(now, 20),
      onboardingStep: 5,
      lastActiveAt: now,
      preference: {
        create: {
          defaultAssistanceMode: "GUIDED",
          studyPreferences: { preferredStartHour: 18, preferredEndHour: 23, sessionMinutes: 45, breakMinutes: 10, studyDays: [0, 1, 2, 3, 4, 6], dailyMaxMinutes: 240 },
        },
      },
    },
  });

  const term = await prisma.term.create({
    data: { userId: andrew.id, institutionId: mapua.id, name: "3rd Quarter AY 2025-2026", startDate: subDays(today, 35), endDate: addDays(today, 50), isCurrent: true },
  });

  console.log("Creating courses…");
  const courseDefs = [
    { name: "Object-Oriented Programming", code: "CS124", instructor: "Prof. Liza Mendoza", color: "indigo", icon: "code", target: 90, cats: [["Assignments", 30], ["Quizzes", 20], ["Projects", 25], ["Exams", 25]] },
    { name: "Database Systems", code: "CS135", instructor: "Engr. Marco Villanueva", color: "violet", icon: "database", target: 88, cats: [["Assignments", 25], ["Quizzes", 15], ["Projects", 35], ["Exams", 25]] },
    { name: "Calculus", code: "MATH146", instructor: "Dr. Ana Castillo", color: "teal", icon: "sigma", target: 85, cats: [["Problem Sets", 30], ["Quizzes", 30], ["Exams", 40]] },
    { name: "Systems Integration", code: "IT152", instructor: "Prof. Jerome Ocampo", color: "amber", icon: "cpu", target: 87, cats: [["Documentation", 30], ["Labs", 30], ["Project", 40]] },
  ] as const;

  const courses: Record<string, { id: string; cats: Record<string, string> }> = {};
  for (const def of courseDefs) {
    const course = await prisma.course.create({
      data: {
        userId: andrew.id,
        institutionId: mapua.id,
        termId: term.id,
        name: def.name,
        code: def.code,
        instructor: def.instructor,
        color: def.color,
        icon: def.icon,
        targetGrade: def.target,
        credits: 3,
        enrollments: { create: { userId: andrew.id } },
        gradeCategories: { create: def.cats.map(([name, weight], i) => ({ name, weight, sortOrder: i })) },
      },
      include: { gradeCategories: true },
    });
    courses[def.code] = { id: course.id, cats: Object.fromEntries(course.gradeCategories.map((c) => [c.name, c.id])) };
  }

  console.log("Creating tasks…");
  type TaskSeed = {
    course: string;
    title: string;
    type: "ASSIGNMENT" | "PROJECT" | "QUIZ" | "EXAM" | "READING" | "LAB";
    due: Date;
    est: number;
    importance: number;
    progress: number;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    description: string;
    instructions?: string;
    rubric?: { criterion: string; points: number; description?: string }[];
    analyzed?: boolean;
  };

  const tasks: TaskSeed[] = [
    {
      course: "CS135",
      title: "ERD Design Project",
      type: "PROJECT",
      due: at(addDays(today, 1), 23, 59),
      est: 150,
      importance: 5,
      progress: 45,
      status: "IN_PROGRESS",
      description: "Design a normalized entity-relationship diagram for a university library system, including at least 8 entities, cardinalities, and a short justification of normalization decisions.",
      instructions:
        "1. Identify entities and attributes from the case study.\n2. Draw the ERD using Crow's Foot notation.\n3. Normalize to 3NF and document each step.\n4. Submit a PDF with the diagram and a 1-page write-up.",
      rubric: [
        { criterion: "Entity & attribute completeness", points: 30, description: "All entities from the case are captured with sensible attributes." },
        { criterion: "Relationships & cardinality", points: 25, description: "Correct cardinalities and participation constraints." },
        { criterion: "Normalization to 3NF", points: 30, description: "Each normal form justified with examples." },
        { criterion: "Presentation", points: 15, description: "Clear diagram and concise write-up." },
      ],
      analyzed: true,
    },
    {
      course: "CS124",
      title: "C++ Programming Assignment: Inventory Classes",
      type: "ASSIGNMENT",
      due: at(addDays(today, 3), 17),
      est: 120,
      importance: 4,
      progress: 20,
      status: "IN_PROGRESS",
      description: "Implement Item, PerishableItem and Inventory classes with inheritance, operator overloading for comparison, and unit tests.",
      instructions: "Use the provided header skeletons. Follow the style guide. Include a Makefile and at least 6 test cases.",
      rubric: [
        { criterion: "Correct inheritance hierarchy", points: 30 },
        { criterion: "Operator overloading", points: 20 },
        { criterion: "Tests & build", points: 30 },
        { criterion: "Code quality", points: 20 },
      ],
      analyzed: true,
    },
    {
      course: "MATH146",
      title: "Calculus Problem Set 4: Derivatives of Transcendental Functions",
      type: "ASSIGNMENT",
      due: at(addDays(today, 2), 8),
      est: 90,
      importance: 3,
      progress: 0,
      status: "NOT_STARTED",
      description: "Problems 1–24 from the module on derivatives of logarithmic, exponential and inverse trigonometric functions.",
      analyzed: true,
    },
    {
      course: "IT152",
      title: "Systems Integration Documentation",
      type: "ASSIGNMENT",
      due: at(addDays(today, 6), 23, 59),
      est: 180,
      importance: 4,
      progress: 10,
      status: "IN_PROGRESS",
      description: "Write the integration architecture document for the campus enrollment system: context diagram, interface catalogue, data flows and error-handling strategy.",
      analyzed: true,
    },
    {
      course: "MATH146",
      title: "Quiz 3: Partial Differentiation",
      type: "QUIZ",
      due: at(addDays(today, 5), 10),
      est: 60,
      importance: 3,
      progress: 0,
      status: "NOT_STARTED",
      description: "In-class quiz covering higher-order partial derivatives.",
      analyzed: true,
    },
    {
      course: "CS124",
      title: "Read: Chapter 9 — Polymorphism",
      type: "READING",
      due: at(addDays(today, 4), 9),
      est: 45,
      importance: 2,
      progress: 0,
      status: "NOT_STARTED",
      description: "Read chapter 9 and prepare two questions for the discussion.",
    },
    {
      course: "IT152",
      title: "Lab 5: Message Queue Integration",
      type: "LAB",
      due: at(addDays(today, 9), 23, 59),
      est: 120,
      importance: 3,
      progress: 0,
      status: "NOT_STARTED",
      description: "Integrate the order service with RabbitMQ and demonstrate retry behaviour.",
    },
    {
      course: "CS135",
      title: "Midterm Exam",
      type: "EXAM",
      due: at(addDays(today, 14), 13),
      est: 300,
      importance: 5,
      progress: 0,
      status: "NOT_STARTED",
      description: "Covers relational algebra, SQL, normalization and transactions.",
    },
    {
      course: "CS135",
      title: "SQL Joins Worksheet",
      type: "ASSIGNMENT",
      due: at(subDays(today, 4), 23, 59),
      est: 60,
      importance: 3,
      progress: 100,
      status: "COMPLETED",
      description: "Practice inner, outer and self joins on the sample schema.",
    },
    {
      course: "CS124",
      title: "Quiz 2: Classes and Objects",
      type: "QUIZ",
      due: at(subDays(today, 7), 10),
      est: 45,
      importance: 3,
      progress: 100,
      status: "COMPLETED",
      description: "Short quiz on constructors, destructors and encapsulation.",
    },
    {
      course: "MATH146",
      title: "Problem Set 3: Derivatives of Trigonometric Functions",
      type: "ASSIGNMENT",
      due: at(subDays(today, 9), 8),
      est: 90,
      importance: 3,
      progress: 100,
      status: "COMPLETED",
      description: "Problems 1–20.",
    },
    {
      course: "IT152",
      title: "Lab 4: REST API Contract",
      type: "LAB",
      due: at(subDays(today, 2), 23, 59),
      est: 90,
      importance: 3,
      progress: 60,
      status: "IN_PROGRESS",
      description: "Document the REST contract for the enrollment API using OpenAPI.",
    },
  ];

  const createdTasks: Record<string, string> = {};
  for (const t of tasks) {
    const pr = calculatePriority({ dueDate: t.due, estimatedMinutes: t.est, importance: t.importance, progress: t.progress, status: t.status, now });
    const created = await prisma.task.create({
      data: {
        userId: andrew.id,
        courseId: courses[t.course]!.id,
        title: t.title,
        type: t.type,
        description: t.description,
        instructions: t.instructions ?? null,
        rubric: t.rubric ?? undefined,
        dueDate: t.due,
        estimatedMinutes: t.est,
        importance: t.importance,
        progress: t.progress,
        status: t.status,
        priority: pr.priority,
        priorityScore: pr.score,
        completedAt: t.status === "COMPLETED" ? subDays(t.due, 1) : null,
        source: "MANUAL",
        aiAnalyzedAt: t.analyzed ? subDays(now, 1) : null,
        aiAnalysis: t.analyzed
          ? {
              taskType: t.type,
              difficulty: t.importance >= 4 ? "hard" : "medium",
              estimatedMinutes: t.est,
              importance: t.importance,
              summary: t.description,
              requiredMaterials: ["Course slides", "Case study PDF"],
              rubricRequirements: t.rubric?.map((r) => r.criterion) ?? ["Address every part of the brief"],
              importantDates: [],
              recommendedSteps: ["Re-read the brief", "Outline the deliverable", "Draft the hardest section first", "Review against the rubric"],
              keyConcepts: t.course === "CS135" ? ["Entities & relationships", "Normalization"] : t.course === "MATH146" ? ["Chain rule", "Derivative rules"] : t.course === "CS124" ? ["Inheritance", "Encapsulation"] : ["Integration patterns", "Interface contracts"],
              risks: [`Starting late for a task estimated at ${t.est} minutes`],
            }
          : undefined,
        calendarEvents: {
          create: {
            userId: andrew.id,
            courseId: courses[t.course]!.id,
            title: t.title,
            type: t.type === "EXAM" || t.type === "QUIZ" ? "EXAM" : t.type === "PROJECT" ? "PROJECT" : "ASSIGNMENT",
            startAt: t.due,
            source: "MANUAL",
          },
        },
      },
    });
    createdTasks[t.title] = created.id;
  }

  console.log("Creating workspace for ERD project…");
  await prisma.assignmentWorkspace.create({
    data: {
      taskId: createdTasks["ERD Design Project"]!,
      userId: andrew.id,
      assistanceMode: "GUIDED",
      draft: "## Entities\n- Book (ISBN, title, year)\n- Author\n- Member\n- Loan\n\n## Notes\nStill deciding whether Reservation is its own entity or an attribute of Loan.",
      notes: "Ask about many-to-many between Book and Author.",
      checklist: [
        { id: "c1", text: "List all entities from the case study", done: true, source: "ai" },
        { id: "c2", text: "Define primary and foreign keys", done: true, source: "ai" },
        { id: "c3", text: "Draw ERD with Crow's Foot notation", done: false, source: "ai" },
        { id: "c4", text: "Normalize to 3NF and document steps", done: false, source: "ai" },
        { id: "c5", text: "Write 1-page justification", done: false, source: "user" },
      ],
      aiOverview:
        "This project asks you to model a library system as a normalized ERD. The rubric weights normalization and relationships most heavily, so spend your time on getting cardinalities right and clearly showing each normal form.",
      lastOpenedAt: subDays(now, 1),
      messages: {
        create: [
          { role: "USER", content: "How should I model the relationship between books and authors?" },
          {
            role: "ASSISTANT",
            content:
              "Books and authors are usually **many-to-many**: one book can have several authors and one author writes many books. In an ERD you resolve that with an associative entity (e.g. `BookAuthor`) holding both foreign keys, plus any attributes that belong to the pairing such as author order.\n\nTry sketching that and tell me what primary key you would choose for `BookAuthor`.",
          },
        ],
      },
    },
  });

  console.log("Creating grades…");
  const grades: { course: string; cat: string; title: string; score: number; max: number; daysAgo: number; task?: string }[] = [
    { course: "CS135", cat: "Assignments", title: "SQL Joins Worksheet", score: 45, max: 50, daysAgo: 3, task: "SQL Joins Worksheet" },
    { course: "CS135", cat: "Quizzes", title: "Quiz 1: Relational Algebra", score: 17, max: 20, daysAgo: 18 },
    { course: "CS135", cat: "Quizzes", title: "Quiz 2: SQL Basics", score: 16, max: 20, daysAgo: 10 },
    { course: "CS135", cat: "Projects", title: "Schema Design Mini-Project", score: 91, max: 100, daysAgo: 20 },
    { course: "CS124", cat: "Assignments", title: "Assignment 1: Structs to Classes", score: 88, max: 100, daysAgo: 22 },
    { course: "CS124", cat: "Assignments", title: "Assignment 2: Encapsulation", score: 92, max: 100, daysAgo: 12 },
    { course: "CS124", cat: "Quizzes", title: "Quiz 1: Basics", score: 8, max: 10, daysAgo: 25 },
    { course: "CS124", cat: "Quizzes", title: "Quiz 2: Classes and Objects", score: 9, max: 10, daysAgo: 6, task: "Quiz 2: Classes and Objects" },
    { course: "MATH146", cat: "Problem Sets", title: "Problem Set 1", score: 38, max: 40, daysAgo: 28 },
    { course: "MATH146", cat: "Problem Sets", title: "Problem Set 2", score: 33, max: 40, daysAgo: 19 },
    { course: "MATH146", cat: "Problem Sets", title: "Problem Set 3", score: 35, max: 40, daysAgo: 8, task: "Problem Set 3: Derivatives of Trigonometric Functions" },
    { course: "MATH146", cat: "Quizzes", title: "Quiz 1", score: 14, max: 20, daysAgo: 24 },
    { course: "MATH146", cat: "Quizzes", title: "Quiz 2", score: 16, max: 20, daysAgo: 11 },
    { course: "IT152", cat: "Labs", title: "Lab 1: Environment Setup", score: 10, max: 10, daysAgo: 30 },
    { course: "IT152", cat: "Labs", title: "Lab 2: Service Discovery", score: 9, max: 10, daysAgo: 23 },
    { course: "IT152", cat: "Labs", title: "Lab 3: Auth Integration", score: 8, max: 10, daysAgo: 15 },
    { course: "IT152", cat: "Documentation", title: "Context Diagram Draft", score: 26, max: 30, daysAgo: 13 },
  ];
  for (const g of grades) {
    await prisma.grade.create({
      data: {
        userId: andrew.id,
        courseId: courses[g.course]!.id,
        categoryId: courses[g.course]!.cats[g.cat] ?? null,
        taskId: g.task ? createdTasks[g.task] ?? null : null,
        title: g.title,
        score: g.score,
        maxScore: g.max,
        gradedAt: subDays(now, g.daysAgo),
      },
    });
  }

  console.log("Creating resources & documents…");
  const doc = await prisma.document.create({
    data: {
      userId: andrew.id,
      courseId: courses["MATH146"]!.id,
      name: "Week 4 Lecture Notes — Derivatives of Transcendental Functions.pdf",
      mimeType: "application/pdf",
      sizeBytes: 482_113,
      storageKey: `demo/${andrew.id}/week4-notes.pdf`,
      status: "READY",
      pageCount: 12,
      textLength: 18_400,
      chunkCount: 3,
      summary: "Covers derivatives of exponential, logarithmic and inverse trigonometric functions with worked examples and common pitfalls.",
      processedAt: subDays(now, 5),
      chunks: {
        create: [
          { index: 0, page: 1, tokenCount: 180, content: "Derivatives of exponential functions. For f(x) = e^x, f'(x) = e^x. For f(x) = a^x, f'(x) = a^x ln(a). The chain rule extends this: d/dx e^{g(x)} = g'(x) e^{g(x)}. Example: d/dx e^{3x^2} = 6x e^{3x^2}." },
          { index: 1, page: 4, tokenCount: 190, content: "Derivatives of logarithmic functions. d/dx ln(x) = 1/x for x > 0. d/dx log_a(x) = 1/(x ln a). Logarithmic differentiation is useful for products and powers: take ln of both sides, differentiate implicitly, then solve for y'." },
          { index: 2, page: 8, tokenCount: 200, content: "Derivatives of inverse trigonometric functions. d/dx arcsin(x) = 1/sqrt(1 - x^2). d/dx arctan(x) = 1/(1 + x^2). d/dx arcsec(x) = 1/(|x| sqrt(x^2 - 1)). Common pitfall: forgetting the chain rule factor when the argument is not x." },
        ],
      },
    },
  });

  await prisma.resource.createMany({
    data: [
      { userId: andrew.id, courseId: courses["MATH146"]!.id, documentId: doc.id, type: "LECTURE", title: "Week 4 Lecture Notes", tags: ["calculus", "derivatives"] },
      {
        userId: andrew.id,
        courseId: courses["CS135"]!.id,
        type: "NOTE",
        title: "Normalization cheat sheet",
        content: "**1NF** — atomic values, no repeating groups.\n**2NF** — 1NF + no partial dependency on a composite key.\n**3NF** — 2NF + no transitive dependencies.\n\nRule of thumb: every non-key attribute depends on the key, the whole key, and nothing but the key.",
        tags: ["database", "normalization"],
        isPinned: true,
      },
      {
        userId: andrew.id,
        courseId: courses["CS124"]!.id,
        type: "FLASHCARD_SET",
        title: "OOP vocabulary",
        content: JSON.stringify([
          { front: "Encapsulation", back: "Bundling data with the methods that operate on it and restricting direct access." },
          { front: "Polymorphism", back: "The ability to treat objects of different classes through a common interface." },
          { front: "Virtual function", back: "A member function that can be overridden in derived classes and dispatched at runtime." },
        ]),
        tags: ["oop", "c++"],
      },
      { userId: andrew.id, courseId: courses["IT152"]!.id, type: "LINK", title: "OpenAPI Specification", url: "https://spec.openapis.org/oas/latest.html", tags: ["api", "docs"] },
      {
        userId: andrew.id,
        courseId: courses["CS135"]!.id,
        type: "AI_SUMMARY",
        title: "Summary: Transactions & ACID",
        content: "Transactions group operations so they succeed or fail together. **Atomicity** all-or-nothing; **Consistency** valid state to valid state; **Isolation** concurrent transactions behave as if serial; **Durability** committed data survives crashes.",
        tags: ["database", "transactions"],
      },
    ],
  });

  console.log("Creating study plan & sessions…");
  const plan = await prisma.studyPlan.create({
    data: {
      userId: andrew.id,
      title: "This week's plan",
      startDate: today,
      endDate: addDays(today, 6),
      status: "ACTIVE",
      confirmedAt: subDays(now, 1),
      rationale: "The ERD project is due tomorrow and carries the most weight, so it gets the first evening. Calculus Problem Set 4 follows because it is due the morning after and has not been started.",
      inputs: { dailyMaxMinutes: 240, preferredStartHour: 18, preferredEndHour: 23 },
    },
  });
  const sessions = [
    { title: "ERD project — finish diagram", type: "ASSIGNMENT_WORK", start: at(today, 18), mins: 75, course: "CS135", task: "ERD Design Project" },
    { title: "Break", type: "BREAK", start: at(today, 19, 15), mins: 15 },
    { title: "Calculus PS4 — logarithmic derivatives", type: "PRACTICE", start: at(today, 19, 30), mins: 45, course: "MATH146", task: "Calculus Problem Set 4: Derivatives of Transcendental Functions" },
    { title: "Review tomorrow's tasks", type: "REVIEW", start: at(today, 20, 15), mins: 15 },
    { title: "C++ assignment — inheritance", type: "ASSIGNMENT_WORK", start: at(addDays(today, 1), 18), mins: 60, course: "CS124", task: "C++ Programming Assignment: Inventory Classes" },
    { title: "Calculus PS4 — inverse trig", type: "PRACTICE", start: at(addDays(today, 1), 19, 15), mins: 45, course: "MATH146", task: "Calculus Problem Set 4: Derivatives of Transcendental Functions" },
    { title: "Systems Integration doc — outline", type: "ASSIGNMENT_WORK", start: at(addDays(today, 2), 18), mins: 60, course: "IT152", task: "Systems Integration Documentation" },
    { title: "OOP flashcards", type: "FLASHCARDS", start: at(addDays(today, 3), 18), mins: 30, course: "CS124" },
  ] as const;
  for (const s of sessions) {
    const session = await prisma.studySession.create({
      data: {
        userId: andrew.id,
        planId: plan.id,
        courseId: "course" in s && s.course ? courses[s.course]!.id : null,
        taskId: "task" in s && s.task ? createdTasks[s.task] ?? null : null,
        title: s.title,
        type: s.type,
        startAt: s.start,
        endAt: addHours(s.start, s.mins / 60),
      },
    });
    if (s.type !== "BREAK") {
      await prisma.calendarEvent.create({
        data: { userId: andrew.id, studySessionId: session.id, courseId: session.courseId, taskId: session.taskId, title: s.title, type: "STUDY_SESSION", startAt: s.start, endAt: session.endAt, source: "MANUAL" },
      });
    }
  }

  console.log("Creating announcements, conversations, notifications…");
  await prisma.announcement.createMany({
    data: [
      { courseId: courses["CS135"]!.id, title: "ERD project deadline extended by 24 hours", body: "Because of the campus network outage, the ERD project is now due one day later. Rubric unchanged.", postedAt: subDays(now, 2) },
      { courseId: courses["MATH146"]!.id, title: "Quiz 3 coverage", body: "Quiz 3 covers higher-order partial derivatives only. Bring a scientific calculator.", postedAt: subDays(now, 1) },
    ],
  });

  await prisma.aIConversation.create({
    data: {
      userId: andrew.id,
      courseId: courses["MATH146"]!.id,
      kind: "TUTOR",
      title: "Chain rule with exponentials",
      subject: "Calculus",
      assistanceMode: "LEARNING",
      contextDocumentIds: [doc.id],
      messages: {
        create: [
          { role: "USER", content: "I don't understand how to differentiate e^(3x^2)." },
          {
            role: "ASSISTANT",
            content:
              "Let's build it up. You already know d/dx e^x = e^x. Here the exponent is not just x — it is 3x². That means we have a function inside a function, which is exactly when the **chain rule** applies.\n\nStep 1: What is the derivative of the *inside*, 3x²? Try that first and I will help with the rest.",
            sources: [{ documentId: doc.id, chunkIndex: 0, title: "Week 4 Lecture Notes", page: 1, snippet: "The chain rule extends this: d/dx e^{g(x)} = g'(x) e^{g(x)}." }],
          },
        ],
      },
    },
  });

  await prisma.notification.createMany({
    data: [
      { userId: andrew.id, type: "DEADLINE_APPROACHING", title: "Due soon: ERD Design Project", body: "Database Systems · Due within the next 48 hours.", data: { taskId: createdTasks["ERD Design Project"], href: `/tasks/${createdTasks["ERD Design Project"]}` }, createdAt: subDays(now, 0.2) },
      { userId: andrew.id, type: "AI_RECOMMENDATION", title: "Tonight's plan is ready", body: "ERD project first, then 45 minutes of Calculus.", data: { href: "/planner" }, createdAt: subDays(now, 0.5) },
      { userId: andrew.id, type: "GRADE_UPDATE", title: "New grade: SQL Joins Worksheet", body: "45/50 in Database Systems.", data: { href: "/grades" }, readAt: subDays(now, 2), createdAt: subDays(now, 3) },
    ],
  });

  await prisma.integration.create({
    data: { userId: andrew.id, provider: "BLACKBOARD", status: "CONNECTED", baseUrl: "https://demo-lms.aihub.local", externalUserId: "andrew.reyes", isMock: true, lastSyncedAt: subDays(now, 1), scopes: ["read:courses", "read:assignments", "read:grades"] },
  });

  await prisma.aIUsageLog.createMany({
    data: Array.from({ length: 14 }).map((_, i) => ({
      userId: andrew.id,
      feature: i % 3 === 0 ? "tutor" : i % 3 === 1 ? "workspace" : "task-analysis",
      provider: "mock",
      model: "mock-1",
      inputTokens: 900 + i * 37,
      outputTokens: 300 + i * 21,
      latencyMs: 800 + i * 40,
      createdAt: subDays(now, i / 2),
    })),
  });

  console.log(`\nDone. Sign in as ${DEMO_EMAIL} / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
