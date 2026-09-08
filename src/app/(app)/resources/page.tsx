import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ResourcesView } from "@/components/resources/resources-view";
import { requirePageUser } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { listCourseOptions } from "@/server/courses/service";
import { listResources, resourceTypeEnum } from "@/server/resources/service";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ courseId?: string; type?: string; q?: string; document?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;

  // Deep links from search results point at a document; send them to its resource page.
  if (sp.document) {
    const res = await db.resource.findFirst({ where: { userId: user.id, documentId: sp.document, deletedAt: null }, select: { id: true } });
    if (res) redirect(`/resources/${res.id}`);
  }

  const type = resourceTypeEnum.safeParse(sp.type);
  const [resources, courses] = await Promise.all([
    listResources(user.id, { courseId: sp.courseId, type: type.success ? type.data : undefined, q: sp.q }),
    listCourseOptions(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Resources" description="Notes, uploads, links and study material — all searchable, all available to the AI Tutor." />
      <ResourcesView resources={resources} courses={courses} courseId={sp.courseId} type={type.success ? type.data : undefined} q={sp.q} maxUploadMb={env.MAX_UPLOAD_MB} />
    </div>
  );
}
