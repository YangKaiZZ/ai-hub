import { z } from "zod";
import { ok, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { createUserInstitution, searchInstitutions } from "@/server/institutions/service";

export const GET = route(async (req) => {
  await requireUser();
  const { q } = parseQuery(req, z.object({ q: z.string().trim().max(120).default("") }));
  const institutions = await searchInstitutions(q);
  return ok({ institutions });
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  country: z.string().trim().max(80).optional().nullable(),
  type: z.enum(["UNIVERSITY", "COLLEGE", "HIGH_SCHOOL", "BOOTCAMP", "ONLINE", "OTHER"]).optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, createSchema);
  const institution = await createUserInstitution({ ...input, timezone: user.timezone });
  return ok({ institution }, { status: 201 });
});
