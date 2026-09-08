import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end student journey against a running dev server (mock AI provider).
 *   signup → onboarding → dashboard → create task → open workspace → upload document → ask AI
 * Each run uses a unique email so it can be re-run without cleanup.
 */
const password = "Password123";

/** Stable per run and per project (desktop/mobile), even if a worker restarts. */
function email() {
  const run = process.env.E2E_RUN_ID ?? "local";
  return `e2e+${run}-${test.info().project.name}@test.aihub.local`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email());
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function signupAndOnboard(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Eve");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email());
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: /continue/i }).click(); // name step

  // Institution: skip
  await expect(page.getByText(/where do you study/i)).toBeVisible();
  await page.getByRole("button", { name: /skip for now|continue/i }).click();

  // Platform
  await page.getByRole("button", { name: /add tasks manually/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();

  // Courses
  await page.getByLabel("Course name").first().fill("Database Systems");
  await page.getByLabel("Code").first().fill("CS135");
  await page.getByRole("button", { name: /continue/i }).click();

  // Preferences
  await expect(page.getByText(/how do you like to study/i)).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();

  // Done
  await page.getByRole("button", { name: /go to dashboard/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial("student journey", () => {
  test("signup and onboarding lead to the dashboard", async ({ page }) => {
    await signupAndOnboard(page);
    await expect(page.getByRole("heading", { name: /welcome back, eve/i })).toBeVisible();
    await expect(page.getByText("Database Systems")).toBeVisible();
  });

  test("create a task, analyze it and open its workspace", async ({ page }) => {
    await login(page);

    await page.goto("/tasks?new=1");
    await page.getByLabel("Title").fill("ERD Design Project");
    await page.getByLabel("Estimated time (min)").fill("150");
    await page.getByLabel("Description").fill("Design a normalized ERD for a library system.");
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("link", { name: "ERD Design Project" })).toBeVisible();

    await page.getByRole("link", { name: "ERD Design Project" }).click();
    await expect(page).toHaveURL(/\/tasks\//);
    await page.getByRole("button", { name: /^analyze$/i }).click();
    await expect(page.getByText(/recommended steps/i)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("link", { name: "Open Workspace" }).first().click();
    await expect(page).toHaveURL(/\/workspace\//);
    await expect(page.getByText(/ask ai about this assignment/i)).toBeVisible();

    // Ask the AI (mock provider streams a deterministic reply).
    await page.getByRole("button", { name: "Break this into steps" }).click();
    await expect(page.getByText(/way to break this into steps/i)).toBeVisible({ timeout: 30_000 });
  });

  test("upload a document and find it in resources", async ({ page }) => {
    await login(page);

    await page.goto("/resources");
    await expect(page.getByRole("button", { name: /upload documents/i })).toBeVisible();
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles({ name: "week4-notes.txt", mimeType: "text/plain", buffer: Buffer.from("Derivatives of exponential functions. The chain rule extends this to e^{g(x)}.\n\nLogarithmic differentiation helps with products and powers.") });
    await expect(page.getByText(/indexed \d+ section/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "week4-notes" })).toBeVisible();

    // AI semantic search returns a passage from the uploaded file.
    await page.getByLabel("Search resources").fill("chain rule");
    await page.getByRole("button", { name: /ai search/i }).click();
    await expect(page.getByText(/passages matching/i)).toBeVisible({ timeout: 15_000 });
  });

  test("tutor conversation streams a reply", async ({ page }) => {
    await login(page);

    await page.goto("/tutor");
    await page.getByRole("textbox", { name: "Message" }).fill("I don't understand the chain rule.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText(/demo response|chain rule/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/tutor\?c=/);
  });
});

test("responsive: mobile navigation renders", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile project only");
  await login(page);
  await expect(page.getByRole("navigation", { name: "Quick navigation" })).toBeVisible();
});
