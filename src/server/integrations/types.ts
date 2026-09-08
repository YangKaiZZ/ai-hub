import type { IntegrationProvider as ProviderName } from "@/generated/prisma/enums";
import type { NormalizedAnnouncement, NormalizedCourse, NormalizedGrade, NormalizedTask } from "@/server/ingestion/types";

/**
 * Credentials handed to a provider for one sync. Tokens are decrypted just-in-
 * time by the integration service and never logged. Raw LMS passwords are never
 * accepted anywhere in this layer.
 */
export interface ProviderCredentials {
  baseUrl: string;
  accessToken?: string;
  refreshToken?: string;
  externalUserId?: string;
}

export interface ConnectInput {
  baseUrl: string;
  /** Personal access token / API token issued by the LMS to the student. */
  accessToken?: string;
  /** OAuth authorization code when the provider supports OAuth. */
  authorizationCode?: string;
}

export interface ConnectResult {
  credentials: ProviderCredentials;
  externalUserId: string;
  displayName?: string;
  scopes?: string[];
  tokenExpiresAt?: Date | null;
}

export interface SyncScope {
  since?: Date | null;
}

export interface LmsProvider {
  readonly name: ProviderName;
  readonly label: string;
  /** How students obtain credentials (shown in the UI). */
  readonly connectionHelp: string;
  readonly supportsOAuth: boolean;
  /** Validate credentials against the LMS and resolve the student identity. */
  connect(input: ConnectInput): Promise<ConnectResult>;
  /** Refresh tokens if needed; return updated credentials or the same ones. */
  authenticate(creds: ProviderCredentials): Promise<ProviderCredentials>;
  disconnect(creds: ProviderCredentials): Promise<void>;
  syncCourses(creds: ProviderCredentials): Promise<NormalizedCourse[]>;
  syncTasks(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedTask[]>;
  syncAnnouncements(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedAnnouncement[]>;
  syncGrades(creds: ProviderCredentials, scope: SyncScope): Promise<NormalizedGrade[]>;
}
