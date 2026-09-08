import { ok, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { deleteDocument, getDocument, getDocumentChunks } from "@/server/documents/service";

type Ctx = { params: Promise<{ documentId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).documentId);
  const [doc, chunks] = await Promise.all([getDocument(user.id, id), getDocumentChunks(user.id, id, 20)]);
  const { storageKey: _key, ...document } = doc;
  void _key;
  return ok({ document, chunks });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).documentId);
  await deleteDocument(user.id, id);
  return ok({ deleted: true });
});
