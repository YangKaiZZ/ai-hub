"use client";

import * as React from "react";
import Link from "next/link";
import { BellIcon, CalendarDotsIcon, ChecksIcon, ExamIcon, InfoIcon, LightbulbIcon, ListPlusIcon, WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiGet, apiPost } from "@/lib/client/api";
import { formatRelative } from "@/lib/utils";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: { href?: string } | null;
  readAt: string | null;
  createdAt: string;
}

const iconFor: Record<string, React.ComponentType<{ className?: string }>> = {
  NEW_TASK: ListPlusIcon,
  DEADLINE_APPROACHING: CalendarDotsIcon,
  OVERDUE_TASK: WarningIcon,
  AI_RECOMMENDATION: LightbulbIcon,
  STUDY_SESSION: CalendarDotsIcon,
  GRADE_UPDATE: ExamIcon,
  SYSTEM: InfoIcon,
};

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = React.useState(initialUnread);
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open || items) return;
    apiGet<{ items: NotificationItem[]; unread: number }>("/api/notifications")
      .then((res) => {
        setItems(res.items);
        setUnread(res.unread);
      })
      .catch(() => setItems([]));
  }, [open, items]);

  async function markAll() {
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    setUnread(0);
    try {
      await apiPost("/api/notifications/read", { all: true });
    } catch {
      /* optimistic; ignore */
    }
  }

  async function markOne(id: string) {
    setItems((prev) => prev?.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)) ?? null);
    setUnread((u) => Math.max(0, u - 1));
    try {
      await apiPost("/api/notifications/read", { id });
    } catch {
      /* ignore */
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <BellIcon />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="xs" onClick={markAll} disabled={unread === 0}>
            <ChecksIcon /> Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {items === null ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-12" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">You are all caught up.</div>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = iconFor[n.type] ?? InfoIcon;
                const href = n.data?.href;
                const inner = (
                  <div className={`flex gap-3 px-4 py-3 transition hover:bg-surface-muted ${n.readAt ? "opacity-70" : ""}`}>
                    <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-brand-600 dark:text-brand-300">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      {n.body ? <p className="line-clamp-2 text-xs text-muted">{n.body}</p> : null}
                      <p className="mt-0.5 text-[11px] text-subtle">{formatRelative(n.createdAt)}</p>
                    </div>
                    {!n.readAt ? <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                  </div>
                );
                return (
                  <li key={n.id} className="border-b border-border last:border-0">
                    {href ? (
                      <Link href={href} onClick={() => void markOne(n.id)} className="block">
                        {inner}
                      </Link>
                    ) : (
                      <button type="button" className="block w-full text-left" onClick={() => void markOne(n.id)}>
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
