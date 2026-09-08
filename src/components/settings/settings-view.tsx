"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, Check, KeyRound, Link2, Loader2, LogOut, Plug, RefreshCw, Trash2, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { useTheme } from "@/components/theme-provider";
import { ApiClientError, api, apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { cn, formatRelative } from "@/lib/utils";
import type { SettingsData } from "@/server/settings/service";

interface ProviderInfo {
  name: string;
  label: string;
  connectionHelp: string;
  supportsOAuth: boolean;
  mock: boolean;
}

interface Props {
  settings: SettingsData;
  providers: ProviderInfo[];
  integrations: Array<SettingsData["integrations"][number] & { syncLogs?: { id: string; status: string; startedAt: Date; tasksImported: number; tasksUpdated: number; coursesImported: number; error: string | null }[] }>;
  currentSessionHint?: string;
}

export function SettingsView({ settings, providers, integrations }: Props) {
  const params = useSearchParams();
  const tab = params.get("tab") ?? "profile";
  return (
    <Tabs defaultValue={tab}>
      <TabsList variant="underline" className="w-full">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="preferences">Preferences</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>
      <TabsContent value="profile">
        <ProfileTab profile={settings.profile} />
      </TabsContent>
      <TabsContent value="preferences">
        <PreferencesTab preferences={settings.preferences} />
      </TabsContent>
      <TabsContent value="notifications">
        <NotificationsTab settings={settings.preferences.notificationSettings} />
      </TabsContent>
      <TabsContent value="integrations">
        <IntegrationsTab providers={providers} integrations={integrations} />
      </TabsContent>
      <TabsContent value="security">
        <SecurityTab sessions={settings.sessions} email={settings.profile.email} />
      </TabsContent>
    </Tabs>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ProfileTab({ profile }: { profile: SettingsData["profile"] }) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const timezones = React.useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return ["UTC", "Asia/Manila", "America/New_York", "Europe/London"];
    }
  }, []);
  const [tz, setTz] = React.useState(profile.timezone);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const f = new FormData(e.currentTarget);
    try {
      await apiPatch("/api/settings/profile", { firstName: f.get("firstName"), lastName: f.get("lastName"), timezone: tz, avatarUrl: f.get("avatarUrl") || null });
      toast.success("Profile updated");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) setErrors(err.details);
      else toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Profile" description="How you appear across AI Hub.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="firstName" label="First name" required error={errors.firstName}>
              <Input name="firstName" defaultValue={profile.firstName} />
            </Field>
            <Field id="lastName" label="Last name" error={errors.lastName}>
              <Input name="lastName" defaultValue={profile.lastName} />
            </Field>
          </div>
          <Field id="email" label="Email" hint="Contact support to change your email.">
            <Input value={profile.email} readOnly disabled />
          </Field>
          <Field id="timezone" label="Timezone" error={errors.timezone}>
            <Select value={tz} onValueChange={setTz}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timezones.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="avatarUrl" label="Avatar URL" hint="Optional image URL." error={errors.avatarUrl}>
            <Input name="avatarUrl" defaultValue={profile.avatarUrl} placeholder="https://" />
          </Field>
          <div className="flex items-center justify-between">
            <p className="text-xs text-subtle">
              Institution: {profile.institution?.name ?? "Not set"} · Member since {format(profile.memberSince, "MMM yyyy")}
            </p>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );
}

