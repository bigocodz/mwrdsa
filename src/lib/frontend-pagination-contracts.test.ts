/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("frontend pagination contracts", () => {
  it("uses paginated Convex APIs on high-volume client screens", () => {
    const clientCatalog = readSource("src/features/catalog/pages/client-catalog-page.tsx");
    const clientRfqs = readSource("src/features/rfq/pages/client-rfqs-page.tsx");
    const clientQuotes = readSource("src/features/quotes/pages/client-quotes-page.tsx");
    const clientOrders = readSource("src/features/orders/pages/client-orders-page.tsx");

    expect(clientCatalog).toContain("usePaginatedQuery");
    expect(clientCatalog).toContain("listVisibleProductsPaginated");
    expect(clientCatalog).toContain("loadMoreProducts");
    expect(clientRfqs).toContain("listRfqsForActorPaginated");
    expect(clientRfqs).toContain("listVisibleProductsPaginated");
    expect(clientRfqs).toContain("listSavedRfqCartsForActor");
    expect(clientRfqs).toContain("saveSavedRfqCartForActor");
    expect(clientRfqs).toContain("deleteSavedRfqCartForActor");
    expect(clientRfqs).toContain("loadMoreRfqs");
    expect(clientQuotes).toContain("listReleasedRfqsForClientPaginated");
    expect(clientQuotes).toContain("loadMoreReleasedRfqs");
    expect(clientOrders).toContain("listPurchaseOrdersForActorPaginated");
    expect(clientOrders).toContain("listOrdersForClientActorPaginated");
    expect(clientOrders).toContain("loadMorePurchaseOrders");
    expect(clientOrders).toContain("loadMoreOrders");
  });

  it("uses paginated Convex APIs on admin high-volume lists", () => {
    const adminCatalog = readSource("src/features/admin/pages/catalog-management-page.tsx");
    const adminWorkspace = readSource("src/features/admin/pages/admin-workspace-pages.tsx");

    expect(adminCatalog).toContain("usePaginatedQuery");
    expect(adminCatalog).toContain("listProductsForAdminPaginated");
    expect(adminCatalog).toContain("loadMoreProducts");
    expect(adminWorkspace).toContain("listOperationsRfqsPaginated");
    expect(adminWorkspace).toContain("loadMoreOperations");
  });

  it("uses paginated Convex APIs on supplier queue screens", () => {
    const supplierWorkspace = readSource("src/features/supplier/pages/supplier-workspace-pages.tsx");
    const supplierOffers = readSource("src/features/offers/pages/supplier-offers-page.tsx");

    expect(supplierWorkspace).toContain("listSupplierAssignmentsPaginated");
    expect(supplierWorkspace).toContain("listSupplierQuotesForActorPaginated");
    expect(supplierWorkspace).toContain("listOrdersForSupplierActorPaginated");
    expect(supplierWorkspace).toContain("loadMoreAssignments");
    expect(supplierWorkspace).toContain("loadMoreQuotes");
    expect(supplierWorkspace).toContain("loadMoreOrders");
    expect(supplierOffers).toContain("listProductsForSupplierOffersPaginated");
    expect(supplierOffers).toContain("listSupplierOffersForActorPaginated");
    expect(supplierOffers).toContain("loadMoreProducts");
    expect(supplierOffers).toContain("loadMoreOffers");
  });

  it("routes the PRD supplier-offer workspaces into admin and supplier portals", () => {
    const supplierRouter = readSource("src/routes/supplier-router.tsx");
    const backofficeRouter = readSource("src/routes/backoffice-router.tsx");
    const supplierNav = readSource("src/features/supplier/hooks/use-supplier-nav.tsx");
    const adminNav = readSource("src/features/admin/hooks/use-admin-nav.tsx");
    const adminPricing = readSource("src/features/admin/pages/admin-rfq-pricing-page.tsx");

    expect(supplierRouter).toContain("SupplierOffersPage");
    expect(backofficeRouter).toContain("AdminOfferApprovalsPage");
    expect(supplierRouter).toContain('path: "offers"');
    expect(backofficeRouter).toContain('path: "offers"');
    expect(supplierNav).toContain("/supplier/offers");
    expect(adminNav).toContain("/admin/offers");
    expect(adminPricing).toContain("generateAutoQuotesForRfq");
    expect(adminPricing).toContain("bulkApproveRecommendedQuotesForRfq");
    expect(adminPricing).toContain("Generate auto-quotes");
    expect(adminPricing).toContain("Approve recommended");
    expect(adminPricing).toContain("Recommended margin");
    expect(adminPricing).toContain("Threshold hold");
  });

  it("isolates per-portal builds with their own router and entry point", () => {
    const clientRouter = readSource("src/routes/client-router.tsx");
    const supplierRouter = readSource("src/routes/supplier-router.tsx");
    const backofficeRouter = readSource("src/routes/backoffice-router.tsx");
    const protectedRoute = readSource("src/routes/protected-route.tsx");

    expect(clientRouter).not.toContain("SupplierOffersPage");
    expect(clientRouter).not.toContain("AdminDashboardPage");
    expect(supplierRouter).not.toContain("ClientDashboardPage");
    expect(supplierRouter).not.toContain("AdminDashboardPage");
    expect(backofficeRouter).not.toContain("ClientDashboardPage");
    expect(backofficeRouter).not.toContain("SupplierDashboardPage");

    expect(protectedRoute).toContain("getBuildPortalType");
    expect(protectedRoute).toContain("buildPortal !== portal");
  });

  it("enforces portal-aware idle timeouts and refuses cross-portal sign-in", () => {
    const idle = readSource("src/lib/use-idle-signout.ts");
    const auth = readSource("src/lib/auth.tsx");
    const login = readSource("src/pages/login-page.tsx");

    expect(idle).toContain("useIdleSignOut");
    expect(idle).toContain("IDLE_EVENTS");
    expect(idle).toContain("visibilitychange");

    expect(auth).toContain("getPortalIdleTimeoutMs");
    expect(auth).toContain("BACKOFFICE_IDLE_TIMEOUT_MS = 15 * 60 * 1000");
    expect(auth).toContain("PUBLIC_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000");
    expect(auth).toContain("useIdleSignOut(");
    expect(auth).toContain("reason=idle");

    expect(login).toContain("getBuildPortalType");
    expect(login).toContain("user.portal !== buildPortal");
    expect(login).toContain("This account is not authorized for this portal");
    expect(login).toContain("void signOut()");
    expect(login).toContain('reason") === "idle"');
    expect(login).toContain("crossPortalNotice");
  });
});
