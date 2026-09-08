"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/sidebar";
import { isActivePath, mobileBarNav } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

/** Hamburger + drawer used in the header on small screens. */
export function MobileMenu({ isAdmin }: { isAdmin?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0" hideClose>
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarNav onNavigate={() => setOpen(false)} isAdmin={isAdmin} />
      </SheetContent>
    </Sheet>
  );
}

/** Fixed bottom bar for phones. */
export function MobileBottomBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Quick navigation"
    >
      <ul className="grid grid-cols-5">
        {mobileBarNav.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  active ? "text-brand-600 dark:text-brand-300" : "text-subtle",
                )}
              >
                <Icon className="size-5" />
                {item.short ?? item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <MoreSheet />
        </li>
      </ul>
    </nav>
  );
}

function MoreSheet() {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className="flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-subtle">
          <Menu className="size-5" />
          More
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="p-0" hideClose>
        <SheetTitle className="sr-only">All sections</SheetTitle>
        <div className="max-h-[80dvh] overflow-y-auto pb-4">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
