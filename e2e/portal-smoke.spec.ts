import { expect, test } from "@playwright/test";

test("admin dashboard renders", async ({ page }) => {
  await page.goto("/auth/login");
  await page.locator('input[type="email"]').fill(process.env.E2E_ADMIN_EMAIL ?? "admin@mwrd.local");
  await page.locator('input[type="password"]').fill(process.env.E2E_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: /تسجيل الدخول|Sign in/ }).click();

  await expect(page.getByRole("heading", { name: /بوابة الإدارة|Admin Portal/ })).toBeVisible();
});
