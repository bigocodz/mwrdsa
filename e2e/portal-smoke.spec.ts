import { expect, test } from "@playwright/test";

test("admin dashboard renders", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page.getByRole("heading", { name: /بوابة الإدارة|Admin Portal/ })).toBeVisible();
});
