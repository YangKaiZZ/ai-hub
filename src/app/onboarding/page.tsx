import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { requirePageUser } from "@/lib/auth/guards";
import { getOnboardingState } from "@/server/onboarding/service";

export const metadata: Metadata = { title: "Set up your hub" };

export default async function OnboardingPage() {
  const user = await requirePageUser({ allowIncompleteOnboarding: true });
  if (user.onboardingCompletedAt) redirect("/dashboard");
  const state = await getOnboardingState(user.id);

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
        <Logo />
        <span className="text-xs text-subtle">Signed in as {user.email}</span>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-4">
        <OnboardingWizard
          initial={{
            stepName: state.stepName,
            firstName: state.firstName,
            lastName: state.lastName ?? "",
            timezone: state.timezone,
            institution: state.institution,
            platform: state.integrations[0]?.provider ?? null,
            courses: state.courses,
            preferences: (state.preference?.studyPreferences as Record<string, unknown> | null) ?? null,
            assistanceMode: state.preference?.defaultAssistanceMode ?? "GUIDED",
          }}
        />
      </main>
    </div>
  );
}
