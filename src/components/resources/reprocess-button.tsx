"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { apiPost } from "@/lib/client/api";

export function ReprocessButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  return (
    <Button
      variant="outline"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await apiPost(`/api/documents/${documentId}/reprocess`);
          toast.success("Document re-indexed");
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not reprocess");
        } finally {
          setLoading(false);
        }
      }}
    >
      <RefreshCw /> Reprocess
    </Button>
  );
}
