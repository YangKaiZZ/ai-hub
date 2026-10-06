"use client";

import { useEffect } from "react";
import { ArrowCounterClockwiseIcon, WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side breadcrumb only; the server already logged the failure.
    console.error("[ai-hub] page error", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <WarningIcon className="size-8" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-muted">
        We hit an unexpected problem loading this page. Your data is safe — try again, and if it keeps happening let us
        know.
      </p>
      {error.digest ? <p className="mt-3 font-mono text-xs text-subtle">Reference: {error.digest}</p> : null}
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>
          <ArrowCounterClockwiseIcon /> Try again
        </Button>
        <Button asChild variant="outline">
          <a href="/dashboard">Back to dashboard</a>
        </Button>
      </div>
    </main>
  );
}
