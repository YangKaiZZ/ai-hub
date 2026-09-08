import type { IntegrationProvider as ProviderName } from "@/generated/prisma/enums";
import { IntegrationError } from "@/lib/errors";
import { mockDataset } from "@/server/integrations/mock-data";
import type { ConnectInput, ConnectResult, LmsProvider, ProviderCredentials, SyncScope } from "@/server/integrations/types";
import type { NormalizedAnnouncement, NormalizedCourse, NormalizedGrade, NormalizedTask } from "@/server/ingestion/types";

/**
 * Shared mock behaviour. Concrete providers extend this and override the
 * `real*` methods with live API calls; when `mockMode` is on (or a call is
 * not implemented for a provider) the mock dataset is returned instead.
 */
export abstract class BaseLmsProvider implements LmsProvider {
  abstract readonly name: ProviderName;
  abstract readonly label: string;
  abstract readonly connectionHelp: string;
  readonly supportsOAuth: boolean = false;

  constructor(protected readonly mockMode: boolean) {}

  async connect(input: ConnectInput): Promise<ConnectResult> {
    if (!input.baseUrl || !/^https?:\/\//i.test(input.baseUrl)) throw new IntegrationError("A valid LMS URL is required");
    if (this.mockMode) {
      return {
        credentials: { baseUrl: input.baseUrl.replace(/\/+$/, ""), accessToken: input.accessToken ?? "mock-token", externalUserId: "demo-student" },
        externalUserId: "demo-student",
        displayName: "Demo Student",
        scopes: ["read:courses", "read:assignments", "read:grades", "read:announcements"],
        tokenExpiresAt: null,
      };
    }
    if (!input.accessToken) throw new IntegrationError("An access token is required to connect");
    return this.realConnect(input);
  }

  async authenticate(creds: ProviderCredentials): Promise<ProviderCredentials> {
    return creds;
  }

  async disconnect(): Promise<void> {
    /* Tokens are deleted by the integration service; nothing to revoke remotely in mock mode. */
  }

  async syncCourses(creds: ProviderCredentials): Promise<NormalizedCourse[]> {
    if (this.mockMode) return mockDataset(this.name).courses;
    return this.realSyncCourses(creds);
  }

  async syncTasks(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedTask[]> {
    if (this.mockMode) return mockDataset(this.name).tasks;
    return this.realSyncTasks(creds, scope);
  }

  async syncAnnouncements(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedAnnouncement[]> {
    if (this.mockMode) return mockDataset(this.name).announcements;
    return this.realSyncAnnouncements(creds, scope);
  }

  async syncGrades(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedGrade[]> {
    if (this.mockMode) return mockDataset(this.name).grades;
    return this.realSyncGrades(creds, scope);
  }

  // ── Live implementations (override per provider) ──────────────
  protected async realConnect(input: ConnectInput): Promise<ConnectResult> {
    throw new IntegrationError(`${this.label} live connection to ${input.baseUrl} is not available yet. Enable LMS_MOCK_MODE for demo data.`);
  }
  protected async realSyncCourses(creds: ProviderCredentials): Promise<NormalizedCourse[]> {
    throw new IntegrationError(`${this.label} live sync (${creds.baseUrl}) is not available yet.`);
  }
  protected async realSyncTasks(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedTask[]> {
    void scope;
    throw new IntegrationError(`${this.label} live sync (${creds.baseUrl}) is not available yet.`);
  }
  protected async realSyncAnnouncements(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedAnnouncement[]> {
    void creds;
    void scope;
    return [];
  }
  protected async realSyncGrades(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedGrade[]> {
    void creds;
    void scope;
    return [];
  }
}
