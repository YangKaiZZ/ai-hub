import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon, CalendarDotsIcon, ChalkboardTeacherIcon, CheckCircleIcon, ClipboardTextIcon, FileMagnifyingGlassIcon, KanbanIcon, LightbulbIcon, PlugIcon, StudentIcon } from "@/components/icons";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getCurrentUser } from "@/lib/auth/guards";
import { FilmPlayer } from "@/components/campaign/film-player";
import { Sticker } from "@/components/campaign/sticker";

export const metadata: Metadata = {
  title: "AI Hub — Your entire student life. One intelligent hub.",
};

const features = [
  {
    icon: KanbanIcon,
    title: "Automatic task organization",
    body: "Assignments, quizzes and projects from every course land in one prioritized list — imported from your LMS, calendar or added in seconds.",
  },
  {
    icon: ChalkboardTeacherIcon,
    title: "AI Tutor",
    body: "Ask about calculus, code, essays or anything in your notes. It explains, gives hints and checks your reasoning — it never does the work for you.",
  },
  {
    icon: ClipboardTextIcon,
    title: "Assignment Workspaces",
    body: "Every important assignment gets its own space: instructions, rubric, files, your draft, a checklist and an AI that knows the context.",
  },
  {
    icon: CalendarDotsIcon,
    title: "Smart study planning",
    body: "Tell AI Hub when you are free. It proposes a week that balances deadlines, workload and difficulty — you confirm before anything changes.",
  },
  {
    icon: BookOpenIcon,
    title: "Course management",
    body: "Instructors, grades, resources, announcements and progress for each course, with grade projections you can actually plan around.",
  },
  {
    icon: FileMagnifyingGlassIcon,
    title: "Document intelligence",
    body: "Upload lecture slides, PDFs and notes. Ask questions and get answers with sources you can click straight back into.",
  },
  {
    icon: PlugIcon,
    title: "LMS integrations",
    body: "Canvas, Moodle and Blackboard ready. Connect with secure tokens — AI Hub never stores your school password.",
  },
];

// The film's five proof scenes, in the same order and with the same lines.
const story = [
  {
    sticker: { src: "/campaign/arms-crossed.webp", width: 398, height: 680, alt: "The student, arms crossed and confident" },
    eyebrow: "Smart priorities",
    title: "Knows what's due first.",
    body: "Every assignment lands in one list, ranked by deadline × workload × importance. AI Hub tells you what to start tonight and why.",
    points: ["Explainable priority score", "AI task analysis: type, effort, urgency", "Daily recommendation"],
  },
  {
    sticker: { src: "/campaign/sit-phone.webp", width: 410, height: 626, alt: "The student sitting on a crate, asking the tutor on his phone" },
    eyebrow: "AI Tutor",
    title: "A tutor, not a shortcut.",
    body: "Pick how much help you want. Learning mode gives hints first, Guided walks you through, Review gives feedback on your own work.",
    points: ["Learning, Guided and Review modes", "Knows your course and assignment", "Never completes graded work"],
  },
  {
    sticker: { src: "/campaign/trackpad.webp", width: 516, height: 370, alt: "A hand on a laptop trackpad" },
    eyebrow: "Document intelligence",
    title: "Answers with sources.",
    body: "Drop in lecture slides, PDFs and notes. Ask a question and the answer points to the exact page it came from.",
    points: ["PDF, DOCX, PPTX and text", "Summaries and cited answers", "Click a citation to open the page"],
  },
  {
    sticker: { src: "/campaign/walk-phone.webp", width: 388, height: 648, alt: "The student walking and checking his phone" },
    eyebrow: "AI Plan My Week",
    title: "Plans your week. You confirm.",
    body: "Tell AI Hub when you're free. It balances deadlines, workload and difficulty into study blocks, and nothing is saved until you say so.",
    points: ["Fits around your free evenings", "Confirm before anything changes", "Lands on your calendar"],
  },
  {
    sticker: { src: "/campaign/pose-fist.webp", width: 360, height: 472, alt: "The student pumping his fist" },
    eyebrow: "Grades + LMS sync",
    title: "Grades you can plan around.",
    body: "Weighted categories, projections and a target calculator that tells you exactly what you need on the remaining work. Canvas, Moodle and Blackboard keep it all in sync.",
    points: ["Target grade calculator", "Canvas · Moodle · Blackboard", "Secure tokens, never your password"],
  },
];

