import { IntegrationError } from "@/lib/errors";
import { BaseLmsProvider } from "@/server/integrations/providers/base-mock";
import type { ConnectInput, ConnectResult, ProviderCredentials, SyncScope } from "@/server/integrations/types";
import type { NormalizedCourse, NormalizedTask } from "@/server/ingestion/types";

/**
 * Moodle via Web Services (REST, moodle_mobile_app service token).
 * Docs: https://docs.moodle.org/dev/Web_service_API_functions
 */
export class MoodleProvider extends BaseLmsProvider {
  readonly name = "MOODLE" as const;
  readonly label = "Moodle";
  readonly connectionHelp = "Ask your Moodle administrator for a Web Services token (Preferences → Security keys), or use the mobile app token, and paste it with your Moodle site URL.";

  private async call<T>(creds: ProviderCredentials, wsfunction: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL("/webservice/rest/server.php", creds.baseUrl);
    url.searchParams.set("wstoken", creds.accessToken ?? "");
    url.searchParams.set("moodlewsrestformat", "json");
    url.searchParams.set("wsfunction", wsfunction);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new IntegrationError(`Moodle returned ${res.status}`);
    const json = (await res.json()) as T & { exception?: string; message?: string };
    if (json && typeof json === "object" && "exception" in json && json.exception) throw new IntegrationError(json.message ?? "Moodle web service error");
    return json;
  }

  protected override async realConnect(input: ConnectInput): Promise<ConnectResult> {
    const creds: ProviderCredentials = { baseUrl: input.baseUrl.replace(/\/+$/, ""), accessToken: input.accessToken };
    const info = await this.call<{ userid: number; fullname: string }>(creds, "core_webservice_get_site_info");
    return { credentials: { ...creds, externalUserId: String(info.userid) }, externalUserId: String(info.userid), displayName: info.fullname, scopes: ["core_webservice_get_site_info", "core_enrol_get_users_courses", "mod_assign_get_assignments"], tokenExpiresAt: null };
  }

  protected override async realSyncCourses(creds: ProviderCredentials): Promise<NormalizedCourse[]> {
    type MoodleCourse = { id: number; fullname: string; shortname?: string; hidden?: boolean };
    const courses = await this.call<MoodleCourse[]>(creds, "core_enrol_get_users_courses", { userid: creds.externalUserId ?? "" });
    return courses.filter((c) => !c.hidden).map((c) => ({ externalId: String(c.id), source: "LMS" as const, name: c.fullname, code: c.shortname ?? null, url: `${creds.baseUrl}/course/view.php?id=${c.id}`, rawData: c }));
  }

  protected override async realSyncTasks(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedTask[]> {
    void scope; // Moodle returns all assignments; incremental sync is handled by the ingestion engine's upserts.
    type Assign = { id: number; cmid: number; name: string; intro?: string; duedate?: number; allowsubmissionsfromdate?: number; grade?: number };
    type Resp = { courses: { id: number; fullname: string; shortname?: string; assignments: Assign[] }[] };
    const resp = await this.call<Resp>(creds, "mod_assign_get_assignments");
    const out: NormalizedTask[] = [];
    for (const c of resp.courses) {
      for (const a of c.assignments) {
        out.push({
          externalId: String(a.id),
          source: "LMS",
          course: { externalId: String(c.id), name: c.fullname, code: c.shortname ?? null },
          title: a.name,
          description: a.intro?.replace(/<[^>]+>/g, "").trim() || null,
          type: "ASSIGNMENT",
          dueDate: a.duedate ? new Date(a.duedate * 1000) : null,
          startDate: a.allowsubmissionsfromdate ? new Date(a.allowsubmissionsfromdate * 1000) : null,
          url: `${creds.baseUrl}/mod/assign/view.php?id=${a.cmid}`,
          pointsPossible: a.grade ?? null,
          rawData: a,
        });
      }
    }
    return out;
  }
}
