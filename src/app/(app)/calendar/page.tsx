import type { Metadata } from "next";
import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek, subDays } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarView } from "@/components/calendar/calendar-view";
import { requirePageUser } from "@/lib/auth/guards";
import { listEvents } from "@/server/calendar/service";
import { listCourseOptions } from "@/server/courses/service";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const user = await requirePageUser();
  const now = new Date();
  const from = subDays(startOfWeek(startOfMonth(now), { weekStartsOn: 1 }), 7);
  const to = addDays(endOfWeek(endOfMonth(now), { weekStartsOn: 1 }), 35);
  const [events, courses] = await Promise.all([listEvents(user.id, from, to), listCourseOptions(user.id)]);

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" description="Deadlines, exams, classes and study sessions in one place." />
      <CalendarView initialEvents={events} initialFrom={from.toISOString()} initialTo={to.toISOString()} courses={courses} />
    </div>
  );
}
