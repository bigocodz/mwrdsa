/**
 * Slice 26 — E2E: shared auth helpers for all portal smoke tests.
 * Uses demo credentials that seed:seedDevelopmentData creates.
 */
import type { Page } from "@playwright/test";

export const DEMO_CREDS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@mwrd.local",
    password: process.env.E2E_ADMIN_PASSWORD ?? "Demo123!@#"
  },
  client: {
    email: process.env.E2E_CLIENT_EMAIL ?? "client@mwrd.local",
    password: process.env.E2E_CLIENT_PASSWORD ?? "Demo123!@#"
  },
  supplier: {
    email: process.env.E2E_SUPPLIER_EMAIL ?? "supplier@mwrd.local",
    password: process.env.E2E_SUPPLIER_PASSWORD ?? "Demo123!@#"
  }
};

/** Login helper — fills email/password, clicks submit, awaits navigation */
export async function login(
  page: Page,
  creds: { email: string; password: string }
): Promise<void> {
  await page.goto("/auth/login");
  await page.waitForLoadState("networkidle");

  // Fill email
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  await emailInput.fill(creds.email);

  // Fill password
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.fill(creds.password);

  // Submit
  await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();

  // Wait until the URL changes away from login
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
    timeout: 20_000
  });
}

/** Logout helper */
export async function logout(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: /sign out|تسجيل الخروج/i }).first();
  if (await trigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await trigger.click();
    await page.waitForURL(/\/auth\/login/, { timeout: 10_000 });
  }
}
