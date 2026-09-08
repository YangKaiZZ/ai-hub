import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, invalid, leftIcon, ...props }, ref) => {
  const input = (
    <input
      type={type}
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-xs transition-[border-color,box-shadow] placeholder:text-subtle",
        "hover:border-border-strong focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15",
        "disabled:cursor-not-allowed disabled:opacity-60 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        invalid && "border-danger focus:border-danger focus:ring-danger/15",
        leftIcon && "pl-9",
        className,
      )}
      {...props}
    />
  );
  if (!leftIcon) return input;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-subtle [&_svg]:size-4">
        {leftIcon}
      </span>
      {input}
    </div>
  );
});
Input.displayName = "Input";

export { Input };
