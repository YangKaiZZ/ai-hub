import Link from "next/link";
import { format, isToday, isTomorrow } from "date-fns";
import { CalendarBlankIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CourseDot } from "@/components/courses/course-visual";
import { EmptyState } from "@/components/ui/empty-state";

interface UpcomingEvent {
  id: string;
  title: string;
  type: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  taskId: string | null;
  course: { name: string; color: string } | null;
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

const typeLabel: Record<string, string> = {
  ASSIGNMENT: "Assignment",
  EXAM: "Exam",
  PROJECT: "Project",
  CLASS: "Class",
  STUDY_SESSION: "Study session",
  PERSONAL: "Personal",
  OTHER: "Event",
};

export function UpcomingTimeline({ events }: { events: UpcomingEvent[] }) {
  const groups = new Map<string, UpcomingEvent[]>();
  for (const e of events) {
    const key = format(e.startAt, "yyyy-MM-dd");
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  return (
    <section aria-labelledby="upcoming-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="upcoming-heading" className="text-base font-semibold">
          Upcoming
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/calendar">Open calendar</Link>
        </Button>
      </div>
      {events.length === 0 ? (
        <EmptyState compact icon={<CalendarBlankIcon />} title="Nothing scheduled" description="Deadlines and study sessions will show up here." />
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-4">
          {[...groups.entries()].map(([key, items]) => (
            <li key={key}>
              <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-surface bg-primary" aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{dayLabel(items[0]!.startAt)}</p>
              <ul className="mt-1.5 space-y-1.5">
                {items.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={e.taskId ? `/tasks/${e.taskId}` : "/calendar"}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-surface-muted"
                    >
                      {e.course ? <CourseDot color={e.course.color} /> : <span className="size-2 rounded-full bg-subtle" aria-hidden />}
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                      <span className="shrink-0 text-xs text-subtle">{e.allDay ? typeLabel[e.type] ?? "Event" : format(e.startAt, "h:mm a")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
