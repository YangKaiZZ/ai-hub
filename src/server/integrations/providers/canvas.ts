import { IntegrationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { BaseLmsProvider } from "@/server/integrations/providers/base-mock";
import type { ConnectInput, ConnectResult, ProviderCredentials, SyncScope } from "@/server/integrations/types";
import type { NormalizedCourse, NormalizedTask, NormalizedAnnouncement, NormalizedGrade } from "@/server/ingestion/types";

/**
 * Canvas LMS (Instructure) via the REST API using a student-generated access
 * token (Account → Settings → New Access Token). Only read scopes are used.
 * Docs: https://canvas.instructure.com/doc/api/
 */
export class CanvasProvider extends BaseLmsProvider {
  readonly name = "CANVAS" as const;
  readonly label = "Canvas";
  readonly connectionHelp = "In Canvas go to Account → Settings → Approved Integrations → “+ New Access Token”, then paste the token here along with your school’s Canvas URL.";

  private async api<T>(creds: ProviderCredentials, path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`/api/v1${path}`, creds.baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("per_page", "100");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.accessToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 401) throw new IntegrationError("Canvas rejected the access token");
    if (!res.ok) {
      logger.warn("integrations", "canvas api error", { status: res.status, path });
      throw new IntegrationError(`Canvas returned ${res.status}`);
    }
    return (await res.json()) as T;
  }

  protected override async realConnect(input: ConnectInput): Promise<ConnectResult> {
    const creds: ProviderCredentials = { baseUrl: input.baseUrl.replace(/\/+$/, ""), accessToken: input.accessToken };
    const me = await this.api<{ id: number; name: string }>(creds, "/users/self");
    return { credentials: { ...creds, externalUserId: String(me.id) }, externalUserId: String(me.id), displayName: me.name, scopes: ["url:GET|/api/v1/courses", "url:GET|/api/v1/users/self"], tokenExpiresAt: null };
  }

  protected override async realSyncCourses(creds: ProviderCredentials): Promise<NormalizedCourse[]> {
    type CanvasCourse = { id: number; name: string; course_code?: string; term?: { name?: string }; teachers?: { display_name: string }[]; workflow_state?: string };
    const courses = await this.api<CanvasCourse[]>(creds, "/courses", { enrollment_state: "active", "include[]": "teachers", "state[]": "available" });
    return courses
      .filter((c) => c.workflow_state !== "deleted")
      .map((c) => ({ externalId: String(c.id), source: "LMS" as const, name: c.name, code: c.course_code ?? null, instructor: c.teachers?.[0]?.display_name ?? null, term: c.term?.name ?? null, url: `${creds.baseUrl}/courses/${c.id}`, rawData: c }));
  }

  protected override async realSyncTasks(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedTask[]> {
    type CanvasAssignment = { id: number; course_id: number; name: string; description?: string | null; due_at?: string | null; unlock_at?: string | null; html_url?: string; points_possible?: number | null; submission_types?: string[]; is_quiz_assignment?: boolean; updated_at?: string; rubric?: { description: string; points: number; long_description?: string }[] };
    const courses = await this.realSyncCourses(creds);
    const out: NormalizedTask[] = [];
    for (const course of courses) {
      const assignments = await this.api<CanvasAssignment[]>(creds, `/courses/${course.externalId}/assignments`, { "include[]": "submission", order_by: "due_at" });
      for (const a of assignments) {
        if (scope.since && a.updated_at && new Date(a.updated_at) < scope.since) continue;
        out.push({
          externalId: String(a.id),
          source: "LMS",
          course: { externalId: course.externalId, name: course.name, code: course.code },
          title: a.name,
          description: stripHtml(a.description),
          rubric: a.rubric?.map((r) => ({ criterion: r.description, points: r.points, description: r.long_description })) ?? null,
          type: a.is_quiz_assignment ? "QUIZ" : a.submission_types?.includes("discussion_topic") ? "DISCUSSION" : "ASSIGNMENT",
          dueDate: a.due_at ? new Date(a.due_at) : null,
          startDate: a.unlock_at ? new Date(a.unlock_at) : null,
          url: a.html_url ?? null,
          pointsPossible: a.points_possible ?? null,
          rawData: a,
        });
      }
    }
    return out;
  }

  protected override async realSyncAnnouncements(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedAnnouncement[]> {
    type CanvasAnnouncement = { id: number; title: string; message?: string; posted_at?: string; html_url?: string; context_code?: string };
    const courses = await this.realSyncCourses(creds);
    if (courses.length === 0) return [];
    const params: Record<string, string> = {};
    courses.forEach((c, i) => (params[`context_codes[${i}]`] = `course_${c.externalId}`));
    if (scope.since) params.start_date = scope.since.toISOString();
    const items = await this.api<CanvasAnnouncement[]>(creds, "/announcements", params);
    return items.map((a) => ({ externalId: String(a.id), source: "LMS" as const, courseExternalId: (a.context_code ?? "").replace("course_", ""), title: a.title, body: stripHtml(a.message) ?? "", postedAt: a.posted_at ? new Date(a.posted_at) : new Date(), url: a.html_url ?? null }));
  }

  protected override async realSyncGrades(creds: ProviderCredentials): Promise<NormalizedGrade[]> {
    type Submission = { id: number; assignment_id: number; score?: number | null; graded_at?: string | null; assignment?: { name: string; points_possible?: number | null; assignment_group_id?: number } };
    const courses = await this.realSyncCourses(creds);
    const out: NormalizedGrade[] = [];
    for (const course of courses) {
      const subs = await this.api<Submission[]>(creds, `/courses/${course.externalId}/students/submissions`, { "student_ids[]": "self", "include[]": "assignment", workflow_state: "graded" });
      for (const s of subs) {
        if (s.score == null || !s.assignment?.points_possible) continue;
        out.push({ externalId: String(s.id), source: "LMS", courseExternalId: course.externalId, taskExternalId: String(s.assignment_id), title: s.assignment.name, score: s.score, maxScore: s.assignment.points_possible, gradedAt: s.graded_at ? new Date(s.graded_at) : null });
      }
    }
    return out;
  }
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
