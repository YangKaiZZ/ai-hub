"use client";

import { useLogout } from "@/components/layout/use-logout";

/**
 * A strip across the top of the app for the shared demo login.
 *
 * Its job is honesty: everyone who clicks "Explore demo" lands in the same
 * account, so anything typed here (a task, a tutor question) is visible to the
 * next visitor until the daily reset. The way out is a real account, which the
 * signup page only serves to signed-out visitors, hence signing out first.
 */
export function DemoBanner() {
  const { logout, pending } = useLogout("/signup");

  return (
    <div role="note" className="border-b border-border bg-surface-muted px-4 py-2 text-sm sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-muted">
          <span className="font-medium text-foreground">Shared demo.</span> Other visitors can see what you add here, and it
          all resets once a day. Keep anything personal out of it.
        </p>
        <button
          type="button"
          onClick={logout}
          disabled={pending}
          className="shrink-0 font-medium text-brand-700 underline-offset-4 hover:underline disabled:opacity-60 dark:text-brand-300"
        >
          {pending ? "Signing out…" : "Make your own account"}
        </button>
      </div>
    </div>
  );
}
