"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const FILM_SRC = "/campaign/ai-hub-film.mp4";
export const FILM_POSTER = "/campaign/ai-hub-film-poster.jpg";

/**
 * The 55-second AI Hub film. It starts on its poster with one big "play with
 * sound" control, because browsers only autoplay video muted and the film's
 * music and sound design are half of it.
 */
export function FilmPlayer({ className }: { className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function play() {
    const v = video.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    void v.play();
    setStarted(true);
  }

  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-3xl border border-border bg-surface shadow-lg", className)}>
      <video
        ref={video}
        className="size-full object-cover"
        src={FILM_SRC}
        poster={FILM_POSTER}
        preload="metadata"
        playsInline
        controls={started}
        onEnded={() => setStarted(false)}
        aria-label="AI Hub film: a student goes from seven deadlines to a planned week"
      />
      {!started ? (
        <button
          type="button"
          onClick={play}
          className="group absolute inset-0 flex items-end justify-start bg-gradient-to-t from-[#17162a]/40 via-transparent to-transparent p-4 focus-visible:outline-none sm:p-8"
          aria-label="Play the AI Hub film with sound"
        >
          <span className="inline-flex items-center gap-2.5 rounded-full bg-white/95 py-1.5 pl-1.5 pr-4 text-sm font-semibold text-[#17162a] sm:gap-3 sm:py-3 sm:pl-3 sm:pr-6 sm:text-base shadow-lg ring-1 ring-black/5 transition group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-brand-400">
            <span className="inline-flex size-8 items-center justify-center rounded-full brand-gradient text-white sm:size-11">
              <svg viewBox="0 0 24 24" className="ml-0.5 size-5 fill-current" aria-hidden>
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
              </svg>
            </span>
            Play with sound · 0:55
          </span>
        </button>
      ) : null}
    </div>
  );
}
