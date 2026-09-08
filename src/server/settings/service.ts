import { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "@/server/notifications/service";
import { DEFAULT_STUDY_PREFERENCES } from "@/server/planner/service";
import { DEFAULT_PRIORITY_RULES } from "@/server/tasks/priority";

export const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).optional().or(z.literal("")),
  timezone: z.string().trim().min(1).max(64),
  institutionId: z.string().uuid().nullable().optional(),
  avatarUrl: z.string().trim().url().max(2048).optional().or(z.literal("")).nullable(),
});

export const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  defaultAssistanceMode: z.enum(["LEARNING", "GUIDED", "REVIEW"]).optional(),
  studyPreferences: z
    .object({
      preferredStartHour: z.number().int().min(0).max(23),
      preferredEndHour: z.number().int().min(1).max(24),
      sessionMinutes: z.number().int().min(15).max(180),
      breakMinutes: z.number().int().min(0).max(60),
      studyDays: z.array(z.number().int().min(0).max(6)).min(1),
      dailyMaxMinutes: z.number().int().min(30).max(720),
    })
    .partial()
    .optional(),
  notificationSettings: z.record(z.string(), z.object({ inApp: z.boolean(), email: z.boolean() })).optional(),
  priorityRules: z
    .object({
      deadlineWeight: z.number().min(0).max(1),
      workloadWeight: z.number().min(0).max(1),
      importanceWeight: z.number().min(0).max(1),
      overdueBoost: z.number().min(0).max(50),
    })
    .partial()
    .optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export async function getSettings(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      timezone: true,
      role: true,
      createdAt: true,
      institution: { select: { id: true, name: true, defaultLms: true } },
      preference: true,
      integrations: { select: { id: true, provider: true, status: true, baseUrl: true, isMock: true, lastSyncedAt: true, lastError: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      sessions: { where: { expiresAt: { gt: new Date() } }, select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastSeenAt: true }, orderBy: { lastSeenAt: "desc" } },
    },
  });
  if (!user) throw new NotFoundError("User");
  const pref = user.preference;
  return {
    profile: { email: user.email, firstName: user.firstName, lastName: user.lastName ?? "", avatarUrl: user.avatarUrl ?? "", timezone: user.timezone, institution: user.institution, memberSince: user.createdAt, role: user.role },
    preferences: {
      theme: pref?.theme ?? "system",
      weekStartsOn: pref?.weekStartsOn ?? 1,
      defaultAssistanceMode: pref?.defaultAssistanceMode ?? "GUIDED",
      studyPreferences: { ...DEFAULT_STUDY_PREFERENCES, ...((pref?.studyPreferences as object | null) ?? {}) },
      notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS, ...((pref?.notificationSettings as NotificationSettings | null) ?? {}) } as NotificationSettings,
      priorityRules: { ...DEFAULT_PRIORITY_RULES, ...((pref?.priorityRules as object | null) ?? {}) },
    },
    integrations: user.integrations,
    sessions: user.sessions,
  };
}

export type SettingsData = Awaited<ReturnType<typeof getSettings>>;

export async function updateProfile(userId: string, input: ProfileInput) {
  if (input.institutionId) {
    const inst = await db.institution.findUnique({ where: { id: input.institutionId }, select: { id: true } });
    if (!inst) throw new NotFoundError("Institution");
  }
  return db.user.update({
    where: { id: userId },
    data: {
      firstName: input.firstName,
      lastName: input.lastName || null,
      timezone: input.timezone,
      ...(input.institutionId !== undefined ? { institutionId: input.institutionId } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl || null } : {}),
    },
    select: { id: true, firstName: true, lastName: true, timezone: true, institutionId: true, avatarUrl: true },
  });
}

export async function updatePreferences(userId: string, input: PreferencesInput) {
  const existing = await db.userPreference.findUnique({ where: { userId } });
  const merged = {
    theme: input.theme ?? existing?.theme ?? "system",
    weekStartsOn: input.weekStartsOn ?? existing?.weekStartsOn ?? 1,
    defaultAssistanceMode: input.defaultAssistanceMode ?? existing?.defaultAssistanceMode ?? "GUIDED",
    studyPreferences: { ...((existing?.studyPreferences as object | null) ?? {}), ...(input.studyPreferences ?? {}) },
    notificationSettings: { ...((existing?.notificationSettings as object | null) ?? {}), ...(input.notificationSettings ?? {}) },
    priorityRules: { ...((existing?.priorityRules as object | null) ?? {}), ...(input.priorityRules ?? {}) },
  };
  return db.userPreference.upsert({ where: { userId }, update: merged, create: { userId, ...merged } });
}

export async function revokeSession(userId: string, sessionId: string) {
  await db.session.deleteMany({ where: { id: sessionId, userId } });
}

/** Soft-delete the account: anonymise the email so it can be reused, and end all sessions. */
export async function deleteAccount(userId: string) {
  await db.$transaction([
    db.session.deleteMany({ where: { userId } }),
    db.user.update({ where: { id: userId }, data: { deletedAt: new Date(), email: `deleted+${userId}@aihub.invalid`, passwordHash: null, firstName: "Deleted", lastName: null, avatarUrl: null } }),
  ]);
}
