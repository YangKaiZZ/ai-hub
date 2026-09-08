import { format } from "date-fns";
import { MobileMenu } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { GlobalSearchTrigger } from "@/components/search/global-search";
import type { SessionUser } from "@/lib/auth/session";

export function AppHeader({ user, unreadCount, isAdmin }: { user: SessionUser; unreadCount: number; isAdmin?: boolean }) {
  const today = format(new Date(), "EEEE, MMMM d");
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <MobileMenu isAdmin={isAdmin} />
        <div className="hidden min-w-0 md:block">
          <p className="text-xs text-subtle">{today}</p>
        </div>
        <div className="flex-1" />
        <GlobalSearchTrigger />
        <NotificationBell initialUnread={unreadCount} />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
