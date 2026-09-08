import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceView } from "@/components/workspace/workspace-view";
import { requirePageUser } from "@/lib/auth/guards";
import { isAppError } from "@/lib/errors";
import { getWorkspace, type WorkspaceDetail } from "@/server/workspace/service";

export const metadata: Metadata = { title: "Workspace" };

async function loadWorkspace(userId: string, workspaceId: string): Promise<WorkspaceDetail | null> {
  try {
    return await getWorkspace(userId, workspaceId);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") return null;
    throw err;
  }
}

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const user = await requirePageUser();
  const { workspaceId } = await params;
  const workspace = await loadWorkspace(user.id, workspaceId);
  if (!workspace) notFound();
  return <WorkspaceView key={workspace.id} workspace={workspace} />;
}
