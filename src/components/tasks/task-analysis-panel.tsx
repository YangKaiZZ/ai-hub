"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwiseIcon, BookBookmarkIcon, LightbulbIcon, ListChecksIcon, WarningIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { apiPost } from "@/lib/client/api";
import { formatMinutes, formatRelative } from "@/lib/utils";
import type { TaskAnalysis } from "@/server/ai/intelligence/schemas";

const difficultyVariant: Record<TaskAnalysis["difficulty"], "success" | "info" | "warning" | "danger"> = {
  easy: "success",
  medium: "info",
  hard: "warning",
  very_hard: "danger",
};

export function TaskAnalysisPanel({ taskId, analysis, analyzedAt }: { taskId: string; analysis: TaskAnalysis | null; analyzedAt: Date | null }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [mock, setMock] = React.useState(false);

  async function analyze() {
    setLoading(true);
    try {
      const res = await apiPost<{ mock: boolean }>(`/api/tasks/${taskId}/analyze`);
      setMock(res.mock);
      toast.success("Analysis updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not analyze this task right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <LightbulbIcon className="size-4 text-brand-500" /> AI analysis
          </CardTitle>
          <p className="mt-1 text-xs text-subtle">{analyzedAt ? `Updated ${formatRelative(analyzedAt)}` : "Not analyzed yet"}</p>
        </div>
        <Button size="sm" variant={analysis ? "ghost" : "primary"} onClick={analyze} loading={loading}>
          {analysis ? <ArrowClockwiseIcon /> : <LightbulbIcon />}
          {analysis ? "Re-analyze" : "Analyze"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!analysis ? (
          <p className="text-sm text-muted">Let the AI estimate effort, extract requirements and suggest a plan for this task.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant={difficultyVariant[analysis.difficulty]}>{analysis.difficulty.replace("_", " ")}</Badge>
              <Badge>~{formatMinutes(analysis.estimatedMinutes)}</Badge>
              <Badge variant="brand">Importance {analysis.importance}/5</Badge>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">{analysis.summary}</p>

            {analysis.recommendedSteps.length ? (
              <section>
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                  <ListChecksIcon className="size-3.5" /> Recommended steps
                </h4>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {analysis.recommendedSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </section>
            ) : null}

            {analysis.rubricRequirements.length ? (
              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Rubric requirements</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {analysis.rubricRequirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {analysis.keyConcepts.length ? (
              <section>
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                  <BookBookmarkIcon className="size-3.5" /> Key concepts
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.keyConcepts.map((c) => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}

            {analysis.requiredMaterials.length ? (
              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Materials</h4>
                <p className="text-sm text-muted">{analysis.requiredMaterials.join(" · ")}</p>
              </section>
            ) : null}

            {analysis.risks.length ? (
              <section className="rounded-xl bg-warning-soft p-3 text-sm text-amber-800 dark:text-amber-200">
                <p className="mb-1 flex items-center gap-1.5 font-semibold">
                  <WarningIcon className="size-3.5" /> Watch out
                </p>
                <ul className="list-disc pl-5">
                  {analysis.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {mock ? <p className="text-[11px] text-subtle">Demo analysis — connect an AI provider for full results.</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
