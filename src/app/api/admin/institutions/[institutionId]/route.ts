import { z } from "zod";
import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { assertNotDemo, requireAdmin } from "@/lib/auth/guards";
import { setInstitutionVerified } from "@/server/admin/service";

type Ctx = { params: Promise<{ institutionId: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin();
  assertNotDemo(admin, "change institutions");
  const id = parseWith(uuidSchema, (await params).institutionId);
  const { isVerified } = await parseBody(req, z.object({ isVerified: z.boolean() }));
  return ok({ institution: await setInstitutionVerified(id, isVerified) });
});
