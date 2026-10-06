/**
 * The seeded demo accounts (see prisma/seed.ts).
 *
 * These credentials are intentionally public: they exist so a visitor can open
 * a deployed AI Hub and look around without signing up. They only work on a
 * deployment that ran the seed, and the accounts own nothing but demo data.
 *
 * Because every visitor shares the same login, anything one visitor changes
 * about the account itself is seen by the next. `isDemoEmail` is what the
 * server uses to refuse those changes and to give the shared login its own AI
 * allowance.
 */
export const DEMO_ACCOUNT = {
  email: "andrew@demo.aihub.local",
  password: "Password123",
} as const;

/** Every seeded account lives on this domain, including the demo admin. */
export const DEMO_EMAIL_DOMAIN = "demo.aihub.local";

export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}
