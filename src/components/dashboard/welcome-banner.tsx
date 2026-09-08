import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WelcomeBanner({ firstName, activeTasks, analyzedCount }: { firstName: string; activeTasks: number; analyzedCount: number }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <section className="relative overflow-hidden rounded-3xl brand-gradient p-6 text-white shadow-md sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 right-24 size-56 rounded-full bg-brand-900/30 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <p className="text-sm text-brand-100">{greeting}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back, {firstName}</h1>
          <p className="mt-2 text-brand-50/90">Here&apos;s what needs your attention today.</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur">
            <Sparkles className="size-3.5" />
            {activeTasks === 0
              ? "AI is ready to analyze your first task"
              : `AI has analyzed ${analyzedCount} of ${activeTasks} active task${activeTasks === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            <Link href="/tutor?prompt=What%20should%20I%20study%20tonight%3F">
              <Sparkles /> Plan my evening
            </Link>
          </Button>
          <Button asChild className="bg-white text-brand-700 hover:bg-brand-50">
            <Link href="/tasks">
              View all tasks <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
