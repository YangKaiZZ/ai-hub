"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Separator } from "@/components/ui/separator";
import { isActivePath, primaryNav, secondaryNav, type NavItem } from "@/components/layout/nav-items";
import { useLogout } from "@/components/layout/use-logout";
import { cn } from "@/lib/utils";

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary-soft text-brand-700 dark:text-brand-200"
          : "text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {active ? <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" aria-hidden /> : null}
      <Icon className={cn("size-[18px] shrink-0", active ? "text-brand-600 dark:text-brand-300" : "text-subtle group-hover:text-foreground")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function SidebarNav({ onNavigate, isAdmin }: { onNavigate?: () => void; isAdmin?: boolean }) {
  const pathname = usePathname();
  const { logout, pending } = useLogout();
  const secondary = isAdmin ? [...secondaryNav, { href: "/admin", label: "Admin", icon: ShieldCheck }] : secondaryNav;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Logo href="/dashboard" />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 scrollbar-thin" aria-label="Main">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActivePath(pathname, item.href)} onNavigate={onNavigate} />
        ))}
        <Separator className="my-3" />
        {secondary.map((item) => (
          <NavLink key={item.href} item={item} active={isActivePath(pathname, item.href)} onNavigate={onNavigate} />
        ))}
        <button
          type="button"
          onClick={logout}
          disabled={pending}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
        >
          <LogOut className="size-[18px] text-subtle group-hover:text-foreground" />
          {pending ? "Signing out…" : "Logout"}
        </button>
      </nav>
      <div className="p-4">
        <div className="rounded-2xl brand-gradient-soft p-4 text-xs">
          <p className="font-semibold text-brand-800 dark:text-brand-100">Study smarter</p>
          <p className="mt-1 text-brand-800/80 dark:text-brand-100/80">Ask the AI Tutor “what should I study tonight?” for a plan built from your deadlines.</p>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ isAdmin }: { isAdmin?: boolean }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar lg:sticky lg:top-0 lg:block lg:h-dvh">
      <SidebarNav isAdmin={isAdmin} />
    </aside>
  );
}
