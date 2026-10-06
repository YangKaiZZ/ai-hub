import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { isDemoEmail } from "@/lib/demo";
import { DemoReadOnlyError, ForbiddenError, UnauthorizedError } from "@/lib/errors";

/** Memoised per request so layouts/pages/components can all call it cheaply. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => getSessionUser());

/** For API routes / server actions: throws if unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ForbiddenError("Admin access required");
  return user;
}

/**
 * Refuses changes to the account itself when it is the shared demo login.
 *
 * Every visitor signs in as the same demo user, so a password change, a new
 * name or a revoked session would land on the next visitor too, and deleting
 * the account would break the demo for everyone. Coursework (tasks, notes,
 * uploads) stays editable: that is what the demo is for.
 */
export function assertNotDemo(user: Pick<SessionUser, "email">, action: string): void {
  if (isDemoEmail(user.email)) throw new DemoReadOnlyError(action);
}

/** For pages: redirects to login when signed out, to onboarding when incomplete. */
export async function requirePageUser(options: { allowIncompleteOnboarding?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!options.allowIncompleteOnboarding && !user.onboardingCompletedAt) redirect("/onboarding");
  return user;
}

/**
 * Ownership assertion used by every service that loads a record by id.
 * Records are always loaded with `where: { id, userId }` as the first line of
 * defence; this is the explicit second check for records fetched via relations.
 */
export function assertOwnership(record: { userId: string } | null | undefined, userId: string, entity = "Resource") {
  if (!record) throw new ForbiddenError(`${entity} not accessible`);
  if (record.userId !== userId) throw new ForbiddenError(`${entity} belongs to another user`);
}
