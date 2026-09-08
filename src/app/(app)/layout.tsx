import { Sidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { MobileBottomBar } from "@/components/layout/mobile-nav";
import { requirePageUser } from "@/lib/auth/guards";
import { countUnreadNotifications } from "@/server/notifications/service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const unread = await countUnreadNotifications(user.id);

  return (
    <div className="flex min-h-dvh">
      <Sidebar isAdmin={user.role === "ADMIN"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} unreadCount={unread} isAdmin={user.role === "ADMIN"} />
        <main id="main" className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-7xl animate-fade-in">{children}</div>
        </main>
      </div>
      <MobileBottomBar />
    </div>
  );
}
