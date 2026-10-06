import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { BuildingsIcon, ChatsCircleIcon, CheckCircleIcon, DatabaseIcon, PlugIcon, PulseIcon, UsersIcon, WarningIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { InstitutionVerifyToggle } from "@/components/admin/institution-verify-toggle";
import { requirePageUser } from "@/lib/auth/guards";
import { isDemoEmail } from "@/lib/demo";
import { formatRelative } from "@/lib/utils";
import { getAdminOverview, listAdminInstitutions } from "@/server/admin/service";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await requirePageUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  const [overview, institutions] = await Promise.all([getAdminOverview({ redactPeople: isDemoEmail(user.email) }), listAdminInstitutions()]);

  const stat = (label: string, value: string | number, hint?: string, icon?: React.ReactNode) => (
    <div key={label} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span className="text-subtle [&_svg]:size-4">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="System" title="Admin" description="Users, institutions, integrations, AI usage and health. Aggregates only — no student content." />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stat("Users", overview.counts.users, `${overview.counts.activeUsers7} active this week`, <UsersIcon />)}
        {stat("New users (30d)", overview.counts.newUsers30, undefined, <UsersIcon />)}
        {stat("Institutions", overview.counts.institutions, undefined, <BuildingsIcon />)}
        {stat("Tasks", overview.counts.tasks, `${overview.counts.documents} documents · ${overview.counts.conversations} conversations`, <PulseIcon />)}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <DatabaseIcon className="size-4" /> System health
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span>Database</span>
              <Badge variant={overview.health.database ? "success" : "danger"}>{overview.health.database ? "connected" : "down"}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>AI provider</span>
              <Badge variant={overview.ai.healthy ? "success" : "danger"}>
                {overview.ai.provider} · {overview.ai.model}
              </Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>Storage</span>
              <Badge>{overview.health.storage}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>Errors (24h)</span>
              <Badge variant={overview.health.errors24h ? "warning" : "success"}>{overview.health.errors24h}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>Environment</span>
              <Badge variant="outline">{overview.health.environment}</Badge>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ChatsCircleIcon className="size-4" /> AI usage (7 days)
          </h2>
          <p className="mt-3 text-2xl font-semibold tabular-nums">{overview.ai.requests7.toLocaleString()} requests</p>
          <p className="text-xs text-subtle">
            {overview.ai.inputTokens7.toLocaleString()} in · {overview.ai.outputTokens7.toLocaleString()} out · avg {overview.ai.avgLatencyMs} ms · {overview.ai.failed7} failed
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {overview.ai.byFeature.map((f) => (
              <li key={f.feature} className="flex items-center justify-between">
                <span className="capitalize">{f.feature.replace("-", " ")}</span>
                <span className="tabular-nums text-muted">
                  {f.requests} · {(f.inputTokens + f.outputTokens).toLocaleString()} tok
                </span>
              </li>
            ))}
            {overview.ai.byFeature.length === 0 ? <li className="text-muted">No AI requests yet.</li> : null}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <PlugIcon className="size-4" /> Integration providers
          </h2>
          {overview.integrations.mockMode ? <p className="mt-2 text-xs text-warning">LMS_MOCK_MODE is on — providers return demo data.</p> : null}
          <ul className="mt-3 space-y-2 text-sm">
            {overview.integrations.providers.map((p) => {
              const conns = overview.integrations.connections.filter((c) => c.provider === p.name);
              const connected = conns.filter((c) => c.status === "CONNECTED").reduce((s, c) => s + c.count, 0);
              const errored = conns.filter((c) => c.status === "ERROR").reduce((s, c) => s + c.count, 0);
              return (
                <li key={p.name} className="flex items-center justify-between">
                  <span>{p.label}</span>
                  <span className="text-xs text-muted">
                    {connected} connected{errored ? ` · ${errored} error` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface shadow-sm">
          <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">Recent users</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-5 py-2 font-semibold">User</th>
                  <th className="px-3 py-2 font-semibold">Institution</th>
                  <th className="px-3 py-2 font-semibold">Joined</th>
                  <th className="px-3 py-2 font-semibold">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.recentUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-2">
                      <p className="font-medium">
                        {u.firstName} {u.lastName ?? ""} {u.role === "ADMIN" ? <Badge variant="brand">admin</Badge> : null}
                      </p>
                      <p className="text-xs text-subtle">{u.email}</p>
                    </td>
                    <td className="px-3 py-2 text-muted">{u.institution?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{format(u.createdAt, "MMM d")}</td>
                    <td className="px-3 py-2 text-muted">{u.lastActiveAt ? formatRelative(u.lastActiveAt) : u.onboardingCompletedAt ? "—" : "onboarding"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface shadow-sm">
          <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">Recent system events</h2>
          {overview.recentEvents.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted">
              <CheckCircleIcon className="size-4 text-success" /> No events logged.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {overview.recentEvents.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                  {e.level === "ERROR" ? <WarningIcon className="mt-0.5 size-4 text-danger" /> : <PulseIcon className="mt-0.5 size-4 text-subtle" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{e.message}</p>
                    <p className="text-xs text-subtle">
                      {e.area} · {formatRelative(e.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">Institutions</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-5 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Country</th>
                <th className="px-3 py-2 font-semibold">Default LMS</th>
                <th className="px-3 py-2 font-semibold">Users</th>
                <th className="px-3 py-2 font-semibold">Courses</th>
                <th className="px-3 py-2 font-semibold">Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {institutions.map((i) => (
                <tr key={i.id}>
                  <td className="px-5 py-2">
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-subtle">
                      {i.slug}
                      {i.isUserCreated ? " · user-created" : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-muted">{i.country ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{i.defaultLms ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{i._count.users}</td>
                  <td className="px-3 py-2 tabular-nums">{i._count.courses}</td>
                  <td className="px-3 py-2">
                    <InstitutionVerifyToggle id={i.id} verified={i.isVerified} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
