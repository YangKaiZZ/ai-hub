import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex size-9 items-center justify-center rounded-xl brand-gradient text-white shadow-md", className)}
      aria-hidden
    >
      <Sparkles className="size-[55%]" strokeWidth={2.4} />
    </span>
  );
}

export function Logo({ href = "/", compact = false, className }: { href?: string; compact?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} aria-label="AI Hub home">
      <LogoMark />
      {!compact ? (
        <span className="text-lg font-semibold tracking-tight">
          AI <span className="text-gradient">Hub</span>
        </span>
      ) : null}
    </Link>
  );
}
