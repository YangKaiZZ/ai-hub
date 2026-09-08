import { addDays, endOfDay, startOfDay } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db";
import { analyzeTask } from "@/server/ai/intelligence/service";
import type { AITool } from "@/server/ai/provider/types";
import { summarizeCourse } from "@/server/grades/calculator";
import { getGradesOverview } from "@/server/grades/service";
import { retrieveChunks } from "@/server/rag/retriever";
import { createTask, updateTask } from "@/server/tasks/service";
import { createTaskSchema, updateTaskSchema } from "@/server/tasks/schemas";
import { proposeStudyPlan } from "@/server/planner/service";

/**
 * Agent tools. Every tool is constructed with the caller's userId already
 * bound, so the model can never address another user's data. Outputs are
 * compact JSON designed for the model, not the UI.
 */
export function buildAgentTools(userId: string, options: { allowWrites: boolean }): AITool[] {
  const tools: AITool[] = [
    tool({
      name: "get_tasks",
      label: "Looking at your tasks",
      description: "List the student's tasks. Defaults to open tasks sorted by priority. Use status='COMPLETED' for finished work.",
      schema: z.object({
        status: z.enum(["OPEN", "COMPLETED", "ALL"]).default("OPEN"),
        courseId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      run: async ({ status, courseId, limit }) => {
        const tasks = await db.task.findMany({
          where: {
            userId,
            deletedAt: null,
            ...(status === "OPEN" ? { status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } : status === "COMPLETED" ? { status: "COMPLETED" } : { status: { not: "ARCHIVED" } }),
            ...(courseId ? { courseId } : {}),
          },
          orderBy: [{ priorityScore: "desc" }, { dueDate: "asc" }],
          take: limit,
          select: { id: true, title: true, type: true, status: true, priority: true, progress: true, estimatedMinutes: true, dueDate: true, course: { select: { id: true, name: true } } },
        });
        return { items: tasks.map((t) => ({ ...t, course: t.course?.name ?? null, courseId: t.course?.id ?? null, dueDate: t.dueDate?.toISOString() ?? null })) };
      },
    }),

    tool({
      name: "get_upcoming_deadlines",
      label: "Checking your deadlines",
      description: "Open tasks due within the next N days (default 7), soonest first. Includes overdue tasks.",
      schema: z.object({ days: z.number().int().min(1).max(60).default(7), limit: z.number().int().min(1).max(50).default(20) }),
      run: async ({ days, limit }) => {
        const now = new Date();
        const tasks = await db.task.findMany({
          where: { userId, deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, dueDate: { lte: addDays(now, days) } },
          orderBy: { dueDate: "asc" },
          take: limit,
          select: { id: true, title: true, type: true, priority: true, progress: true, estimatedMinutes: true, dueDate: true, course: { select: { id: true, name: true } } },
        });
        return {
          now: now.toISOString(),
          items: tasks.map((t) => ({ ...t, course: t.course?.name ?? null, courseId: t.course?.id ?? null, dueDate: t.dueDate?.toISOString() ?? null, overdue: Boolean(t.dueDate && t.dueDate < now), remainingMinutes: t.estimatedMinutes ? Math.round(t.estimatedMinutes * (1 - t.progress / 100)) : null })),
        };
      },
    }),

    tool({
      name: "get_course",
      label: "Reading course details",
      description: "Get a course by id or (partial) name, including instructor, open task count and grade standing.",
      schema: z.object({ courseId: z.string().uuid().optional(), name: z.string().max(120).optional() }),
      run: async ({ courseId, name }) => {
        const course = await db.course.findFirst({
          where: { userId, deletedAt: null, ...(courseId ? { id: courseId } : name ? { name: { contains: name, mode: "insensitive" } } : {}) },
          include: { gradeCategories: true, grades: { select: { id: true, categoryId: true, score: true, maxScore: true } }, _count: { select: { tasks: { where: { deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } } } } },
        });
        if (!course) return { error: "Course not found" };
        const summary = summarizeCourse(course.gradeCategories, course.grades);
        return { id: course.id, name: course.name, code: course.code, instructor: course.instructor, openTasks: course._count.tasks, currentGrade: summary.current, targetGrade: course.targetGrade };
      },
    }),

    tool({
      name: "get_grades",
      label: "Reviewing your grades",
      description: "Grade standing for all active courses (current %, projected %, target %).",
      schema: z.object({}),
      run: async () => {
        const overview = await getGradesOverview(userId);
        return { overallAverage: overview.overallAverage, courses: overview.courses.map((c) => ({ courseId: c.course.id, name: c.course.name, current: c.summary.current, projected: c.summary.projected, target: c.course.targetGrade, weightGraded: c.summary.weightGraded })) };
      },
    }),

    tool({
      name: "search_resources",
      label: "Searching your notes and files",
      description: "Semantic search across the student's uploaded documents and notes. Returns passages with document names and pages.",
      schema: z.object({ query: z.string().min(2).max(300), courseId: z.string().uuid().optional(), limit: z.number().int().min(1).max(10).default(5) }),
      run: async ({ query, courseId, limit }) => {
        const chunks = await retrieveChunks({ userId, query, courseId: courseId ?? null, limit });
        const notes = await db.resource.findMany({ where: { userId, deletedAt: null, type: { in: ["NOTE", "STUDY_GUIDE", "AI_SUMMARY"] }, OR: [{ title: { contains: query, mode: "insensitive" } }, { content: { contains: query, mode: "insensitive" } }] }, select: { id: true, title: true, content: true }, take: 3 });
        return { passages: chunks.map((c) => ({ document: c.documentName, page: c.page, text: c.content.slice(0, 600) })), notes: notes.map((n) => ({ title: n.title, text: (n.content ?? "").slice(0, 600) })) };
      },
    }),

    tool({
      name: "search_workspace_files",
      label: "Checking assignment files",
      description: "Search inside the files attached to a specific task/workspace.",
      schema: z.object({ taskId: z.string().uuid(), query: z.string().min(2).max(300), limit: z.number().int().min(1).max(10).default(5) }),
      run: async ({ taskId, query, limit }) => {
        const attachments = await db.taskAttachment.findMany({ where: { taskId, task: { userId }, documentId: { not: null } }, select: { documentId: true } });
        const ids = attachments.map((a) => a.documentId!).filter(Boolean);
        if (ids.length === 0) return { passages: [], note: "No files attached to this task." };
        const chunks = await retrieveChunks({ userId, query, documentIds: ids, limit });
        return { passages: chunks.map((c) => ({ document: c.documentName, page: c.page, text: c.content.slice(0, 600) })) };
      },
    }),

    tool({
      name: "get_calendar",
      label: "Checking your calendar",
      description: "Calendar events (deadlines, classes, study sessions, personal) between two dates. Defaults to the next 7 days.",
      schema: z.object({ from: z.string().optional().describe("ISO date"), to: z.string().optional().describe("ISO date") }),
      run: async ({ from, to }) => {
        const start = from ? startOfDay(new Date(from)) : startOfDay(new Date());
        const end = to ? endOfDay(new Date(to)) : endOfDay(addDays(start, 7));
        const events = await db.calendarEvent.findMany({ where: { userId, startAt: { gte: start, lte: end } }, orderBy: { startAt: "asc" }, take: 100, select: { id: true, title: true, type: true, startAt: true, endAt: true, allDay: true, taskId: true, course: { select: { name: true } } } });
        return { from: start.toISOString(), to: end.toISOString(), items: events.map((e) => ({ ...e, course: e.course?.name ?? null, startAt: e.startAt.toISOString(), endAt: e.endAt?.toISOString() ?? null })) };
      },
    }),

    tool({
      name: "get_student_preferences",
      label: "Reading your study preferences",
      description: "The student's study window, session length, study days, daily maximum, timezone and default assistance mode.",
      schema: z.object({}),
      run: async () => {
        const user = await db.user.findUnique({ where: { id: userId }, select: { firstName: true, timezone: true, institution: { select: { name: true } }, preference: { select: { studyPreferences: true, defaultAssistanceMode: true } } } });
        return { firstName: user?.firstName, timezone: user?.timezone, institution: user?.institution?.name ?? null, studyPreferences: user?.preference?.studyPreferences ?? {}, assistanceMode: user?.preference?.defaultAssistanceMode ?? "GUIDED" };
      },
    }),

    tool({
      name: "calculate_grade",
      label: "Running the grade calculator",
      description: "What-if grade calculator: given a course and a hypothetical score on remaining work, compute the resulting course grade; or compute the average needed on remaining work to hit a target.",
      schema: z.object({ courseId: z.string().uuid(), hypotheticalRemainingPercent: z.number().min(0).max(100).optional(), targetPercent: z.number().min(0).max(100).optional() }),
      run: async ({ courseId, hypotheticalRemainingPercent, targetPercent }) => {
        const course = await db.course.findFirst({ where: { id: courseId, userId, deletedAt: null }, include: { gradeCategories: true, grades: { select: { id: true, categoryId: true, score: true, maxScore: true } } } });
        if (!course) return { error: "Course not found" };
        const summary = summarizeCourse(course.gradeCategories, course.grades);
        const total = course.gradeCategories.reduce((s, c) => s + c.weight, 0) || 100;
        const gradedWeight = summary.categories.filter((c) => c.percent != null).reduce((s, c) => s + c.weight, 0);
        const earned = summary.categories.reduce((s, c) => s + (c.percent ?? 0) * c.weight, 0);
        const remaining = total - gradedWeight;
        const result: Record<string, unknown> = { current: summary.current, weightGraded: summary.weightGraded };
        if (hypotheticalRemainingPercent != null) result.ifRemainingAverages = { percent: hypotheticalRemainingPercent, finalGrade: Math.round(((earned + hypotheticalRemainingPercent * remaining) / total) * 100) / 100 };
        if (targetPercent != null && remaining > 0) result.neededForTarget = { target: targetPercent, neededAverage: Math.round(((targetPercent * total - earned) / remaining) * 100) / 100 };
        return result;
      },
    }),
  ];

  if (options.allowWrites) {
    tools.push(
      tool({
        name: "create_task",
        label: "Adding a task",
        description: "Create a new task for the student. Only use when the student explicitly asks to add something.",
        schema: createTaskSchema.pick({ title: true, description: true, courseId: true, type: true, dueDate: true, estimatedMinutes: true, importance: true }),
        run: async (input) => {
          const task = await createTask(userId, { ...input, importance: input.importance ?? 3, type: input.type ?? "ASSIGNMENT" });
          return { created: true, id: task.id, title: task.title, dueDate: task.dueDate?.toISOString() ?? null, priority: task.priority };
        },
      }),
      tool({
        name: "update_task",
        label: "Updating a task",
        description: "Update a task's status, progress, deadline, estimate or importance. Never mark work complete unless the student says it is done.",
        schema: z.object({ taskId: z.string().uuid() }).merge(updateTaskSchema.pick({ status: true, progress: true, dueDate: true, estimatedMinutes: true, importance: true, title: true })),
        run: async ({ taskId, ...rest }) => {
          const task = await updateTask(userId, taskId, rest);
          return { updated: true, id: task.id, status: task.status, progress: task.progress, priority: task.priority };
        },
      }),
      tool({
        name: "create_study_plan",
        label: "Drafting a study plan",
        description: "Propose a study plan (daily or weekly) built from the student's tasks, preferences and calendar. The plan is saved as a PROPOSAL the student must confirm in the Study Planner; it does not change their calendar yet.",
        schema: z.object({ days: z.number().int().min(1).max(14).default(7), focusTaskIds: z.array(z.string().uuid()).max(10).optional(), notes: z.string().max(500).optional() }),
        run: async ({ days, focusTaskIds, notes }) => {
          const plan = await proposeStudyPlan(userId, { days, focusTaskIds, notes });
          return { proposed: true, planId: plan.id, title: plan.title, sessions: plan.sessions.length, confirmUrl: `/planner?plan=${plan.id}`, rationale: plan.rationale };
        },
      }),
      tool({
        name: "analyze_assignment",
        label: "Analyzing the assignment",
        description: "Run AI analysis on a task (type, difficulty, time estimate, steps, rubric requirements) and store it.",
        schema: z.object({ taskId: z.string().uuid() }),
        run: async ({ taskId }) => analyzeTask(userId, taskId),
      }),
    );
  }

  return tools;
}

function tool<I>(def: { name: string; label: string; description: string; schema: z.ZodType<I>; run: (input: I) => Promise<unknown> }): AITool<I> {
  return { name: def.name, label: def.label, description: def.description, inputSchema: def.schema, execute: def.run };
}
