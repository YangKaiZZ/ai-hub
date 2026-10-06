import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getAdminOverview, maskEmail } from "@/server/admin/service";
import { deleteTestUser, hasDatabase } from "./helpers";

/**
 * The demo admin's password is public, so its view of the admin dashboard must
 * not reveal who has signed up. These tests create one "real" user and one demo
 * user and check what each kind of viewer gets back.
 */

const dbAvailable = await hasDatabase();
const realId = randomUUID();
const demoId = randomUUID();
const realEmail = `jane.realperson+${realId.slice(0, 6)}@gmail.example`;
const demoEmail = `viewer+${demoId.slice(0, 6)}@demo.aihub.local`;

beforeAll(async () => {
  if (!dbAvailable) return;
  // Brand-new rows, so both land in the "25 most recent users" list.
  await db.user.createMany({
    data: [
      { id: realId, email: realEmail, firstName: "Jane", lastName: "Realperson", passwordHash: "x" },
      { id: demoId, email: demoEmail, firstName: "Demo", lastName: "Viewer", passwordHash: "x" },
    ],
  });
});

afterAll(async () => {
  if (dbAvailable) await Promise.all([deleteTestUser(realId), deleteTestUser(demoId)]);
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain only", () => {
    expect(maskEmail("jane.doe@gmail.com")).toBe("j•••@gmail.com");
    expect(maskEmail("not-an-email")).toBe("•••");
  });
});

describe.skipIf(!dbAvailable)("admin overview for the public demo admin", () => {
  it("hides real users' names and emails", async () => {
    const overview = await getAdminOverview({ redactPeople: true });
    const real = overview.recentUsers.find((u) => u.id === realId);
    expect(real).toBeDefined();
    expect(real?.email).not.toContain("realperson");
    expect(real?.email).toMatch(/^j•••@gmail\.example$/);
    expect(real?.firstName).toBe("J.");
    expect(real?.lastName).toBeNull();
    // Nothing identifying survives anywhere in the payload.
    expect(JSON.stringify(overview)).not.toContain("Realperson");
  });

  it("leaves demo accounts readable, since nobody is behind them", async () => {
    const overview = await getAdminOverview({ redactPeople: true });
    const demo = overview.recentUsers.find((u) => u.id === demoId);
    expect(demo?.email).toBe(demoEmail);
    expect(demo?.lastName).toBe("Viewer");
  });

  it("shows a real admin everything, as before", async () => {
    const overview = await getAdminOverview();
    const real = overview.recentUsers.find((u) => u.id === realId);
    expect(real?.email).toBe(realEmail);
    expect(real?.lastName).toBe("Realperson");
  });
});
