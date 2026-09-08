import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-surface-muted text-muted",
        brand: "border-transparent bg-primary-soft text-brand-700 dark:text-brand-200",
        success: "border-transparent bg-success-soft text-green-700 dark:text-green-300",
        warning: "border-transparent bg-warning-soft text-amber-700 dark:text-amber-300",
        danger: "border-transparent bg-danger-soft text-red-700 dark:text-red-300",
        info: "border-transparent bg-info-soft text-blue-700 dark:text-blue-300",
        outline: "border-border text-muted",
        solid: "border-transparent bg-primary text-primary-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
