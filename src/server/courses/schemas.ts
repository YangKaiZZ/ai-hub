import { z } from "zod";

export const COURSE_COLORS = ["violet", "indigo", "blue", "sky", "teal", "emerald", "amber", "orange", "rose", "pink"] as const;
export const COURSE_ICONS = [
  "book-open",
  "code",
  "database",
  "sigma",
  "flask-conical",
  "atom",
  "pen-line",
  "landmark",
  "briefcase",
  "cpu",
  "globe",
  "palette",
] as const;

export type CourseColor = (typeof COURSE_COLORS)[number];
export type CourseIcon = (typeof COURSE_ICONS)[number];

export const createCourseSchema = z.object({
  name: z.string().trim().min(1, "Course name is required").max(120),
  code: z.string().trim().max(32).optional().or(z.literal("")),
  instructor: z.string().trim().max(120).optional().or(z.literal("")),
  instructorEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  color: z.enum(COURSE_COLORS).default("violet"),
  icon: z.enum(COURSE_ICONS).default("book-open"),
  credits: z.coerce.number().min(0).max(30).optional().nullable(),
  targetGrade: z.coerce.number().min(0).max(100).optional().nullable(),
  termId: z.string().uuid().optional().nullable(),
});

export const updateCourseSchema = createCourseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const gradeCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  weight: z.coerce.number().min(0).max(100),
  dropLowest: z.coerce.number().int().min(0).max(10).default(0),
});

export const setGradeCategoriesSchema = z.object({
  categories: z.array(gradeCategorySchema.extend({ id: z.string().uuid().optional() })).max(20),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
