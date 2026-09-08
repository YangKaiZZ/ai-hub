import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "flex min-h-[96px] w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-xs transition-[border-color,box-shadow] placeholder:text-subtle",
      "hover:border-border-strong focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15",
      "disabled:cursor-not-allowed disabled:opacity-60",
      invalid && "border-danger focus:border-danger focus:ring-danger/15",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
