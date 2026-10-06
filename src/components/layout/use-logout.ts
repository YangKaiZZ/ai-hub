"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { toast } from "@/components/ui/toaster";

export function useLogout(redirectTo = "/login") {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const logout = React.useCallback(async () => {
    setPending(true);
    try {
      await apiPost("/api/auth/logout");
      router.push(redirectTo);
      router.refresh();
    } catch {
      toast.error("Could not sign out. Please try again.");
      setPending(false);
    }
  }, [router, redirectTo]);

  return { logout, pending };
}
