"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

let audio: AudioContext | null = null;

/** A short synthesized "pop" (no audio files): a sine chirp with a fast decay. */
function playPop(pitch: number) {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(380 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(1000 * pitch, t + 0.05);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  } catch {
    // Audio is a flourish; a browser without Web Audio still gets the wiggle.
  }
}

/**
 * A die-cut sticker of the AI Hub student. Clicking it plays a little pop and a
 * wiggle, the same spring the stickers land with in the film.
 */
export function Sticker({
  src,
  alt,
  width,
  height,
  className,
  pitch = 1,
  eager = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  pitch?: number;
  /** Above-the-fold stickers load eagerly (Next 16 replaced `priority` with this). */
  eager?: boolean;
}) {
  const [popping, setPopping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pop() {
    playPop(pitch);
    setPopping(false);
    if (timer.current) clearTimeout(timer.current);
    requestAnimationFrame(() => setPopping(true));
    timer.current = setTimeout(() => setPopping(false), 650);
  }

  return (
    <button
      type="button"
      onClick={pop}
      aria-label={`${alt} (plays a pop sound)`}
      className={cn("sticker-btn rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", popping && "sticker-pop", className)}
    >
      <Image src={src} alt="" width={width} height={height} loading={eager ? "eager" : undefined} className="sticker-img h-auto w-full select-none" draggable={false} />
    </button>
  );
}
