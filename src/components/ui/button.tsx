import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleNotchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,box-shadow,transform,color] duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow-md",
        secondary: "bg-primary-soft text-brand-700 hover:bg-brand-200 dark:text-brand-200 dark:hover:bg-brand-800/40",
        outline: "border border-border-strong bg-surface text-foreground hover:bg-surface-muted hover:border-brand-300",
        ghost: "text-muted hover:bg-surface-muted hover:text-foreground",
        danger: "bg-danger text-white hover:bg-red-700 shadow-sm",
        link: "text-primary underline-offset-4 hover:underline h-auto px-0",
        gradient: "brand-gradient text-white shadow-md hover:shadow-lg hover:brightness-105",
      },
      size: {
        xs: "h-7 px-2.5 text-xs rounded-md [&_svg]:size-3.5",
        sm: "h-8 px-3 text-xs [&_svg]:size-4",
        md: "h-10 px-4 [&_svg]:size-4",
        lg: "h-11 px-5 text-base rounded-xl [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-5",
        "icon-sm": "size-8 rounded-md [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    if (asChild) {
      // Slot requires exactly one element child; the loader is only rendered for real buttons.
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <CircleNotchIcon className="animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