const tiers = [
  { name: "Student", price: "Free", body: "Everything you need to run one semester.", features: ["Unlimited tasks & courses", "AI Tutor (daily limit)", "3 assignment workspaces", "500 MB uploads"] },
  { name: "Plus", price: "Coming soon", body: "For heavier semesters and power studiers.", features: ["Unlimited workspaces", "Priority AI", "LMS auto-sync", "10 GB uploads"], highlighted: true },
  { name: "Campus", price: "Contact us", body: "For institutions and student organizations.", features: ["Institution configuration", "Admin dashboard", "SSO", "Dedicated support"] },
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted md:flex" aria-label="Primary">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <a href="#pricing" className="hover:text-foreground">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild>
                <Link href="/dashboard">
                  Open dashboard <ArrowRightIcon />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="hidden sm:inline-flex">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] brand-gradient-soft" aria-hidden />
          <div className="pointer-events-none absolute left-1/2 top-24 -z-10 size-[42rem] -translate-x-1/2 rounded-full bg-brand-300/30 blur-3xl dark:bg-brand-700/20" aria-hidden />
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pb-28 lg:pt-24">
            <div className="max-w-xl">
              <Badge variant="brand" className="mb-5 px-3 py-1 text-xs">
                <StudentIcon /> Built for students, at any school
              </Badge>
              <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Your entire student life. <span className="text-gradient">One intelligent hub.</span>
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-muted">
                Organize your courses, deadlines, study materials, and academic work with an AI assistant built around
                the way students actually study.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" variant="gradient">
                  <Link href={user ? "/dashboard" : "/signup"}>
                    Get started <ArrowRightIcon />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login?demo=1">Explore demo</Link>
                </Button>
              </div>
              <a href="#film" className="mt-5 inline-flex items-center gap-2.5 rounded-full text-sm font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200">
                <span className="inline-flex size-8 items-center justify-center rounded-full brand-gradient text-white shadow-md" aria-hidden>
                  <svg viewBox="0 0 24 24" className="ml-0.5 size-3.5 fill-current">
                    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                  </svg>
                </span>
                Watch the 55-second film
              </a>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
                {["Free to start", "No school verification", "Works with any LMS"].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <CheckCircleIcon className="size-4 text-success" /> {t}
                  </li>
                ))}
              </ul>
            </div>

            <HeroPreview />
          </div>
        </section>

        {/* Film */}
        <section id="film" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-6 pb-20 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">The film</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">7 deadlines. 4 courses. 1 tired brain.</h2>
            <p className="mt-4 text-muted">55 seconds from overload to a planned week. Turn the sound on: the beat, the pings and the pops were all made for it.</p>
          </div>
          <FilmPlayer className="mx-auto mt-10 max-w-5xl" />
        </section>

        {/* Story: the film's five proof scenes */}
        <section id="story" className="border-y border-border bg-surface/60 py-20">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">One week with AI Hub</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Every weight, one hub.</h2>
              <p className="mt-4 text-muted">Click a sticker. He likes it.</p>
            </div>
            <div className="mt-16 space-y-16 lg:space-y-20">
              {story.map((s, i) => (
                <article key={s.title} className="grid items-center gap-8 md:grid-cols-[0.8fr_1.2fr] md:gap-14">
                  <div className={`flex justify-center ${i % 2 ? "md:order-2" : ""}`}>
                    <div className="sticker-float w-44 sm:w-52" style={{ animationDelay: `${i * -1.2}s` }}>
                      <Sticker src={s.sticker.src} alt={s.sticker.alt} width={s.sticker.width} height={s.sticker.height} pitch={1 + i * 0.12} />
                    </div>
                  </div>
                  <div className={i % 2 ? "md:order-1" : ""}>
                    <Badge variant="brand" className="px-3 py-1 text-xs">
                      {String(i + 1).padStart(2, "0")} · {s.eyebrow}
                    </Badge>
                    <h3 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h3>
                    <p className="mt-3 max-w-xl leading-relaxed text-muted">{s.body}</p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {s.points.map((pt) => (
                        <li key={pt} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm">
                          <CheckCircleIcon className="size-4 text-success" /> {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">Everything in one place</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Less juggling. More learning.</h2>
            <p className="mt-4 text-muted">
              AI Hub replaces the pile of tabs, PDFs and half-remembered deadlines with a single hub that knows what you
              need to do next.
            </p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <article key={title} className="group rounded-2xl border border-border bg-surface p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary-soft text-brand-600 transition group-hover:brand-gradient group-hover:text-white dark:text-brand-300">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-border bg-surface/60 py-20">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-3">
              {[
                { step: "01", title: "Connect your courses", body: "Pick your institution, add your courses, and optionally connect Canvas, Moodle or Blackboard." },
                { step: "02", title: "Let AI organize the semester", body: "Tasks are analyzed for type, effort and urgency, then prioritized so you always know what matters today." },
                { step: "03", title: "Study with a tutor that knows your context", body: "Open a workspace, ask questions about your own notes and get a plan for the week — with sources." },
              ].map((s) => (
                <div key={s.step} className="relative pl-14">
                  <span className="absolute left-0 top-0 inline-flex size-10 items-center justify-center rounded-xl brand-gradient font-mono text-sm font-semibold text-white">
                    {s.step}
                  </span>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Integrity */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <div className="grid items-center gap-10 rounded-3xl border border-border bg-surface p-8 shadow-sm sm:p-12 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">Academic integrity, by design</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">A tutor, not a shortcut.</h2>
              <p className="mt-4 text-muted">
                AI Hub is built to help you understand, practice and improve. It explains concepts, breaks assignments
                into steps, reviews your drafts and generates practice problems — and it will never submit work on your
                behalf.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { mode: "Learning", body: "Hints and Socratic guidance. Answers only after you try." },
                { mode: "Guided", body: "Step-by-step help with explanations and worked examples." },
                { mode: "Review", body: "Feedback on your own work: mistakes, gaps and next steps." },
              ].map((m) => (
                <div key={m.mode} className="rounded-2xl bg-surface-muted p-5">
                  <Badge variant="brand">{m.mode} mode</Badge>
                  <p className="mt-3 text-sm text-muted">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Simple pricing</h2>
            <p className="mt-3 text-muted">Start free. Upgrade when your semester does.</p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl border p-7 ${tier.highlighted ? "border-brand-300 bg-surface shadow-lg ring-1 ring-brand-200 dark:border-brand-700 dark:ring-brand-800" : "border-border bg-surface shadow-sm"}`}
              >
                {tier.highlighted ? <Badge variant="solid" className="absolute -top-3 left-6">Most popular</Badge> : null}
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <p className="mt-1 text-sm text-muted">{tier.body}</p>
                <p className="mt-5 text-3xl font-semibold tracking-tight">{tier.price}</p>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-success" /> {f}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-7 w-full" variant={tier.highlighted ? "primary" : "outline"}>
                  <Link href="/signup">{tier.price === "Free" ? "Get started" : "Join the waitlist"}</Link>
                </Button>
              </div>
            ))}
          </div>
        </section>
        {/* Closing */}
        <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl brand-gradient px-8 py-12 text-white shadow-lg sm:px-12 lg:py-14">
            <div className="grid items-center gap-8 md:grid-cols-[1.3fr_0.7fr]">
              <div>
                <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  Same you.
                  <br />
                  Bigger goals.
                </h2>
                <p className="mt-4 max-w-md text-white/85">Your entire student life. One intelligent hub. Free to start, works with any LMS.</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="bg-white text-brand-700 hover:bg-white/90">
                    <Link href={user ? "/dashboard" : "/signup"}>
                      Get started <ArrowRightIcon />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="ghost" className="text-white hover:bg-white/15 hover:text-white">
                    <Link href="/film">Watch the film</Link>
                  </Button>
                </div>
              </div>
              <div className="mx-auto w-48 sm:w-56">
                <Sticker src="/campaign/celebrate.webp" alt="The student jumping with his phone and laptop" width={554} height={656} pitch={1.3} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-muted sm:flex-row sm:px-8">
          <Logo compact />
          <p>© {new Date().getFullYear()} AI Hub. Built for students everywhere.</p>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      <div className="absolute -top-32 -left-2 z-10 hidden w-20 rotate-[-6deg] sm:block">
        <Sticker src="/campaign/idea.webp" alt="The student thinking, a lightbulb over his head" width={366} height={632} pitch={1.5} />
      </div>
      <div className="absolute -right-4 -bottom-24 z-10 w-28 sm:-right-8 sm:w-40 lg:-right-14 lg:w-48">
        <Sticker src="/campaign/hero.webp" alt="The AI Hub student holding his phone and a laptop open on AI Hub" width={888} height={1700} eager pitch={0.9} />
      </div>
      <div className="mr-10 rounded-3xl border border-border bg-surface p-5 shadow-lg sm:mr-16 lg:mr-24" aria-hidden>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-subtle">Tuesday, Mar 3</p>
            <p className="text-lg font-semibold">Welcome back, Andrew</p>
          </div>
          <Badge variant="brand">
            <LightbulbIcon /> AI analyzed 5 tasks
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            ["Due", "3"],
            ["High", "1"],
            ["Upcoming", "6"],
            ["Done", "12"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-surface-muted p-3">
              <p className="text-[11px] text-subtle">{l}</p>
              <p className="text-xl font-semibold">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-brand-600 dark:text-brand-300">Database Systems</p>
              <p className="font-semibold">ERD Design Project</p>
              <p className="mt-1 text-xs text-muted">Due tomorrow · Est. 2h 30m</p>
            </div>
            <Badge variant="danger">High</Badge>
          </div>
          <Progress value={45} className="mt-3" tone="brand" size="sm" />
        </div>
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-primary-soft p-4 text-sm">
          <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-300" />
          <p className="text-brand-900 dark:text-brand-100">
            Study Calculus for 45 minutes today — your problem set is due Thursday and you have not started section 3.
          </p>
        </div>
      </div>
      <div className="absolute -bottom-20 -left-6 hidden w-56 rounded-2xl border border-border bg-surface p-4 shadow-md sm:block" aria-hidden>
        <p className="text-xs font-medium text-subtle">Tonight&apos;s plan</p>
        <ul className="mt-2 space-y-1.5 text-xs">
          <li className="flex justify-between">
            <span>Calculus review</span>
            <span className="text-subtle">6:00–6:45</span>
          </li>
          <li className="flex justify-between">
            <span>Break</span>
            <span className="text-subtle">6:45–7:00</span>
          </li>
          <li className="flex justify-between">
            <span>ERD project</span>
            <span className="text-subtle">7:00–8:15</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
