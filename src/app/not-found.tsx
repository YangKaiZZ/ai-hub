import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-brand-600 dark:text-brand-300">
        <Compass className="size-8" aria-hidden />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">This page wandered off</h1>
      <p className="mt-2 max-w-md text-muted">
        The page you are looking for does not exist or has moved. Let us get you back to your hub.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
