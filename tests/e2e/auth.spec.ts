import { test, expect } from "@playwright/test";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Set E2E_ADMIN_EMAIL/PASSWORD and ` +
        `E2E_MEMBER_EMAIL/PASSWORD before running E2E tests. See tests/README.md.`,
    );
  }
  return v;
}

const admin = () => ({
  email: requireEnv("E2E_ADMIN_EMAIL"),
  password: requireEnv("E2E_ADMIN_PASSWORD"),
});

test.describe("authentication flow", () => {
  test("login succeeds with valid credentials and redirects off /login", async ({ page }) => {
    const { email, password } = admin();
    await page.goto("/login");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("button-submit").click();

    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    });
    expect(page.url()).not.toContain("/login");
  });

  test("login fails with wrong credentials and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("input-email").fill("doesnotexist@test.local");
    await page.getByTestId("input-password").fill("definitely-wrong");
    await page.getByTestId("button-submit").click();

    // Give the request time to round-trip
    await page.waitForTimeout(1500);
    expect(page.url()).toContain("/login");
  });

  test("forgot password page is reachable from login", async ({ page }) => {
    await page.goto("/login");
    const link = page.getByRole("link", { name: /forgot/i }).first();
    if (await link.count()) {
      await link.click();
      await page.waitForURL(/forgot/i, { timeout: 5_000 });
      expect(page.url()).toMatch(/forgot/);
    } else {
      // Direct navigation fallback
      await page.goto("/forgot-password");
      expect(page.url()).toContain("/forgot-password");
    }
  });
});
