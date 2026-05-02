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

// Resolved lazily inside each test so that `playwright test --list`
// (and unrelated tests) don't fail when the env vars aren't set.
const admin = () => ({
  email: requireEnv("E2E_ADMIN_EMAIL"),
  password: requireEnv("E2E_ADMIN_PASSWORD"),
});
const member = () => ({
  email: requireEnv("E2E_MEMBER_EMAIL"),
  password: requireEnv("E2E_MEMBER_PASSWORD"),
});

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-submit").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 10_000,
  });
}

test.describe("permission gating", () => {
  test("non-admin member sees only Settings + Organizers tabs", async ({ page }) => {
    const { email, password } = member();
    await login(page, email, password);
    await page.goto("/organizations");

    const orgLink = page.getByTestId(/^link-org-/).first();
    await expect(orgLink).toBeVisible();
    await orgLink.click();

    await expect(page.getByTestId("tab-settings")).toBeVisible();
    await expect(page.getByTestId("tab-organizers")).toBeVisible();
    await expect(page.getByTestId("tab-spvs")).toHaveCount(0);
    await expect(page.getByTestId("tab-members")).toHaveCount(0);
    await expect(page.getByTestId("tab-invites")).toHaveCount(0);

    await expect(page.getByTestId("button-edit")).toHaveCount(0);
  });

  test("admin sees all five tabs and the Edit button", async ({ page }) => {
    const { email, password } = admin();
    await login(page, email, password);
    await page.goto("/organizations");

    const orgLink = page.getByTestId(/^link-org-/).first();
    await orgLink.click();

    await expect(page.getByTestId("tab-settings")).toBeVisible();
    await expect(page.getByTestId("tab-organizers")).toBeVisible();
    await expect(page.getByTestId("tab-spvs")).toBeVisible();
    await expect(page.getByTestId("tab-members")).toBeVisible();
    await expect(page.getByTestId("tab-invites")).toBeVisible();

    await expect(page.getByTestId("button-edit")).toBeVisible();
  });
});
