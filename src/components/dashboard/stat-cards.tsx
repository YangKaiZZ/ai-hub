import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "danger" | "info" | "success";
  href: string;
}

const toneClasses: Record<Stat["tone"], { icon: string; bar: string }> = {
  brand: { icon: "bg-primary-soft text-brand-600 dark:text-brand-300", bar: "bg-primary" },
  danger: { icon: "bg-danger-soft text-danger", bar: "bg-danger" },
  info: { icon: "bg-info-soft text-info", bar: "bg-info" },
  success: { icon: "bg-success-soft text-success", bar: "bg-success" },
};

export function StatCards({ stats }: { stats: { dueThisWeek: number; highPriority: number; upcoming: number; completed: number; overdue: number; total: number } }) {
  const items: Stat[] = [
    { label: "Tasks due", value: stats.dueThisWeek, hint: stats.overdue > 0 ? `${stats.overdue} overdue` : "this week", icon: CalendarClock, tone: "brand", href: "/tasks?filter=week" },
    { label: "High priority", value: stats.highPriority, hint: "need attention", icon: Flame, tone: "danger", href: "/tasks?filter=high" },
    { label: "Upcoming", value: stats.upcoming, hint: "after this week", icon: AlertTriangle, tone: "info", href: "/tasks?filter=upcoming" },
    { label: "Completed", value: stats.completed, hint: stats.total ? `${Math.round((stats.completed / stats.total) * 100)}% of all tasks` : "so far", icon: CheckCircle2, tone: "success", href: "/tasks?filter=completed" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {items.map((s) => {
        const Icon = s.icon;
        const t = toneClasses[s.tone];
        return (
          <Link
            key={s.label}
            href={s.href}
            className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5"
          >
            <div className={cn("absolute inset-x-0 top-0 h-1 opacity-70", t.bar)} aria-hidden />
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-muted sm:text-sm">{s.label}</p>
              <span className={cn("inline-flex size-8 items-center justify-center rounded-lg", t.icon)}>
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{s.value}</p>
            <p className="mt-1 text-xs text-subtle">{s.hint}</p>
          </Link>
        );
      })}
    </div>
  );
}
