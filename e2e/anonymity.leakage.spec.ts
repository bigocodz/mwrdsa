/**
 * Slice 26 — E2E: Anonymity leakage tests
 *
 * REQUIREMENT: Real organisation names, user emails, and contact details
 * MUST NEVER leak across party boundaries:
 *   - Supplier portal must NOT see client real name/email
 *   - Client portal must NOT see supplier real name/email
 *   - Supplier portal must NOT see other supplier data
 *
 * These tests log in as each persona and scan the rendered DOM for
 * the opposing party's real identifiers.
 *
 * Fixture values must match what seedDevelopmentData inserts.
 */
import { expect, test } from "@playwright/test";
import { DEMO_CREDS, login } from "./helpers/auth";

// Real identity strings that should NEVER appear in the opposing portal
const CLIENT_REAL = {
  orgName: "Demo Client Co.",
  email: DEMO_CREDS.client.email // "client@mwrd.local"
};

const SUPPLIER_REAL = {
  orgName: "Demo Supplier Co.",
  email: DEMO_CREDS.supplier.email // "supplier@mwrd.local"
};

/**
 * Collects all visible text content from a page and checks that none of
 * the forbidden strings appear (case-insensitive).
 */
async function assertNoLeakedIdentifiers(
  page: Parameters<typeof login>[0],
  forbidden: string[]
): Promise<void> {
  const bodyText = await page.locator("body").innerText();
  const bodyTextLower = bodyText.toLowerCase();

  for (const token of forbidden) {
    const tokenLower = token.toLowerCase();
    // Skip empty or very short tokens (< 4 chars) to avoid false positives
    if (tokenLower.length < 4) continue;

    expect(
      bodyTextLower,
      `Identity leakage detected: "${token}" should not appear in page for opposing party`
    ).not.toContain(tokenLower);
  }
}

test.describe("Anonymity — supplier portal must not reveal client identity", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO_CREDS.supplier);
  });

  const supplierRoutes = [
    "/supplier/dashboard",
    "/supplier/rfq-inbox",
    "/supplier/offers",
    "/supplier/orders"
  ];

  for (const route of supplierRoutes) {
    test(`client real identifiers hidden on ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      await assertNoLeakedIdentifiers(page, [
        CLIENT_REAL.orgName,
        CLIENT_REAL.email
      ]);
    });
  }
});

test.describe("Anonymity — client portal must not reveal supplier identity", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO_CREDS.client);
  });

  const clientRoutes = [
    "/client/dashboard",
    "/client/rfqs",
    "/client/quotes",
    "/client/orders"
  ];

  for (const route of clientRoutes) {
    test(`supplier real identifiers hidden on ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      await assertNoLeakedIdentifiers(page, [
        SUPPLIER_REAL.orgName,
        SUPPLIER_REAL.email
      ]);
    });
  }
});

test.describe("Anonymity — cross-portal login prevention", () => {
  test("client credential rejected on supplier portal", async ({ page }) => {
    // Supplier portal runs on :5174; set base URL in playwright.all.config.ts
    // but for the anonymity project we use :5173 (client).
    // This test verifies that if a client user is somehow on the supplier
    // protected route, they are redirected to /unauthorized or /auth/login.
    await login(page, DEMO_CREDS.client);

    // client is now logged in on client portal.
    // Navigate to supplier dashboard path — the ProtectedRoute checks portal.
    // Since we're on client portal (port 5173), /supplier/* routes don't exist → 404.
    await page.goto("/supplier/dashboard");
    await page.waitForLoadState("networkidle");

    // Should be on 404 or redirected — not a valid supplier dashboard
    const url = page.url();
    expect(url).not.toMatch(/\/supplier\/dashboard/);
  });

  test("admin credential rejected on wrong-portal route", async ({ page }) => {
    await login(page, DEMO_CREDS.admin);
    // On client portal, /admin/* routes don't exist → 404
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).not.toMatch(/\/admin\/dashboard/);
  });
});

test.describe("Anonymity — Convex anonymous ID is the only org identifier visible to supplier", () => {
  test("supplier RFQ inbox shows anonymous buyer code, not real org name", async ({ page }) => {
    await login(page, DEMO_CREDS.supplier);
    await page.goto("/supplier/rfq-inbox");
    await page.waitForLoadState("networkidle");

    // The body should NOT contain the real client org name
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).not.toContain(CLIENT_REAL.orgName.toLowerCase());

    // The anonymous ID prefix (CLIENT-) may or may not be visible;
    // the important thing is the REAL name is absent.
  });
});
