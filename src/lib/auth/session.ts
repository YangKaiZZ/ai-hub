import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { generateToken, sha256 } from "@/lib/auth/crypto";
import type { User } from "@/generated/prisma/client";

export const SESSION_COOKIE = "aihub_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const REFRESH_AFTER_MS = 1000 * 60 * 60 * 24; // touch lastSeenAt at most daily

export type SessionUser = Pick<
  User,
  | "id"
  | "email"
  | "firstName"
  | "lastName"
  | "avatarUrl"
  | "role"
  | "timezone"
  | "institutionId"
  | "onboardingCompletedAt"
  | "onboardingStep"
>;

const sessionUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  timezone: true,
  institutionId: true,
  onboardingCompletedAt: true,
  onboardingStep: true,
} as const;

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

/** Create a DB session for the user and set the cookie. Returns the raw token. */
export async function createSession(userId: string): Promise<string> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const h = await headers();
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
      ipAddress: (h.get("x-forwarded-for") ?? h.get("x-real-ip"))?.split(",")[0]?.trim().slice(0, 64) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
  return token;
}

/** Resolve the current user from the session cookie, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findFirst({
    where: { tokenHash: sha256(token), expiresAt: { gt: new Date() }, user: { deletedAt: null } },
    include: { user: { select: sessionUserSelect } },
  });
  if (!session) return null;

  if (Date.now() - session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    // Fire-and-forget activity bump; failures here must not break requests.
    void db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
    void db.user.update({ where: { id: session.userId }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
  }

  return session.user;
}

/** Destroy the current session (logout). */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  jar.set(SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}

/** Invalidate every session for a user (e.g. after password reset). */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}
