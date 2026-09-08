import { z } from "zod";
import { COURSE_COLORS, COURSE_ICONS } from "@/server/courses/schemas";

export const onboardingStepSchema = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("profile"),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().max(60).optional().or(z.literal("")),
    timezone: z.string().max(64).optional(),
  }),
  z.object({
    step: z.literal("institution"),
    institutionId: z.string().uuid().nullable(),
  }),
  z.object({
    step: z.literal("platform"),
    platform: z.enum(["CANVAS", "MOODLE", "BLACKBOARD", "OTHER", "MANUAL"]),
  }),
  z.object({
    step: z.literal("courses"),
    courses: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          code: z.string().trim().max(32).optional().or(z.literal("")),
          instructor: z.string().trim().max(120).optional().or(z.literal("")),
          color: z.enum(COURSE_COLORS).optional(),
          icon: z.enum(COURSE_ICONS).optional(),
        }),
      )
      .max(12),
  }),
  z.object({
    step: z.literal("preferences"),
    preferredStartHour: z.coerce.number().int().min(0).max(23),
    preferredEndHour: z.coerce.number().int().min(1).max(24),
    sessionMinutes: z.coerce.number().int().min(15).max(180),
    studyDays: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
    dailyMaxMinutes: z.coerce.number().int().min(30).max(720),
    defaultAssistanceMode: z.enum(["LEARNING", "GUIDED", "REVIEW"]),
  }),
]);

export type OnboardingStepInput = z.infer<typeof onboardingStepSchema>;

export const STEP_ORDER = ["profile", "institution", "platform", "courses", "preferences", "done"] as const;
export type OnboardingStepName = (typeof STEP_ORDER)[number];
