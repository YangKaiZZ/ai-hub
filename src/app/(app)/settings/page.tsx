import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { requirePageUser } from "@/lib/auth/guards";
import { listLmsProviders } from "@/server/integrations/registry";
import { listIntegrations } from "@/server/integrations/service";
import { getSettings } from "@/server/settings/service";

export const metadata: Metadata = { title: "Settings" };

const TABS = ["profile", "preferences", "notifications", "integrations", "security"] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const { tab } = await searchParams;
  const [settings, integrations] = await Promise.all([getSettings(user.id), listIntegrations(user.id)]);
  const providers = listLmsProviders();
  const initialTab = (TABS as readonly string[]).includes(tab ?? "") ? (tab as (typeof TABS)[number]) : "profile";

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your profile, study preferences, notifications, connected platforms and security." />
      <SettingsView settings={settings} providers={providers} integrations={integrations} initialTab={initialTab} />
    </div>
  );
}
