import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateToken, sha256 } from "@/lib/auth/crypto";
import { createSession, destroyAllSessions } from "@/lib/auth/session";
import { AppError, ConflictError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { LoginInput, SignupInput } from "@/server/auth/schemas";
import { sendEmail } from "@/server/email";

const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

export async function signup(input: SignupInput) {
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new ConflictError("Email already registered", "An account with this email already exists.");

  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName || null,
      timezone: input.timezone ?? "UTC",
      preference: { create: {} },
    },
    select: { id: true, email: true, firstName: true },
  });

  await createSession(user.id);
  logger.info("auth", "user signed up", { userId: user.id });
  return user;
}

export async function login(input: LoginInput) {
  const user = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true, deletedAt: true, onboardingCompletedAt: true },
  });

  // Constant-ish time: always run the hash comparison even for unknown users.
  const valid = await verifyPassword(input.password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!user || !valid || user.deletedAt) {
    throw new UnauthorizedError("Invalid credentials");
  }

  await createSession(user.id);
  logger.info("auth", "user logged in", { userId: user.id });
  return { id: user.id, onboardingCompleted: Boolean(user.onboardingCompletedAt) };
}

/**
 * Always resolves successfully to avoid leaking whether an email exists.
 * The reset link is delivered via the configured EmailProvider.
 */
export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, firstName: true, deletedAt: true } });
  if (!user || user.deletedAt) return;

  const token = generateToken(32);
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });

  const link = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Reset your AI Hub password",
    text: `Hi ${user.firstName},\n\nUse the link below to reset your password. It expires in 1 hour.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ValidationError("This reset link is invalid or has expired.", { token: "Invalid or expired link" });
  }

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await destroyAllSessions(record.userId);
  logger.info("auth", "password reset completed", { userId: record.userId });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new UnauthorizedError();
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError("VALIDATION_ERROR", "Wrong current password", {
      details: { currentPassword: "Current password is incorrect" },
      userMessage: "Current password is incorrect.",
    });
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
}
