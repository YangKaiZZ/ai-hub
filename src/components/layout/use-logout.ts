"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { toast } from "@/components/ui/toaster";

export function useLogout() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const logout = React.useCallback(async () => {
    setPending(true);
    try {
      await apiPost("/api/auth/logout");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Could not sign out. Please try again.");
      setPending(false);
    }
  }, [router]);

  return { logout, pending };
}
