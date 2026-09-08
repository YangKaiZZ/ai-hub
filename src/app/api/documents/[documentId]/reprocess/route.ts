import { ok, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { getDocument, processDocument } from "@/server/documents/service";

type Ctx = { params: Promise<{ documentId: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  await enforceRateLimit(RATE_LIMITS.upload, user.id);
  const id = parseWith(uuidSchema, (await params).documentId);
  await processDocument(user.id, id);
  const doc = await getDocument(user.id, id);
  const { storageKey: _key, ...document } = doc;
  void _key;
  return ok({ document });
});
