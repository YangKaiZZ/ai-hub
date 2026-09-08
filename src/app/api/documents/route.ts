import { z } from "zod";
import { ok, parseQuery, parseWith, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { listDocuments, uploadDocument } from "@/server/documents/service";

export const GET = route(async (req) => {
  const user = await requireUser();
  const { courseId } = parseQuery(req, z.object({ courseId: z.string().uuid().optional() }));
  return ok({ documents: await listDocuments(user.id, { courseId }) });
});

const metaSchema = z.object({ courseId: z.string().uuid().optional().nullable(), taskId: z.string().uuid().optional().nullable() });

export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit(RATE_LIMITS.upload, user.id);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Expected multipart form data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "Missing file", { userMessage: "Choose a file to upload." });
  const meta = parseWith(metaSchema, { courseId: form.get("courseId") || null, taskId: form.get("taskId") || null });

  const data = Buffer.from(await file.arrayBuffer());
  const document = await uploadDocument(user.id, { fileName: file.name, browserMimeType: file.type || null, data, courseId: meta.courseId, taskId: meta.taskId });
  return ok({ document }, { status: 201 });
});
