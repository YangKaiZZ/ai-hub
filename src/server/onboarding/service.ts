import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { COURSE_COLORS, COURSE_ICONS } from "@/server/courses/schemas";
import { STEP_ORDER, type OnboardingStepInput } from "@/server/onboarding/schemas";
import { notify } from "@/server/notifications/service";

export async function getOnboardingState(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      timezone: true,
      onboardingStep: true,
      onboardingCompletedAt: true,
      institution: { select: { id: true, name: true, defaultLms: true } },
      preference: { select: { studyPreferences: true, defaultAssistanceMode: true } },
      integrations: { select: { provider: true, status: true }, take: 1 },
      courses: { where: { deletedAt: null }, select: { id: true, name: true, code: true, instructor: true, color: true, icon: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!user) throw new NotFoundError("User");
  return {
    ...user,
    stepName: STEP_ORDER[Math.min(user.onboardingStep, STEP_ORDER.length - 1)] ?? "profile",
  };
}

export async function saveOnboardingStep(userId: string, input: OnboardingStepInput) {
  const stepIndex = STEP_ORDER.indexOf(input.step);

  switch (input.step) {
    case "profile":
      await db.user.update({
        where: { id: userId },
        data: { firstName: input.firstName, lastName: input.lastName || null, ...(input.timezone ? { timezone: input.timezone } : {}) },
      });
      break;

    case "institution": {
      if (input.institutionId) {
        const exists = await db.institution.findUnique({ where: { id: input.institutionId }, select: { id: true } });
        if (!exists) throw new NotFoundError("Institution");
      }
      await db.user.update({ where: { id: userId }, data: { institutionId: input.institutionId } });
      break;
    }

    case "platform": {
      // Record intent only; actual connection happens in Settings → Integrations
      // (or immediately after onboarding). MANUAL/OTHER create no record.
      if (input.platform === "CANVAS" || input.platform === "MOODLE" || input.platform === "BLACKBOARD") {
        await db.integration.upsert({
          where: { userId_provider_baseUrl: { userId, provider: input.platform, baseUrl: "" } },
          update: {},
          create: { userId, provider: input.platform, status: "PENDING", baseUrl: "" },
        });
      }
      break;
    }

    case "courses": {
      const user = await db.user.findUnique({ where: { id: userId }, select: { institutionId: true } });
      for (const [i, c] of input.courses.entries()) {
        const dup = await db.course.findFirst({ where: { userId, deletedAt: null, name: { equals: c.name, mode: "insensitive" } }, select: { id: true } });
        if (dup) continue;
        await db.course.create({
          data: {
            userId,
            institutionId: user?.institutionId ?? null,
            name: c.name,
            code: c.code || null,
            instructor: c.instructor || null,
            color: c.color ?? COURSE_COLORS[i % COURSE_COLORS.length]!,
            icon: c.icon ?? COURSE_ICONS[i % COURSE_ICONS.length]!,
            enrollments: { create: { userId } },
          },
        });
      }
      break;
    }

    case "preferences":
      await db.userPreference.upsert({
        where: { userId },
        update: {
          defaultAssistanceMode: input.defaultAssistanceMode,
          studyPreferences: {
            preferredStartHour: input.preferredStartHour,
            preferredEndHour: input.preferredEndHour,
            sessionMinutes: input.sessionMinutes,
            breakMinutes: 10,
            studyDays: input.studyDays,
            dailyMaxMinutes: input.dailyMaxMinutes,
          },
        },
        create: {
          userId,
          defaultAssistanceMode: input.defaultAssistanceMode,
          studyPreferences: {
            preferredStartHour: input.preferredStartHour,
            preferredEndHour: input.preferredEndHour,
            sessionMinutes: input.sessionMinutes,
            breakMinutes: 10,
            studyDays: input.studyDays,
            dailyMaxMinutes: input.dailyMaxMinutes,
          },
        },
      });
      break;
  }

  // Advance the saved step pointer (never move it backwards).
  await db.user.updateMany({ where: { id: userId, onboardingStep: { lt: stepIndex + 1 } }, data: { onboardingStep: stepIndex + 1 } });
  return getOnboardingState(userId);
}

export async function completeOnboarding(userId: string) {
  const user = await db.user.update({
    where: { id: userId },
    data: { onboardingCompletedAt: new Date(), onboardingStep: STEP_ORDER.length - 1 },
    select: { id: true, firstName: true },
  });
  await notify(userId, "SYSTEM", `Welcome to AI Hub, ${user.firstName}!`, "Your hub is ready. Add tasks or connect your LMS to start getting recommendations.", { href: "/dashboard" });
  return user;
}
