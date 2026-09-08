"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FlashcardDeck({ cards }: { cards: { front: string; back: string }[] }) {
  const [order, setOrder] = React.useState(() => cards.map((_, i) => i));
  const [pos, setPos] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const card = cards[order[pos] ?? 0];
  if (!card) return null;

  const go = (delta: number) => {
    setFlipped(false);
    setPos((p) => (p + delta + order.length) % order.length);
  };
  const shuffle = () => {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j]!, next[i]!];
    }
    setOrder(next);
    setPos(0);
    setFlipped(false);
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Flashcards · {pos + 1} / {cards.length}
        </h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={shuffle} aria-label="Shuffle">
            <Shuffle />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setOrder(cards.map((_, i) => i));
              setPos(0);
              setFlipped(false);
            }}
            aria-label="Reset order"
          >
            <RotateCcw />
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className={cn(
          "flex min-h-52 w-full items-center justify-center rounded-2xl border p-8 text-center text-lg transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          flipped ? "border-brand-300 bg-primary-soft text-brand-900 dark:text-brand-100" : "border-border bg-surface-muted",
        )}
        aria-label={flipped ? "Showing answer. Click to show question." : "Showing question. Click to reveal answer."}
      >
        <span>{flipped ? card.back : card.front}</span>
      </button>
      <p className="mt-2 text-center text-xs text-subtle">{flipped ? "Answer" : "Click the card to reveal the answer"}</p>
      <div className="mt-4 flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={() => go(-1)} aria-label="Previous card">
          <ChevronLeft /> Prev
        </Button>
        <Button variant="outline" size="sm" onClick={() => go(1)} aria-label="Next card">
          Next <ChevronRight />
        </Button>
      </div>
    </section>
  );
}
