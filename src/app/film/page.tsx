import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon, DownloadSimpleIcon } from "@/components/icons";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { FILM_POSTER, FILM_SRC, FilmPlayer } from "@/components/campaign/film-player";
import { Sticker } from "@/components/campaign/sticker";

export const metadata: Metadata = {
  title: "The film",
  description: "55 seconds from seven deadlines to a planned week: the AI Hub film.",
  openGraph: { images: [FILM_POSTER], videos: [FILM_SRC] },
};

const chapters = [
  ["0:00", "Overload"],
  ["0:07", "The idea"],
  ["0:12", "AI Hub"],
  ["0:17", "Smart priorities"],
  ["0:25", "AI Tutor"],
  ["0:32", "Answers with sources"],
  ["0:37", "AI Plan My Week"],
  ["0:42", "Grades + LMS sync"],
  ["0:47", "Same you. Bigger goals."],
];

export default function FilmPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <Button asChild>
            <Link href="/signup">
              Get started <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] brand-gradient-soft" aria-hidden />
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">The AI Hub film</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Your entire student life. <span className="text-gradient">One intelligent hub.</span>
            </h1>
          </div>

          <FilmPlayer className="mt-10" />

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_0.6fr]">
            <div>
              <h2 className="text-lg font-semibold">Chapters</h2>
              <ol className="mt-4 grid gap-2 sm:grid-cols-3">
                {chapters.map(([time, name]) => (
                  <li key={time} className="flex items-baseline gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm">
                    <span className="font-mono text-xs text-subtle">{time}</span>
                    {name}
                  </li>
                ))}
              </ol>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
                {["Built with HyperFrames", "Original music and sound design", "Every screen is the real app"].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <CheckCircleIcon className="size-4 text-success" /> {t}
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="mt-6">
                <a href={FILM_SRC} download="ai-hub-film.mp4">
                  <DownloadSimpleIcon /> Download MP4
                </a>
              </Button>
            </div>
            <div className="mx-auto w-44 lg:w-52">
              <Sticker src="/campaign/wave.webp" alt="The student waving" width={412} height={634} pitch={1.2} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
