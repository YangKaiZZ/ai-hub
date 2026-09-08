import type { DataSource, TaskType } from "@/generated/prisma/enums";

/**
 * The canonical shape every ingestion adapter (LMS, CSV, calendar, email, API,
 * browser extension) normalizes into before tasks are analyzed and stored.
 */
export interface NormalizedTask {
  /** Stable identifier in the source system; used for idempotent upserts. */
  externalId: string;
  source: DataSource;
  institution?: string | null;
  course?: { externalId?: string | null; name: string; code?: string | null } | null;
  title: string;
  description?: string | null;
  instructions?: string | null;
  rubric?: { criterion: string; points?: number; description?: string }[] | null;
  type?: TaskType | null;
  dueDate?: Date | null;
  startDate?: Date | null;
  attachments?: { name: string; url?: string | null; mimeType?: string | null; sizeBytes?: number | null }[];
  url?: string | null;
  instructor?: string | null;
  pointsPossible?: number | null;
  /** Untouched source payload, stored for debugging / re-analysis. */
  rawData?: unknown;
}

export interface NormalizedCourse {
  externalId: string;
  source: DataSource;
  name: string;
  code?: string | null;
  instructor?: string | null;
  instructorEmail?: string | null;
  term?: string | null;
  url?: string | null;
  rawData?: unknown;
}

export interface NormalizedGrade {
  externalId: string;
  source: DataSource;
  courseExternalId: string;
  taskExternalId?: string | null;
  title: string;
  score: number;
  maxScore: number;
  gradedAt?: Date | null;
  category?: string | null;
}

export interface NormalizedAnnouncement {
  externalId: string;
  source: DataSource;
  courseExternalId: string;
  title: string;
  body: string;
  postedAt: Date;
  url?: string | null;
}

export interface IngestionResult {
  coursesCreated: number;
  coursesUpdated: number;
  tasksCreated: number;
  tasksUpdated: number;
  gradesImported: number;
  announcementsImported: number;
  errors: string[];
}
