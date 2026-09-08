"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border !border-border !bg-surface-elevated !text-foreground !shadow-lg font-sans",
          description: "!text-muted",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-surface-muted !text-foreground",
          success: "[&_svg]:!text-success",
          error: "[&_svg]:!text-danger",
          warning: "[&_svg]:!text-warning",
          info: "[&_svg]:!text-info",
        },
      }}
    />
  );
}

export { toast } from "sonner";
