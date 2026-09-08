import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { requirePageUser } from "@/lib/auth/guards";
import { listLmsProviders } from "@/server/integrations/registry";
import { listIntegrations } from "@/server/integrations/service";
import { getSettings } from "@/server/settings/service";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  const [settings, integrations] = await Promise.all([getSettings(user.id), listIntegrations(user.id)]);
  const providers = listLmsProviders();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your profile, study preferences, notifications, connected platforms and security." />
      <Suspense>
        <SettingsView settings={settings} providers={providers} integrations={integrations} />
      </Suspense>
    </div>
  );
}
