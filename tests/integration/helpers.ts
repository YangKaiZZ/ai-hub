import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Integration tests run against the real DATABASE_URL (see .env). Each test
 * file creates an isolated user and removes it afterwards — cascades clean up
 * everything the user owns.
 */
export async function createTestUser(prefix = "test") {
  const id = randomUUID();
  const user = await db.user.create({
    data: {
      id,
      email: `${prefix}+${id.slice(0, 8)}@test.aihub.local`,
      firstName: "Test",
      lastName: "Student",
      passwordHash: "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345678",
      onboardingCompletedAt: new Date(),
      preference: { create: {} },
    },
  });
  return user;
}

export async function deleteTestUser(userId: string) {
  await db.user.deleteMany({ where: { id: userId } });
}

export async function hasDatabase(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
