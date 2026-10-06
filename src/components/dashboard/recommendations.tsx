import Link from "next/link";
import { ArrowRightIcon, LightbulbIcon } from "@/components/icons";
import type { Recommendation } from "@/server/recommendations/service";

export function Recommendations({ items }: { items: Recommendation[] }) {
  return (
    <section aria-labelledby="recs-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-lg brand-gradient text-white">
          <LightbulbIcon className="size-4" />
        </span>
        <h2 id="recs-heading" className="text-base font-semibold">
          AI Recommendations
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">Add tasks and deadlines to start receiving recommendations.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((r) => {
            const content = (
              <>
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span className="flex-1 text-sm leading-relaxed">{r.text}</span>
                {r.href ? <ArrowRightIcon className="mt-1 size-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-primary" /> : null}
              </>
            );
            return (
              <li key={r.id}>
                {r.href ? (
                  <Link href={r.href} className="group flex items-start gap-3 rounded-xl bg-surface-muted/70 px-3.5 py-3 transition hover:bg-primary-soft">
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl bg-surface-muted/70 px-3.5 py-3">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
