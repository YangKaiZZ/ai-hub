import { ok, parseBody, parseWith, route, uuidSchema } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { setGradeCategoriesSchema } from "@/server/courses/schemas";
import { setGradeCategories } from "@/server/courses/service";

type Ctx = { params: Promise<{ courseId: string }> };

export const PUT = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = parseWith(uuidSchema, (await params).courseId);
  const { categories } = await parseBody(req, setGradeCategoriesSchema);
  const saved = await setGradeCategories(user.id, courseId, categories);
  return ok({ categories: saved });
});
