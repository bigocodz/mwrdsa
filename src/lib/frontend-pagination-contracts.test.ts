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
    const router = readSource("src/routes/router.tsx");
    const supplierNav = readSource("src/features/supplier/hooks/use-supplier-nav.tsx");
    const adminNav = readSource("src/features/admin/hooks/use-admin-nav.tsx");
    const adminPricing = readSource("src/features/admin/pages/admin-rfq-pricing-page.tsx");

    expect(router).toContain("SupplierOffersPage");
    expect(router).toContain("AdminOfferApprovalsPage");
    expect(router).toContain('path: "offers"');
    expect(supplierNav).toContain("/supplier/offers");
    expect(adminNav).toContain("/admin/offers");
    expect(adminPricing).toContain("generateAutoQuotesForRfq");
    expect(adminPricing).toContain("bulkApproveRecommendedQuotesForRfq");
    expect(adminPricing).toContain("Generate auto-quotes");
    expect(adminPricing).toContain("Approve recommended");
    expect(adminPricing).toContain("Recommended margin");
    expect(adminPricing).toContain("Threshold hold");
  });
});
