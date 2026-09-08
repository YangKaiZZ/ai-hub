import {
  Atom,
  BookOpen,
  Briefcase,
  Code,
  Cpu,
  Database,
  FlaskConical,
  Globe,
  Landmark,
  Palette,
  PenLine,
  Sigma,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  code: Code,
  database: Database,
  sigma: Sigma,
  "flask-conical": FlaskConical,
  atom: Atom,
  "pen-line": PenLine,
  landmark: Landmark,
  briefcase: Briefcase,
  cpu: Cpu,
  globe: Globe,
  palette: Palette,
};

/** Tailwind classes per course color: [soft bg + text, solid bg]. */
const palette: Record<string, { soft: string; solid: string; text: string; ring: string }> = {
  violet: { soft: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", solid: "bg-violet-600", text: "text-violet-700 dark:text-violet-300", ring: "ring-violet-200" },
  indigo: { soft: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", solid: "bg-indigo-600", text: "text-indigo-700 dark:text-indigo-300", ring: "ring-indigo-200" },
  blue: { soft: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", solid: "bg-blue-600", text: "text-blue-700 dark:text-blue-300", ring: "ring-blue-200" },
  sky: { soft: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", solid: "bg-sky-600", text: "text-sky-700 dark:text-sky-300", ring: "ring-sky-200" },
  teal: { soft: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300", solid: "bg-teal-600", text: "text-teal-700 dark:text-teal-300", ring: "ring-teal-200" },
  emerald: { soft: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", solid: "bg-emerald-600", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-200" },
  amber: { soft: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", solid: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-200" },
  orange: { soft: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", solid: "bg-orange-500", text: "text-orange-700 dark:text-orange-300", ring: "ring-orange-200" },
  rose: { soft: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", solid: "bg-rose-600", text: "text-rose-700 dark:text-rose-300", ring: "ring-rose-200" },
  pink: { soft: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300", solid: "bg-pink-600", text: "text-pink-700 dark:text-pink-300", ring: "ring-pink-200" },
};

export function courseStyles(color: string | null | undefined) {
  return palette[color ?? "violet"] ?? palette.violet!;
}

export function CourseIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = icons[icon ?? "book-open"] ?? BookOpen;
  const styles = courseStyles(color);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        styles.soft,
        size === "sm" && "size-8 [&_svg]:size-4",
        size === "md" && "size-10 [&_svg]:size-5",
        size === "lg" && "size-12 rounded-2xl [&_svg]:size-6",
        className,
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}

export function CourseDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", courseStyles(color).solid, className)} aria-hidden />;
}
