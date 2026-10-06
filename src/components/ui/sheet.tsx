"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Side drawer built on Radix Dialog; used for mobile navigation and side panels. */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "left" | "right" | "bottom"; hideClose?: boolean }
>(({ className, children, side = "left", hideClose, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 flex flex-col bg-surface-elevated shadow-lg",
        side === "left" && "inset-y-0 left-0 h-dvh w-[86vw] max-w-xs border-r border-border data-[state=open]:animate-slide-in-left",
        side === "right" && "inset-y-0 right-0 h-dvh w-[92vw] max-w-md border-l border-border data-[state=open]:animate-slide-in-right",
        side === "bottom" && "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-t border-border data-[state=open]:animate-slide-in-bottom",
        className,
      )}
      {...props}
    >
      {children}
      {!hideClose ? (
        <DialogPrimitive.Close
          className="absolute right-3 top-3 rounded-md p-1.5 text-subtle transition hover:bg-surface-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
