import { parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getDocumentFile } from "@/server/documents/service";

type Ctx = { params: Promise<{ documentId: string }> };

/** Streams the original file back to its owner (inline for PDFs/images, attachment otherwise). */
export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseWith(uuidSchema, (await params).documentId);
  const { doc, data } = await getDocumentFile(user.id, id);
  const inline = doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/");
  const download = new URL(req.url).searchParams.get("download") === "1";
  const encodedName = encodeURIComponent(doc.name);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `${inline && !download ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
});
