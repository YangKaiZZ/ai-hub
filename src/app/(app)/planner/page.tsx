import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PlannerView } from "@/components/planner/planner-view";
import { requirePageUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getStudyPreferences, listPlans } from "@/server/planner/service";

export const metadata: Metadata = { title: "Study Planner" };

export default async function PlannerPage() {
  const user = await requirePageUser();
  const [plans, preferences, openTasks] = await Promise.all([
    listPlans(user.id),
    getStudyPreferences(user.id),
    db.task.count({ where: { userId: user.id, deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } }),
  ]);

  const proposed = plans.find((p) => p.status === "PROPOSED") ?? null;
  const active = plans.find((p) => p.status === "ACTIVE") ?? null;
  const history = plans.filter((p) => p.status === "COMPLETED" || p.status === "DISCARDED");

  return (
    <div className="space-y-6">
      <PageHeader title="Study Planner" description="AI-built daily and weekly plans that fit the time you actually have." />
      <PlannerView proposed={proposed} active={active} history={history} preferences={preferences} openTasks={openTasks} />
    </div>
  );
}
