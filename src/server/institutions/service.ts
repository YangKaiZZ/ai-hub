import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import type { InstitutionType, IntegrationProvider } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export interface InstitutionOption {
  id: string;
  name: string;
  shortName: string | null;
  country: string | null;
  city: string | null;
  type: InstitutionType;
  defaultLms: IntegrationProvider | null;
  isVerified: boolean;
}

const select = { id: true, name: true, shortName: true, country: true, city: true, type: true, defaultLms: true, isVerified: true } as const;

export async function searchInstitutions(q: string, limit = 10): Promise<InstitutionOption[]> {
  const term = q.trim();
  if (!term) {
    return db.institution.findMany({ where: { isVerified: true }, select, orderBy: { name: "asc" }, take: limit });
  }
  return db.institution.findMany({
    where: {
      OR: [{ name: { contains: term, mode: "insensitive" } }, { shortName: { contains: term, mode: "insensitive" } }, { emailDomains: { has: term.toLowerCase() } }],
    },
    select,
    orderBy: [{ isVerified: "desc" }, { name: "asc" }],
    take: limit,
  });
}

/** "My school isn't listed": create an unverified, user-supplied institution (deduped by slug). */
export async function createUserInstitution(input: { name: string; country?: string | null; type?: InstitutionType; timezone?: string }) {
  const baseSlug = slugify(input.name) || "institution";
  const existing = await db.institution.findUnique({ where: { slug: baseSlug }, select });
  if (existing) return existing;
  return db.institution.create({
    data: {
      name: input.name.trim(),
      slug: baseSlug,
      country: input.country ?? null,
      type: input.type ?? "UNIVERSITY",
      timezone: input.timezone ?? "UTC",
      isUserCreated: true,
      isVerified: false,
      gradingConfig: { scale: "percentage", passingGrade: 60 },
      termConfig: { system: "semester", termsPerYear: 2 },
    },
    select,
  });
}