function PreferencesTab({ preferences }: { preferences: SettingsData["preferences"] }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = React.useState(false);
  const [mode, setMode] = React.useState(preferences.defaultAssistanceMode);
  const [sp, setSp] = React.useState(preferences.studyPreferences);
  const [rules, setRules] = React.useState(preferences.priorityRules);

  async function save() {
    setSaving(true);
    try {
      await apiPatch("/api/settings/preferences", { theme, defaultAssistanceMode: mode, studyPreferences: sp, priorityRules: { deadlineWeight: rules.deadlineWeight, workloadWeight: rules.workloadWeight, importanceWeight: rules.importanceWeight, overdueBoost: rules.overdueBoost } });
      toast.success("Preferences saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const weightsTotal = Math.round((rules.deadlineWeight + rules.workloadWeight + rules.importanceWeight) * 100);

  return (
    <div className="space-y-6">
      <Section title="Appearance">
        <div className="grid grid-cols-3 gap-2 sm:max-w-sm">
          {(["light", "dark", "system"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTheme(t)} aria-pressed={theme === t} className={cn("rounded-xl border px-3 py-3 text-sm font-medium capitalize transition", theme === t ? "border-brand-400 bg-primary-soft" : "border-border hover:bg-surface-muted")}>
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="AI assistance" description="The default mode for new tutor conversations and workspaces.">
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["LEARNING", "Learning", "Hints first, answers after you try."],
              ["GUIDED", "Guided", "Step-by-step explanations."],
              ["REVIEW", "Review", "Feedback on your own work."],
            ] as const
          ).map(([v, label, hint]) => (
            <button key={v} type="button" onClick={() => setMode(v)} aria-pressed={mode === v} className={cn("rounded-xl border p-4 text-left transition", mode === v ? "border-brand-400 bg-primary-soft" : "border-border hover:bg-surface-muted")}>
              <p className="text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs text-muted">{hint}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Study habits" description="Used by the Study Planner and the AI agent.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="sp-start" label="Start hour">
            <Input type="number" min={0} max={23} value={sp.preferredStartHour} onChange={(e) => setSp({ ...sp, preferredStartHour: Number(e.target.value) })} />
          </Field>
          <Field id="sp-end" label="End hour">
            <Input type="number" min={1} max={24} value={sp.preferredEndHour} onChange={(e) => setSp({ ...sp, preferredEndHour: Number(e.target.value) })} />
          </Field>
          <Field id="sp-session" label="Session (min)">
            <Input type="number" min={15} max={180} step={5} value={sp.sessionMinutes} onChange={(e) => setSp({ ...sp, sessionMinutes: Number(e.target.value) })} />
          </Field>
          <Field id="sp-break" label="Break (min)">
            <Input type="number" min={0} max={60} step={5} value={sp.breakMinutes} onChange={(e) => setSp({ ...sp, breakMinutes: Number(e.target.value) })} />
          </Field>
          <Field id="sp-max" label="Max per day (min)">
            <Input type="number" min={30} max={720} step={15} value={sp.dailyMaxMinutes} onChange={(e) => setSp({ ...sp, dailyMaxMinutes: Number(e.target.value) })} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="mb-1.5 text-sm font-medium">Study days</p>
            <div className="flex flex-wrap gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => {
                const on = sp.studyDays.includes(i);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => setSp({ ...sp, studyDays: on ? sp.studyDays.filter((x) => x !== i) : [...sp.studyDays, i].sort() })} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition", on ? "border-primary bg-primary text-white" : "border-border text-muted")}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Priority rules" description="How AI Hub ranks your tasks. Weights are relative; the total should be about 100%.">
        <div className="grid gap-5 sm:grid-cols-2">
          {(
            [
              ["deadlineWeight", "Deadline proximity"],
              ["workloadWeight", "Remaining workload"],
              ["importanceWeight", "Importance"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-1 flex justify-between text-sm">
                <label htmlFor={`rule-${key}`}>{label}</label>
                <span className="tabular-nums text-muted">{Math.round(rules[key] * 100)}%</span>
              </div>
              <input id={`rule-${key}`} type="range" min={0} max={1} step={0.05} value={rules[key]} onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
            </div>
          ))}
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <label htmlFor="rule-overdue">Overdue boost</label>
              <span className="tabular-nums text-muted">+{rules.overdueBoost} pts</span>
            </div>
            <input id="rule-overdue" type="range" min={0} max={50} step={5} value={rules.overdueBoost} onChange={(e) => setRules({ ...rules, overdueBoost: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
          </div>
        </div>
        <p className={cn("mt-3 text-xs", Math.abs(weightsTotal - 100) <= 5 ? "text-success" : "text-warning")}>Weights total {weightsTotal}%</p>
      </Section>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          Save preferences
        </Button>
      </div>
    </div>
  );
}

function NotificationsTab({ settings }: { settings: SettingsData["preferences"]["notificationSettings"] }) {
  const router = useRouter();
  const [state, setState] = React.useState(settings);
  const [saving, setSaving] = React.useState(false);
  const labels: Record<string, string> = {
    newTask: "New task imported",
    deadlineApproaching: "Deadline approaching",
    overdue: "Task overdue",
    aiRecommendation: "AI recommendations",
    studySession: "Study session reminders",
    gradeUpdate: "Grade updates",
    system: "System messages",
  };

  async function save() {
    setSaving(true);
    try {
      await apiPatch("/api/settings/preferences", { notificationSettings: state });
      toast.success("Notification settings saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Notifications" description="Choose what you hear about, and where. Email delivery uses the configured provider.">
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[1fr_5rem_5rem] bg-surface-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-subtle">
            <span>Type</span>
            <span className="text-center">In-app</span>
            <span className="text-center">Email</span>
          </div>
          {Object.keys(labels).map((key) => {
            const row = state[key] ?? { inApp: true, email: false };
            return (
              <div key={key} className="grid grid-cols-[1fr_5rem_5rem] items-center border-t border-border px-4 py-3 text-sm">
                <span>{labels[key]}</span>
                <span className="flex justify-center">
                  <Switch checked={row.inApp} onCheckedChange={(v) => setState({ ...state, [key]: { ...row, inApp: v } })} aria-label={`${labels[key]} in-app`} />
                </span>
                <span className="flex justify-center">
                  <Switch checked={row.email} onCheckedChange={(v) => setState({ ...state, [key]: { ...row, email: v } })} aria-label={`${labels[key]} email`} />
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </div>
      </Section>
    </div>
  );
}

function IntegrationsTab({ providers, integrations }: { providers: ProviderInfo[]; integrations: Props["integrations"] }) {
  const router = useRouter();
  const [provider, setProvider] = React.useState(providers[0]?.name ?? "CANVAS");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [token, setToken] = React.useState("");
  const [connecting, setConnecting] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const info = providers.find((p) => p.name === provider);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    try {
      await apiPost("/api/integrations", { provider, baseUrl, accessToken: token || undefined });
      toast.success(`${info?.label ?? provider} connected`);
      setToken("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setConnecting(false);
    }
  }

  async function act(id: string, action: "sync" | "disconnect" | "delete") {
    setBusy(id);
    try {
      if (action === "delete") {
        if (!window.confirm("Remove this integration? Imported tasks stay in AI Hub.")) return;
        await apiDelete(`/api/integrations/${id}`);
        toast.success("Integration removed");
      } else {
        const res = await apiPost<{ result?: { tasksCreated: number; tasksUpdated: number; coursesCreated: number } }>(`/api/integrations/${id}`, { action });
        if (action === "sync" && res.result) toast.success(`Synced: ${res.result.coursesCreated} new courses, ${res.result.tasksCreated} new tasks, ${res.result.tasksUpdated} updated`);
        else toast.success("Disconnected");
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {info?.mock ? (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm text-amber-900 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>Demo mode.</strong> LMS connections currently return realistic sample data instead of contacting your school. Set <code className="rounded bg-black/10 px-1">LMS_MOCK_MODE=false</code> with real credentials to sync live.
          </p>
        </div>
      ) : null}

      <Section title="Connected platforms" description="AI Hub only stores encrypted access tokens — never your school password.">
        {integrations.length === 0 ? (
          <p className="text-sm text-muted">No platforms connected yet.</p>
        ) : (
          <ul className="space-y-3">
            {integrations.map((i) => (
              <li key={i.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary-soft text-brand-600 dark:text-brand-300">
                      <Plug className="size-5" />
                    </span>
                    <div>
                      <p className="flex items-center gap-2 font-semibold">
                        {providers.find((p) => p.name === i.provider)?.label ?? i.provider}
                        <Badge variant={i.status === "CONNECTED" ? "success" : i.status === "ERROR" ? "danger" : "default"}>{i.status.toLowerCase()}</Badge>
                        {i.isMock ? <Badge variant="warning">demo</Badge> : null}
                      </p>
                      <p className="text-xs text-muted">{i.baseUrl || "Pending setup"}</p>
                      <p className="text-xs text-subtle">{i.lastSyncedAt ? `Last synced ${formatRelative(i.lastSyncedAt)}` : "Never synced"}</p>
                      {i.lastError ? <p className="mt-1 text-xs text-danger">{i.lastError}</p> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {i.status !== "DISCONNECTED" && i.baseUrl ? (
                      <Button size="sm" onClick={() => act(i.id, "sync")} loading={busy === i.id}>
                        <RefreshCw /> Sync now
                      </Button>
                    ) : null}
                    {i.status === "CONNECTED" ? (
                      <Button size="sm" variant="outline" onClick={() => act(i.id, "disconnect")} disabled={busy === i.id}>
                        <Unplug /> Disconnect
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => act(i.id, "delete")} disabled={busy === i.id} aria-label="Remove integration">
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {i.syncLogs?.length ? (
                  <ul className="mt-3 space-y-1 text-xs text-muted">
                    {i.syncLogs.slice(0, 3).map((l) => (
                      <li key={l.id} className="flex items-center gap-2">
                        {l.status === "RUNNING" ? <Loader2 className="size-3 animate-spin" /> : l.status === "FAILED" ? <AlertTriangle className="size-3 text-danger" /> : <Check className="size-3 text-success" />}
                        {format(l.startedAt, "MMM d, h:mm a")} · {l.coursesImported} courses · {l.tasksImported} new / {l.tasksUpdated} updated tasks
                        {l.error ? ` · ${l.error.split("\n")[0]}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Connect a platform" description="Import courses, assignments, grades and announcements automatically.">
        <form onSubmit={connect} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="int-provider" label="Platform">
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="int-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="int-url" label="Platform URL" required>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://myschool.instructure.com" leftIcon={<Link2 />} />
            </Field>
          </div>
          <Field id="int-token" label="Access token" hint={info?.connectionHelp} required={!info?.mock}>
            <Input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" placeholder={info?.mock ? "Optional in demo mode" : "Paste your token"} leftIcon={<KeyRound />} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={connecting} disabled={!baseUrl}>
              <Plug /> Connect
            </Button>
          </div>
        </form>
      </Section>

      <CsvImportSection />
    </div>
  );
}

function CsvImportSection() {
  const router = useRouter();
  const [csv, setCsv] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try {
      const res = await apiPost<{ tasksCreated: number; tasksUpdated: number; skipped: { row: number; reason: string }[] }>("/api/tasks/import", { csv, analyze: false });
      toast.success(`Imported ${res.tasksCreated} new tasks (${res.tasksUpdated} updated, ${res.skipped.length} skipped)`);
      setCsv("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Import from CSV" description="Columns: title, course, type, due, description, estimated_minutes, url. Matching course names attach to existing courses.">
      <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} placeholder={"title,course,type,due,estimated_minutes\nProblem Set 5,Calculus,assignment,2026-03-14 08:00,90"} className="font-mono text-xs" />
      <div className="mt-3 flex justify-end">
        <Button onClick={run} loading={busy} disabled={!csv.trim()}>
          Import tasks
        </Button>
      </div>
    </Section>
  );
}

function SecurityTab({ sessions, email }: { sessions: SettingsData["sessions"]; email: string }) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    try {
      await apiPost("/api/auth/change-password", { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") });
      toast.success("Password updated");
      form.reset();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) setErrors(err.details);
      else toast.error(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id: string) {
    try {
      await apiDelete(`/api/settings/sessions/${id}`);
      toast.success("Session signed out");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke session");
    }
  }

  async function deleteAccount() {
    if (!window.confirm("This permanently deactivates your account. Continue?")) return;
    setDeleting(true);
    try {
      await api("/api/settings/account", { method: "DELETE", json: { confirm: confirmText } });
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete account");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Change password">
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field id="currentPassword" label="Current password" required error={errors.currentPassword}>
            <Input name="currentPassword" type="password" autoComplete="current-password" />
          </Field>
          <Field id="newPassword" label="New password" required hint="At least 8 characters with a letter and a number." error={errors.newPassword}>
            <Input name="newPassword" type="password" autoComplete="new-password" />
          </Field>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" loading={saving}>
              Update password
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Active sessions" description="Devices currently signed in to your account.">
        <ul className="divide-y divide-border rounded-xl border border-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{describeAgent(s.userAgent)}</p>
                <p className="text-xs text-subtle">
                  {s.ipAddress ?? "unknown IP"} · active {formatRelative(s.lastSeenAt)} · signed in {format(s.createdAt, "MMM d")}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}>
                <LogOut /> Sign out
              </Button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Delete account" description="Deactivates your account and signs you out everywhere. Your data is retained for 30 days for recovery, then removed.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field id="confirm-delete" label={`Type ${email} to confirm`} className="flex-1">
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </Field>
          <Button variant="danger" disabled={confirmText !== email} loading={deleting} onClick={deleteAccount}>
            <Trash2 /> Delete account
          </Button>
        </div>
      </Section>
    </div>
  );
}

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" on ");
}
