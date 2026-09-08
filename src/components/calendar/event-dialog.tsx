"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { ApiClientError, apiDelete, apiPatch, apiPost } from "@/lib/client/api";

const NONE = "__none__";

interface EventLike {
  id: string;
  title: string;
  description: string | null;
  type: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  location: string | null;
  taskId: string | null;
  studySessionId: string | null;
  course: { id: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event?: EventLike;
  defaultDate?: Date;
  courses: { id: string; name: string; code: string | null }[];
  onSaved: () => void;
}

export function EventDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.open ? <EventForm key={props.event?.id ?? "new"} {...props} /> : null}</DialogContent>
    </Dialog>
  );
}

function EventForm({ event, defaultDate, courses, onOpenChange, onSaved }: Props) {
  const isTask = Boolean(event?.taskId);
  const isSession = Boolean(event?.studySessionId);
  const base = event?.startAt ?? defaultDate ?? new Date();
  const [title, setTitle] = React.useState(event?.title ?? "");
  const [type, setType] = React.useState(event?.type ?? "PERSONAL");
  const [allDay, setAllDay] = React.useState(event?.allDay ?? false);
  const [start, setStart] = React.useState(format(event?.startAt ?? new Date(base.setHours(event ? base.getHours() : 9, event ? base.getMinutes() : 0, 0, 0)), "yyyy-MM-dd'T'HH:mm"));
  const [end, setEnd] = React.useState(event?.endAt ? format(event.endAt, "yyyy-MM-dd'T'HH:mm") : "");
  const [location, setLocation] = React.useState(event?.location ?? "");
  const [courseId, setCourseId] = React.useState(event?.course?.id ?? NONE);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = {
      title,
      type,
      allDay,
      startAt: new Date(start).toISOString(),
      endAt: end ? new Date(end).toISOString() : null,
      location,
      courseId: courseId === NONE ? null : courseId,
    };
    try {
      if (event) await apiPatch(`/api/calendar/${event.id}`, isTask ? { startAt: payload.startAt, title } : payload);
      else await apiPost("/api/calendar", payload);
      toast.success(event ? "Event updated" : "Event added");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) setErrors(err.details);
      else toast.error(err instanceof Error ? err.message : "Could not save event");
      setSaving(false);
    }
  }

  async function remove() {
    if (!event || !window.confirm("Delete this event?")) return;
    setSaving(true);
    try {
      await apiDelete(`/api/calendar/${event.id}`);
      toast.success("Event deleted");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{event ? (isTask ? "Deadline" : isSession ? "Study session" : "Edit event") : "New event"}</DialogTitle>
        <DialogDescription>
          {isTask ? "This is a task deadline. Moving it updates the task." : isSession ? "Part of your study plan. Changes sync to the planner." : "Classes, personal commitments and anything else that takes time."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="ev-title" label="Title" required error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        {!isTask ? (
          <div className="grid grid-cols-2 gap-4">
            <Field id="ev-type" label="Type" error={errors.type}>
              <Select value={type} onValueChange={setType} disabled={isSession}>
                <SelectTrigger id="ev-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSONAL">Personal</SelectItem>
                  <SelectItem value="CLASS">Class</SelectItem>
                  <SelectItem value="EXAM">Exam</SelectItem>
                  <SelectItem value="STUDY_SESSION">Study session</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="ev-course" label="Course" error={errors.courseId}>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="ev-course">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <Field id="ev-start" label={isTask ? "Due" : "Starts"} required error={errors.startAt}>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          {!isTask ? (
            <Field id="ev-end" label="Ends" error={errors.endAt}>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={allDay} />
            </Field>
          ) : null}
        </div>
        {!isTask && !isSession ? (
          <>
            <div className="flex items-center gap-2">
              <Checkbox id="ev-allday" checked={allDay} onCheckedChange={(v) => setAllDay(Boolean(v))} />
              <Label htmlFor="ev-allday">All day</Label>
            </div>
            <Field id="ev-location" label="Location" error={errors.location}>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room 204 / Zoom" />
            </Field>
          </>
        ) : null}
        <DialogFooter className="sm:justify-between">
          <div>
            {event && !isTask ? (
              <Button type="button" variant="ghost" onClick={remove} disabled={saving} className="text-danger hover:bg-danger-soft hover:text-danger">
                <Trash2 /> Delete
              </Button>
            ) : event?.taskId ? (
              <Button asChild type="button" variant="ghost">
                <Link href={`/tasks/${event.taskId}`}>Open task</Link>
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {event ? "Save" : "Add event"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </>
  );
}
