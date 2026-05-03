/**
 * Slice 26 — E2E: Supplier Portal smoke suite
 * Covers: login → dashboard, RFQ inbox, offers, orders, performance.
 */
import { expect, test } from "@playwright/test";
import { DEMO_CREDS, login, logout } from "./helpers/auth";

test.describe("Supplier portal smoke", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO_CREDS.supplier);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test("redirects to /supplier/dashboard after login", async ({ page }) => {
    await expect(page).toHaveURL(/\/supplier\/dashboard/, { timeout: 15_000 });
  });

  test("supplier dashboard heading is visible", async ({ page }) => {
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("RFQ inbox page loads", async ({ page }) => {
    await page.goto("/supplier/rfq-inbox");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/supplier\/rfq-inbox/);
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("Offers page loads", async ({ page }) => {
    await page.goto("/supplier/offers");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/supplier\/offers/);
  });

  test("Orders page loads", async ({ page }) => {
    await page.goto("/supplier/orders");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/supplier\/orders/);
  });

  test("Performance page loads", async ({ page }) => {
    await page.goto("/supplier/performance");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/supplier\/performance/);
  });

  test("unknown supplier route shows 404 page", async ({ page }) => {
    await page.goto("/supplier/does-not-exist");
    await page.waitForLoadState("networkidle");
    const notFound = page.getByText(/not found|غير موجود/i).first();
    await expect(notFound).toBeVisible({ timeout: 10_000 });
  });
});
