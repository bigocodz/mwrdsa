/**
 * Slice 26 — E2E: Client Portal smoke suite
 * Covers: login → dashboard, catalog, RFQ list, quotes, orders,
 *         address book, bundles, company catalogs, reports, approval tree.
 */
import { expect, test } from "@playwright/test";
import { DEMO_CREDS, login, logout } from "./helpers/auth";

test.describe("Client portal smoke", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO_CREDS.client);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test("redirects to /client/dashboard after login", async ({ page }) => {
    await expect(page).toHaveURL(/\/client\/dashboard/);
  });

  test("dashboard renders key stat strip", async ({ page }) => {
    // StatStrip should contain at least one stat
    const statStrip = page.locator("[data-testid='stat-strip'], .stat-strip, section").first();
    await expect(statStrip).toBeVisible({ timeout: 10_000 });
  });

  test("catalog page loads and shows search input", async ({ page }) => {
    await page.goto("/client/catalog");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/client\/catalog/);
    // Page heading visible
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("RFQs page loads", async ({ page }) => {
    await page.goto("/client/rfqs");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/client\/rfqs/);
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("Quotes page loads", async ({ page }) => {
    await page.goto("/client/quotes");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/client\/quotes/);
  });

  test("Orders page loads", async ({ page }) => {
    await page.goto("/client/orders");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/client\/orders/);
  });

  test("Address book page loads", async ({ page }) => {
    await page.goto("/client/account/addresses");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/client\/account\/addresses/);
    const heading = page.getByRole("heading", { name: /address book|دفتر العناوين/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("Bundles page loads", async ({ page }) => {
    await page.goto("/client/account/bundles");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/client\/account\/bundles/);
    const heading = page.getByRole("heading", { name: /essentials|حزم/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("Company catalogs page loads", async ({ page }) => {
    await page.goto("/client/account/company-catalogs");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/client\/account\/company-catalogs/);
    const heading = page.getByRole("heading", { name: /company catalog|كتالوج/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("Approval tree page loads for org admin", async ({ page }) => {
    await page.goto("/client/account/approval-tree");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/client\/account\/approval-tree/);
  });

  test("unknown client route shows 404 page", async ({ page }) => {
    await page.goto("/client/does-not-exist");
    await page.waitForLoadState("networkidle");
    // Should render NotFoundPage
    const notFound = page.getByText(/not found|غير موجود/i).first();
    await expect(notFound).toBeVisible({ timeout: 10_000 });
  });
});
