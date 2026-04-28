import { expect, test } from "@playwright/test";

test("admin dashboard renders", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page.getByText(/بوابة الإدارة|Admin Portal/)).toBeVisible();
});
