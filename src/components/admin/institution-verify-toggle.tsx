"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { apiPatch } from "@/lib/client/api";

export function InstitutionVerifyToggle({ id, verified }: { id: string; verified: boolean }) {
  const router = useRouter();
  const [value, setValue] = React.useState(verified);
  const [busy, setBusy] = React.useState(false);
  return (
    <Switch
      checked={value}
      disabled={busy}
      aria-label="Verified"
      onCheckedChange={async (v) => {
        setBusy(true);
        setValue(v);
        try {
          await apiPatch(`/api/admin/institutions/${id}`, { isVerified: v });
          router.refresh();
        } catch (err) {
          setValue(!v);
          toast.error(err instanceof Error ? err.message : "Could not update");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
