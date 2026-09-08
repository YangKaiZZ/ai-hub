import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

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
