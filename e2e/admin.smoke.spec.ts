/**
 * Slice 26 — E2E: Backoffice / Admin portal smoke suite
 * Covers: login → dashboard, leads, KYC, operations, catalog,
 *         clients, suppliers, offers, three-way-match, reports, audit,
 *         internal users (superadmin).
 */
import { expect, test } from "@playwright/test";
import { DEMO_CREDS, login, logout } from "./helpers/auth";

test.describe("Admin portal smoke", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO_CREDS.admin);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test("redirects to /admin/dashboard after login", async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });
  });

  test("admin dashboard heading is visible", async ({ page }) => {
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  const adminRoutes = [
    ["/admin/leads", /leads|العملاء المحتملون/i],
    ["/admin/kyc", /kyc|التحقق/i],
    ["/admin/operations", /operations|العمليات/i],
    ["/admin/clients", /clients|العملاء/i],
    ["/admin/suppliers", /suppliers|الموردون/i],
    ["/admin/catalog", /catalog|الكتالوج/i],
    ["/admin/offers", /offers|عروض/i],
    ["/admin/three-way-match", /three.way|match|مطابقة/i],
    ["/admin/reports", /reports|التقارير/i],
    ["/admin/audit", /audit|التدقيق/i],
    ["/admin/internal-users", /internal users|المستخدمون الداخليون/i]
  ] as [string, RegExp][];

  for (const [route, headingPattern] of adminRoutes) {
    test(`${route} page loads`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(new RegExp(route.replace("/", "\\/").replace(/\//g, "\\/")));
      const heading = page.getByRole("heading", { name: headingPattern }).first();
      await expect(heading).toBeVisible({ timeout: 15_000 });
    });
  }

  test("unknown admin route shows 404 page", async ({ page }) => {
    await page.goto("/admin/does-not-exist");
    await page.waitForLoadState("networkidle");
    const notFound = page.getByText(/not found|غير موجود/i).first();
    await expect(notFound).toBeVisible({ timeout: 10_000 });
  });
});
