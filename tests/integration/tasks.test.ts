import { addDays, addHours } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCourse } from "@/server/courses/service";
import { createTask, deleteTask, getAttentionTasks, getTask, getTaskStats, listTasks, recalculatePriorities, updateTask } from "@/server/tasks/service";
import { openWorkspaceForTask, updateWorkspace } from "@/server/workspace/service";
import { createTestUser, deleteTestUser, hasDatabase } from "./helpers";

let userId = "";
let otherUserId = "";
let courseId = "";
const dbAvailable = await hasDatabase();

beforeAll(async () => {
  if (!dbAvailable) return;
  const [u, o] = await Promise.all([createTestUser("tasks"), createTestUser("other")]);
  userId = u.id;
  otherUserId = o.id;
  const course = await createCourse(userId, { name: "Database Systems", code: "CS135", color: "violet", icon: "database" });
  courseId = course.id;
});

afterAll(async () => {
  if (!dbAvailable) return;
  await Promise.all([deleteTestUser(userId), deleteTestUser(otherUserId)]);
});

describe.skipIf(!dbAvailable)("tasks service (integration)", () => {
  it("creates a task with computed priority and a calendar event", async () => {
    const task = await createTask(userId, { title: "ERD Design Project", courseId, type: "PROJECT", dueDate: addHours(new Date(), 30), estimatedMinutes: 150, importance: 5 });
    expect(task.priority === "CRITICAL" || task.priority === "HIGH").toBe(true);
    expect(task.course?.id).toBe(courseId);
    const events = await db.calendarEvent.findMany({ where: { taskId: task.id } });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("PROJECT");
  });

  it("lists, filters and searches tasks", async () => {
    await createTask(userId, { title: "Read chapter 9", type: "READING", dueDate: addDays(new Date(), 20), importance: 2 });
    const all = await listTasks(userId, { filter: "all", sort: "priority", page: 1, pageSize: 50 });
    expect(all.total).toBeGreaterThanOrEqual(2);
    const search = await listTasks(userId, { filter: "all", q: "chapter", sort: "priority", page: 1, pageSize: 50 });
    expect(search.items.map((t) => t.title)).toEqual(["Read chapter 9"]);
    const week = await listTasks(userId, { filter: "week", sort: "dueDate", page: 1, pageSize: 50 });
    expect(week.items.every((t) => t.dueDate && t.dueDate.getTime() - Date.now() < 8 * 864e5)).toBe(true);
  });

  it("completing a task sets progress to 100 and reopening keeps it consistent", async () => {
    const task = await createTask(userId, { title: "Quiz prep", type: "QUIZ", importance: 3 });
    const done = await updateTask(userId, task.id, { status: "COMPLETED" });
    expect(done.progress).toBe(100);
    expect(done.completedAt).not.toBeNull();
    const reopened = await updateTask(userId, task.id, { status: "IN_PROGRESS", progress: 40 });
    expect(reopened.progress).toBe(40);
    expect(reopened.completedAt).toBeNull();
  });

  it("manual priority overrides lock the value until cleared", async () => {
    const task = await createTask(userId, { title: "Optional reading", type: "READING", dueDate: addDays(new Date(), 40), importance: 1 });
    expect(task.priority).toBe("LOW");
    const locked = await updateTask(userId, task.id, { priority: "CRITICAL" });
    expect(locked.priority).toBe("CRITICAL");
    expect(locked.priorityLocked).toBe(true);
    await recalculatePriorities(userId);
    expect((await getTask(userId, task.id)).priority).toBe("CRITICAL");
    const unlocked = await updateTask(userId, task.id, { priority: null });
    expect(unlocked.priorityLocked).toBe(false);
    expect(unlocked.priority).toBe("LOW");
  });

  it("isolates users: another user cannot read or modify the task", async () => {
    const task = await createTask(userId, { title: "Private task", importance: 3, type: "ASSIGNMENT" });
    await expect(getTask(otherUserId, task.id)).rejects.toThrow(/not found/i);
    await expect(updateTask(otherUserId, task.id, { title: "hacked" })).rejects.toThrow(/not found/i);
    await expect(deleteTask(otherUserId, task.id)).rejects.toThrow(/not found/i);
    await expect(createTask(otherUserId, { title: "x", courseId, importance: 3, type: "ASSIGNMENT" })).rejects.toThrow(/course not found/i);
  });

  it("returns attention tasks ordered by priority and aggregates stats", async () => {
    const attention = await getAttentionTasks(userId, 3);
    expect(attention.length).toBeGreaterThan(0);
    for (let i = 1; i < attention.length; i++) expect(attention[i - 1]!.priorityScore).toBeGreaterThanOrEqual(attention[i]!.priorityScore);
    const stats = await getTaskStats(userId);
    expect(stats.total).toBeGreaterThanOrEqual(stats.completed);
  });

  it("opens a workspace once per task and syncs checklist progress", async () => {
    const task = await createTask(userId, { title: "Essay draft", type: "ASSIGNMENT", importance: 3 });
    const a = await openWorkspaceForTask(userId, task.id);
    const b = await openWorkspaceForTask(userId, task.id);
    expect(a.id).toBe(b.id);
    await updateWorkspace(userId, a.id, {
      checklist: [
        { id: "1", text: "Outline", done: true, source: "user" },
        { id: "2", text: "Draft", done: false, source: "user" },
      ],
    });
    const updated = await getTask(userId, task.id);
    expect(updated.progress).toBe(50);
    expect(updated.status).toBe("IN_PROGRESS");
    await expect(openWorkspaceForTask(otherUserId, task.id)).rejects.toThrow(/not found/i);
  });

  it("soft-deletes tasks and removes their calendar events", async () => {
    const task = await createTask(userId, { title: "Temp", dueDate: addDays(new Date(), 2), importance: 3, type: "ASSIGNMENT" });
    await deleteTask(userId, task.id);
    await expect(getTask(userId, task.id)).rejects.toThrow(/not found/i);
    expect(await db.calendarEvent.count({ where: { taskId: task.id } })).toBe(0);
    expect((await db.task.findUnique({ where: { id: task.id } }))?.deletedAt).not.toBeNull();
  });
});
