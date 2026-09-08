import {
  BookOpen,
  BrainCircuit,
  CalendarDays,
  CheckSquare,
  FolderOpen,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Short label for the mobile bottom bar. */
  short?: string;
}

export const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, short: "Home" },
  { href: "/tasks", label: "My Tasks", icon: CheckSquare, short: "Tasks" },
  { href: "/courses", label: "Courses", icon: BookOpen, short: "Courses" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, short: "Calendar" },
  { href: "/tutor", label: "AI Tutor", icon: BrainCircuit, short: "Tutor" },
  { href: "/resources", label: "Resources", icon: FolderOpen, short: "Files" },
  { href: "/grades", label: "Grades", icon: GraduationCap, short: "Grades" },
  { href: "/planner", label: "Study Planner", icon: Sparkles, short: "Planner" },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
];

/** Items shown in the mobile bottom bar (max 5). */
export const mobileBarNav: NavItem[] = [primaryNav[0]!, primaryNav[1]!, primaryNav[4]!, primaryNav[3]!];

export function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
