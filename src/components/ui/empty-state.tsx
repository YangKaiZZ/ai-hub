import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact, className, ...props }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-surface/60 text-center",
        compact ? "px-5 py-8" : "px-6 py-14",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          className={cn(
            "mb-4 flex items-center justify-center rounded-2xl bg-primary-soft text-brand-600 dark:text-brand-300 [&_svg]:size-6",
            compact ? "size-11" : "size-14 [&_svg]:size-7",
          )}
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <h3 className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-base")}>{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
