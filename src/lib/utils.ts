import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  formatDistanceToNowStrict,
  isPast,
  isToday,
  isTomorrow,
} from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "2h 30m" style duration. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Human-friendly deadline: "Due today", "Due tomorrow", "Due in 3 days", "Overdue by 2 days". */
export function formatDeadline(date: Date | string | null | undefined, now = new Date()): string {
  if (!date) return "No deadline";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isToday(d)) {
    const mins = differenceInMinutes(d, now);
    if (mins < 0) return "Due earlier today";
    if (mins < 60) return `Due in ${mins} min`;
    return `Due today, ${format(d, "h:mm a")}`;
  }
  if (isTomorrow(d)) return "Due tomorrow";
  if (isPast(d)) {
    const days = Math.abs(differenceInCalendarDays(d, now));
    return `Overdue by ${days} day${days === 1 ? "" : "s"}`;
  }
  const days = differenceInCalendarDays(d, now);
  if (days <= 7) return `Due in ${days} days`;
  return `Due ${format(d, "MMM d")}`;
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function formatDate(date: Date | string, pattern = "MMM d, yyyy"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, pattern);
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function initials(first: string, last?: string | null) {
  return `${first.charAt(0)}${(last ?? "").charAt(0)}`.toUpperCase();
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function truncate(text: string, max = 120) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Rough token estimate (≈4 chars per token) used for chunking and budgeting. */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

export function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}
