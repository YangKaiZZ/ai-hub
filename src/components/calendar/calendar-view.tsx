"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { CalendarBlankIcon, CalendarPlusIcon, CaretLeftIcon, CaretRightIcon, PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EventDialog } from "@/components/calendar/event-dialog";
import { courseStyles } from "@/components/courses/course-visual";
import { apiGet } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { CalendarEventItem } from "@/server/calendar/service";

type View = "month" | "week" | "agenda";

const typeStyles: Record<string, string> = {
  ASSIGNMENT: "bg-primary-soft text-brand-800 dark:text-brand-100",
  PROJECT: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200",
  EXAM: "bg-danger-soft text-red-800 dark:text-red-200",
  CLASS: "bg-info-soft text-blue-800 dark:text-blue-200",
  STUDY_SESSION: "bg-success-soft text-green-800 dark:text-green-200",
  PERSONAL: "bg-surface-muted text-foreground",
  OTHER: "bg-surface-muted text-foreground",
};

function serialize(events: CalendarEventItem[]) {
  return events.map((e) => ({ ...e, startAt: new Date(e.startAt), endAt: e.endAt ? new Date(e.endAt) : null }));
}

export function CalendarView({ initialEvents, initialFrom, initialTo, courses }: { initialEvents: CalendarEventItem[]; initialFrom: string; initialTo: string; courses: { id: string; name: string; code: string | null; color: string }[] }) {
  const router = useRouter();
  const [view, setView] = React.useState<View>("month");
  const [cursor, setCursor] = React.useState(() => new Date());
  const [events, setEvents] = React.useState(() => serialize(initialEvents));
  const [loaded, setLoaded] = React.useState({ from: new Date(initialFrom), to: new Date(initialTo) });
  const [dialog, setDialog] = React.useState<{ open: boolean; event?: (typeof events)[number]; date?: Date }>({ open: false });
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null);

  const range = React.useMemo(() => {
    if (view === "week") return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
    if (view === "agenda") return { from: new Date(new Date().setHours(0, 0, 0, 0)), to: addDays(new Date(), 30) };
    return { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) };
  }, [view, cursor]);

  // Fetch events whenever the visible range leaves the loaded window.
  React.useEffect(() => {
    if (range.from >= loaded.from && range.to <= loaded.to) return;
    const from = new Date(Math.min(range.from.getTime(), loaded.from.getTime()));
    const to = new Date(Math.max(range.to.getTime(), loaded.to.getTime()));
    let cancelled = false;
    apiGet<{ events: CalendarEventItem[] }>(`/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((res) => {
        if (cancelled) return;
        setEvents(serialize(res.events));
        setLoaded({ from, to });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [range, loaded]);

  const refresh = () => {
    apiGet<{ events: CalendarEventItem[] }>(`/api/calendar?from=${loaded.from.toISOString()}&to=${loaded.to.toISOString()}`)
      .then((res) => setEvents(serialize(res.events)))
      .catch(() => undefined);
    router.refresh();
  };

  const eventsOn = (day: Date) => events.filter((e) => isSameDay(e.startAt, day)).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const go = (delta: number) => {
    if (view === "week") setCursor((c) => (delta > 0 ? addWeeks(c, 1) : subWeeks(c, 1)));
    else setCursor((c) => (delta > 0 ? addMonths(c, 1) : subMonths(c, 1)));
  };

  const title = view === "week" ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}` : view === "agenda" ? "Next 30 days" : format(cursor, "MMMM yyyy");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {view !== "agenda" ? (
            <>
              <Button variant="outline" size="icon-sm" onClick={() => go(-1)} aria-label="Previous">
                <CaretLeftIcon />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => go(1)} aria-label="Next">
                <CaretRightIcon />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
                Today
              </Button>
            </>
          ) : null}
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-surface-muted p-1" role="tablist" aria-label="Calendar view">
            {(["month", "week", "agenda"] as View[]).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition", view === v ? "bg-surface shadow-sm" : "text-muted hover:text-foreground")}>
                {v}
              </button>
            ))}
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/planner">
              <CalendarPlusIcon /> AI Plan My Week
            </Link>
          </Button>
          <Button size="sm" onClick={() => setDialog({ open: true, date: selectedDay ?? new Date() })}>
            <PlusIcon /> Event
          </Button>
        </div>
      </div>

      {view === "agenda" ? (
        <AgendaView events={events.filter((e) => e.startAt >= range.from && e.startAt <= range.to)} onSelect={(e) => setDialog({ open: true, event: e })} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="grid grid-cols-7 border-b border-border bg-surface-muted text-center text-xs font-semibold uppercase tracking-wide text-subtle">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className={cn("grid grid-cols-7", view === "week" ? "auto-rows-[minmax(14rem,1fr)]" : "auto-rows-[minmax(6.5rem,1fr)]")}>
            {eachDayOfInterval({ start: range.from, end: range.to }).map((day) => {
              const dayEvents = eventsOn(day);
              const muted = view === "month" && !isSameMonth(day, cursor);
              const shown = view === "week" ? dayEvents : dayEvents.slice(0, 3);
              return (
                <div
                  key={day.toISOString()}
                  className={cn("group relative border-b border-r border-border p-1.5 text-left transition last:border-r-0 hover:bg-surface-muted/50", muted && "bg-surface-muted/30 text-subtle")}
                  onClick={() => setSelectedDay(day)}
                  onDoubleClick={() => setDialog({ open: true, date: day })}
                  role="gridcell"
                  aria-label={format(day, "EEEE, MMMM d")}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs font-medium", isToday(day) && "bg-primary text-white")}>{format(day, "d")}</span>
                    <button type="button" onClick={(e) => (e.stopPropagation(), setDialog({ open: true, date: day }))} className="rounded p-0.5 text-subtle opacity-0 transition hover:bg-surface hover:text-foreground group-hover:opacity-100" aria-label={`Add event on ${format(day, "MMM d")}`}>
                      <PlusIcon className="size-3.5" />
                    </button>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {shown.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={(ev) => (ev.stopPropagation(), setDialog({ open: true, event: e }))}
                          className={cn("flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition hover:brightness-95", typeStyles[e.type] ?? typeStyles.OTHER, e.studySession?.completedAt && "line-through opacity-60")}
                          title={e.title}
                        >
                          {e.course ? <span className={cn("size-1.5 shrink-0 rounded-full", courseStyles(e.course.color).solid)} /> : null}
                          {!e.allDay ? <span className="shrink-0 tabular-nums opacity-70">{format(e.startAt, "HH:mm")}</span> : null}
                          <span className="truncate">{e.title}</span>
                        </button>
                      </li>
                    ))}
                    {dayEvents.length > shown.length ? <li className="px-1.5 text-[11px] text-subtle">+{dayEvents.length - shown.length} more</li> : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedDay && view === "month" ? (
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold">{format(selectedDay, "EEEE, MMMM d")}</h3>
          {eventsOn(selectedDay).length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled. Double-click a day or use “Event” to add something.</p>
          ) : (
            <ul className="divide-y divide-border">
              {eventsOn(selectedDay).map((e) => (
                <EventRow key={e.id} event={e} onSelect={() => setDialog({ open: true, event: e })} />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2 text-[11px] text-subtle">
        {Object.entries({ ASSIGNMENT: "Assignment", EXAM: "Exam / quiz", PROJECT: "Project", STUDY_SESSION: "Study session", CLASS: "Class", PERSONAL: "Personal" }).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cn("size-2.5 rounded-sm", typeStyles[k])} /> {label}
          </span>
        ))}
      </div>

      <EventDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} event={dialog.event} defaultDate={dialog.date} courses={courses} onSaved={refresh} />
    </div>
  );
}

type Ev = ReturnType<typeof serialize>[number];

function AgendaView({ events, onSelect }: { events: Ev[]; onSelect: (e: Ev) => void }) {
  if (events.length === 0) return <EmptyState icon={<CalendarBlankIcon />} title="Nothing in the next 30 days" description="Deadlines, exams and study sessions will show up here as you add them." />;
  const groups = new Map<string, Ev[]>();
  for (const e of events) {
    const k = format(e.startAt, "yyyy-MM-dd");
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([k, items]) => (
        <section key={k} className="rounded-2xl border border-border bg-surface shadow-sm">
          <header className={cn("flex items-center justify-between border-b border-border px-4 py-2.5", isToday(items[0]!.startAt) && "bg-primary-soft/40")}>
            <h3 className="text-sm font-semibold">{isToday(items[0]!.startAt) ? "Today" : format(items[0]!.startAt, "EEEE, MMMM d")}</h3>
            <span className="text-xs text-subtle">
              {items.length} item{items.length === 1 ? "" : "s"}
            </span>
          </header>
          <ul className="divide-y divide-border">
            {items.map((e) => (
              <EventRow key={e.id} event={e} onSelect={() => onSelect(e)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EventRow({ event, onSelect }: { event: Ev; onSelect: () => void }) {
  return (
    <li>
      <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-surface-muted/60">
        <span className="w-16 shrink-0 text-xs tabular-nums text-muted">{event.allDay ? "All day" : format(event.startAt, "h:mm a")}</span>
        <span className={cn("size-2.5 shrink-0 rounded-sm", typeStyles[event.type])} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate font-medium", event.studySession?.completedAt && "line-through text-muted")}>{event.title}</span>
          {event.course ? <span className="block truncate text-xs text-muted">{event.course.name}</span> : null}
        </span>
        {event.taskId ? <Badge variant="outline">Deadline</Badge> : event.studySessionId ? <Badge variant="success">Study</Badge> : null}
      </button>
    </li>
  );
}