/** Institutions shipped with the app so the picker is never empty. */
export const SEED_INSTITUTIONS: Array<{
  name: string;
  slug: string;
  shortName?: string;
  country: string;
  city?: string;
  type?: InstitutionType;
  emailDomains?: string[];
  timezone: string;
  defaultLms?: IntegrationProvider;
  gradingConfig: Prisma.InputJsonObject;
  termConfig: Prisma.InputJsonObject;
}> = [
  { name: "Mapúa University", slug: "mapua-university", shortName: "Mapúa", country: "Philippines", city: "Manila", emailDomains: ["mymail.mapua.edu.ph", "mapua.edu.ph"], timezone: "Asia/Manila", defaultLms: "BLACKBOARD", gradingConfig: { scale: "gpa4-inverse", passingGrade: 3.0, bands: [{ min: 96, label: "1.00" }, { min: 90, label: "1.25" }, { min: 84, label: "1.50" }, { min: 78, label: "1.75" }, { min: 72, label: "2.00" }, { min: 66, label: "2.25" }, { min: 60, label: "2.50" }, { min: 55, label: "2.75" }, { min: 50, label: "3.00" }, { min: 0, label: "5.00" }] }, termConfig: { system: "quarter", termsPerYear: 4 } },
  { name: "University of the Philippines Diliman", slug: "up-diliman", shortName: "UPD", country: "Philippines", city: "Quezon City", emailDomains: ["up.edu.ph"], timezone: "Asia/Manila", defaultLms: "MOODLE", gradingConfig: { scale: "gpa5-inverse", passingGrade: 3.0 }, termConfig: { system: "semester", termsPerYear: 2 } },
  { name: "De La Salle University", slug: "dlsu", shortName: "DLSU", country: "Philippines", city: "Manila", emailDomains: ["dlsu.edu.ph"], timezone: "Asia/Manila", defaultLms: "CANVAS", gradingConfig: { scale: "gpa4", passingGrade: 1.0 }, termConfig: { system: "trimester", termsPerYear: 3 } },
  { name: "Ateneo de Manila University", slug: "ateneo", shortName: "ADMU", country: "Philippines", city: "Quezon City", emailDomains: ["ateneo.edu", "obf.ateneo.edu"], timezone: "Asia/Manila", defaultLms: "CANVAS", gradingConfig: { scale: "letter", passingGrade: 60 }, termConfig: { system: "semester", termsPerYear: 2 } },
  { name: "Massachusetts Institute of Technology", slug: "mit", shortName: "MIT", country: "United States", city: "Cambridge, MA", emailDomains: ["mit.edu"], timezone: "America/New_York", defaultLms: "CANVAS", gradingConfig: { scale: "gpa5", passingGrade: 60 }, termConfig: { system: "semester", termsPerYear: 2 } },
  { name: "Stanford University", slug: "stanford", country: "United States", city: "Stanford, CA", emailDomains: ["stanford.edu"], timezone: "America/Los_Angeles", defaultLms: "CANVAS", gradingConfig: { scale: "gpa4", passingGrade: 60 }, termConfig: { system: "quarter", termsPerYear: 4 } },
  { name: "University of Toronto", slug: "uoft", shortName: "U of T", country: "Canada", city: "Toronto", emailDomains: ["utoronto.ca", "mail.utoronto.ca"], timezone: "America/Toronto", defaultLms: "CANVAS", gradingConfig: { scale: "percentage", passingGrade: 50 }, termConfig: { system: "semester", termsPerYear: 2 } },
  { name: "University of Oxford", slug: "oxford", country: "United Kingdom", city: "Oxford", emailDomains: ["ox.ac.uk"], timezone: "Europe/London", defaultLms: "CANVAS", gradingConfig: { scale: "percentage", passingGrade: 40 }, termConfig: { system: "term", termsPerYear: 3 } },
  { name: "National University of Singapore", slug: "nus", shortName: "NUS", country: "Singapore", emailDomains: ["u.nus.edu", "nus.edu.sg"], timezone: "Asia/Singapore", defaultLms: "CANVAS", gradingConfig: { scale: "gpa5", passingGrade: 50 }, termConfig: { system: "semester", termsPerYear: 2 } },
  { name: "University of Melbourne", slug: "unimelb", country: "Australia", city: "Melbourne", emailDomains: ["unimelb.edu.au", "student.unimelb.edu.au"], timezone: "Australia/Melbourne", defaultLms: "CANVAS", gradingConfig: { scale: "percentage", passingGrade: 50 }, termConfig: { system: "semester", termsPerYear: 2 } },
  { name: "Technische Universität München", slug: "tum", shortName: "TUM", country: "Germany", city: "Munich", emailDomains: ["tum.de", "mytum.de"], timezone: "Europe/Berlin", defaultLms: "MOODLE", gradingConfig: { scale: "german", passingGrade: 4.0 }, termConfig: { system: "semester", termsPerYear: 2 } },
  { name: "Community College (generic)", slug: "community-college", country: "United States", type: "COLLEGE", timezone: "America/Chicago", defaultLms: "BLACKBOARD", gradingConfig: { scale: "percentage", passingGrade: 60 }, termConfig: { system: "semester", termsPerYear: 2 } },
];

export async function seedInstitutions() {
  for (const inst of SEED_INSTITUTIONS) {
    await db.institution.upsert({
      where: { slug: inst.slug },
      update: { name: inst.name, shortName: inst.shortName ?? null, country: inst.country, city: inst.city ?? null, emailDomains: inst.emailDomains ?? [], timezone: inst.timezone, defaultLms: inst.defaultLms ?? null, gradingConfig: inst.gradingConfig, termConfig: inst.termConfig, isVerified: true },
      create: { name: inst.name, slug: inst.slug, shortName: inst.shortName ?? null, country: inst.country, city: inst.city ?? null, type: inst.type ?? "UNIVERSITY", emailDomains: inst.emailDomains ?? [], timezone: inst.timezone, defaultLms: inst.defaultLms ?? null, gradingConfig: inst.gradingConfig, termConfig: inst.termConfig, isVerified: true },
    });
  }
}
