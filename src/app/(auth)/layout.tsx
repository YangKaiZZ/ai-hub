import Link from "next/link";
import { BookOpenCheck, BrainCircuit, CalendarCheck2, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const highlights = [
  { icon: BookOpenCheck, text: "Every deadline from every course, in one place." },
  { icon: BrainCircuit, text: "An AI tutor that explains, guides, and checks your work." },
  { icon: CalendarCheck2, text: "Study plans that fit the time you actually have." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden brand-gradient p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-900/30 blur-3xl" aria-hidden />
        <Link href="/" className="relative inline-flex items-center gap-2.5 text-lg font-semibold">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Sparkles className="size-5" />
          </span>
          AI Hub
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            Your entire student life.
            <br />
            One intelligent hub.
          </h2>
          <ul className="mt-10 space-y-5">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-brand-50/95">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="size-4" />
                </span>
                <span className="text-base leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-100/80">Works with any school, university or learning platform.</p>
      </aside>

      <main className="flex flex-col px-6 py-8 sm:px-10 lg:px-16">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md animate-slide-up">{children}</div>
        </div>
      </main>
    </div>
  );
}
