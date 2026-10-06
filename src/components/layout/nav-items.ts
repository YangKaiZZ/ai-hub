import { BookOpenIcon, CalendarBlankIcon, CalendarCheckIcon, ChalkboardTeacherIcon, CheckSquareIcon, ExamIcon, FolderOpenIcon, GearSixIcon, QuestionIcon, SquaresFourIcon, type AppIcon } from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: AppIcon;
  /** Short label for the mobile bottom bar. */
  short?: string;
}

export const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: SquaresFourIcon, short: "Home" },
  { href: "/tasks", label: "My Tasks", icon: CheckSquareIcon, short: "Tasks" },
  { href: "/courses", label: "Courses", icon: BookOpenIcon, short: "Courses" },
  { href: "/calendar", label: "Calendar", icon: CalendarBlankIcon, short: "Calendar" },
  { href: "/tutor", label: "AI Tutor", icon: ChalkboardTeacherIcon, short: "Tutor" },
  { href: "/resources", label: "Resources", icon: FolderOpenIcon, short: "Files" },
  { href: "/grades", label: "Grades", icon: ExamIcon, short: "Grades" },
  { href: "/planner", label: "Study Planner", icon: CalendarCheckIcon, short: "Planner" },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: GearSixIcon },
  { href: "/help", label: "Help", icon: QuestionIcon },
];

/** Items shown in the mobile bottom bar (max 5). */
export const mobileBarNav: NavItem[] = [primaryNav[0]!, primaryNav[1]!, primaryNav[4]!, primaryNav[3]!];

export function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
