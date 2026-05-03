/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function exportedBlock(source: string, exportName: string) {
  const start = source.indexOf(`export const ${exportName}`);
  if (start === -1) {
    throw new Error(`Missing export: ${exportName}`);
  }
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function functionBlock(source: string, functionName: string) {
  const start = source.indexOf(`async function ${functionName}`);
  if (start === -1) {
    throw new Error(`Missing function: ${functionName}`);
  }
  const nextAsync = source.indexOf("\nasync function ", start + 1);
  const nextExport = source.indexOf("\nexport const ", start + 1);
  const candidates = [nextAsync, nextExport].filter((index) => index !== -1);
  const next = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, next);
}

describe("backend scale contracts", () => {
  it("keeps analytics summary tables and critical indexes in the Convex schema", () => {
    const schema = readSource("convex/schema.ts");

    [
      "adminRevenueDailySummaries",
      "clientSpendDailySummaries",
      "supplierPerformanceDailySummaries",
      "by_client_status_updated_at",
      "by_supplier_updated_at",
      "by_recipient_read_at",
      "by_updated_at",
      "by_day_client_supplier"
    ].forEach((contract) => {
      expect(schema).toContain(contract);
    });
  });

  it("keeps summary refresh hooks wired into workflow mutations", () => {
    const purchaseOrders = readSource("convex/purchaseOrders.ts");
    const orders = readSource("convex/orders.ts");
    const quotes = readSource("convex/quotes.ts");
    const rfqs = readSource("convex/rfqs.ts");

    expect(purchaseOrders).toContain("refreshPurchaseOrderAnalytics(ctx, args.purchaseOrderId)");
    expect(purchaseOrders).toContain("refreshSupplierAnalyticsForOrder(ctx, orderId)");
    expect(orders).toContain("refreshSupplierAnalyticsForOrder(ctx, args.orderId, order.updatedAt)");
    expect(quotes).toContain("refreshSupplierAnalyticsForActivity(ctx, assignment.supplierOrganizationId, now)");
    expect(rfqs).toContain("refreshSupplierAnalyticsForActivity(ctx, args.supplierOrganizationId, now)");
  });

  it("preserves cross-party anonymity in client and supplier query responses", () => {
    const quotes = readSource("convex/quotes.ts");
    const orders = readSource("convex/orders.ts");

    const clientComparison = exportedBlock(quotes, "getRfqQuoteComparison");
    expect(clientComparison).toContain("supplierAnonymousId");
    expect(clientComparison).not.toContain("supplierName");

    const supplierAssignments = functionBlock(quotes, "buildSupplierAssignmentRow");
    const supplierAssignmentDetail = exportedBlock(quotes, "getSupplierAssignmentDetail");
    const supplierOrders = functionBlock(orders, "buildSupplierOrderRow");
    expect(supplierAssignments).toContain("clientAnonymousId");
    expect(supplierAssignmentDetail).toContain("clientAnonymousId");
    expect(supplierOrders).toContain("clientAnonymousId");
    expect(supplierAssignments).not.toContain("clientName");
    expect(supplierAssignmentDetail).not.toContain("clientName");
    expect(supplierOrders).not.toContain("clientName");
  });

  it("keeps high-volume portal list reads indexed and bounded", () => {
    const catalog = readSource("convex/catalog.ts");
    const rfqs = readSource("convex/rfqs.ts");
    const quotes = readSource("convex/quotes.ts");
    const notifications = readSource("convex/notifications.ts");

    expect(exportedBlock(catalog, "listVisibleProducts")).toContain('withIndex("by_visible"');
    expect(exportedBlock(rfqs, "listRfqsForActor")).toContain('withIndex("by_client_updated_at"');
    expect(exportedBlock(rfqs, "listOperationsRfqs")).toContain("loadRecentOperationsRfqs");
    expect(exportedBlock(quotes, "listReleasedRfqsForClient")).toContain("loadReleasedRfqsForClient");
    expect(exportedBlock(notifications, "countUnreadNotificationsForActor")).toContain('withIndex("by_recipient_read_at"');
  });

  it("keeps high-volume portal queues available as paginated indexed reads", () => {
    const rfqs = readSource("convex/rfqs.ts");
    const quotes = readSource("convex/quotes.ts");
    const orders = readSource("convex/orders.ts");
    const purchaseOrders = readSource("convex/purchaseOrders.ts");

    expect(exportedBlock(rfqs, "listOperationsRfqsPaginated")).toContain('withIndex("by_updated_at"');
    expect(exportedBlock(rfqs, "listOperationsRfqsPaginated")).toContain(".paginate(args.paginationOpts)");
    expect(exportedBlock(quotes, "listReleasedRfqsForClientPaginated")).toContain('withIndex("by_client_updated_at"');
    expect(exportedBlock(quotes, "listSupplierAssignmentsPaginated")).toContain('withIndex("by_supplier_updated_at"');
    expect(exportedBlock(quotes, "listSupplierQuotesForActorPaginated")).toContain('withIndex("by_supplier_updated_at"');
    expect(exportedBlock(orders, "listOrdersForClientActorPaginated")).toContain('withIndex("by_client_updated_at"');
    expect(exportedBlock(orders, "listOrdersForSupplierActorPaginated")).toContain('withIndex("by_supplier_updated_at"');
    expect(exportedBlock(purchaseOrders, "listPurchaseOrdersForActorPaginated")).toContain('withIndex("by_client_updated_at"');
  });

  it("keeps supplier offer and product addition foundations wired for PRD Phase 1", () => {
    const schema = readSource("convex/schema.ts");
    const offers = readSource("convex/offers.ts");
    const quotes = readSource("convex/quotes.ts");

    [
      "supplierOffers",
      "productAdditionRequests",
      "savedRfqCarts",
      "by_product_supplier",
      "by_status_updated_at",
      "by_supplier_updated_at",
      "by_client_expires_at",
      "by_client_active",
      "by_category_active"
    ].forEach((contract) => {
      expect(schema).toContain(contract);
    });

    expect(exportedBlock(offers, "listProductsForSupplierOffersPaginated")).toContain('withIndex("by_visible"');
    expect(exportedBlock(offers, "listSupplierOffersForActorPaginated")).toContain('withIndex("by_supplier_updated_at"');
    expect(exportedBlock(offers, "listPendingOfferApprovalsPaginated")).toContain('withIndex("by_status_updated_at"');
    expect(exportedBlock(offers, "listProductAdditionRequestsForAdminPaginated")).toContain('withIndex("by_status_updated_at"');
    expect(exportedBlock(offers, "upsertSupplierOffer")).toContain('status: "pendingApproval"');
    expect(exportedBlock(offers, "decideSupplierOffer")).toContain('assertHasPermission(actor, "catalog:manage")');
    expect(exportedBlock(quotes, "generateAutoQuotesForRfq")).toContain("supplierOffers");
    expect(exportedBlock(quotes, "generateAutoQuotesForRfq")).toContain('withIndex("by_product_status"');
    expect(exportedBlock(quotes, "generateAutoQuotesForRfq")).toContain('status: "underReview"');
    expect(exportedBlock(quotes, "generateAutoQuotesForRfq")).toContain('status: "held"');
    expect(exportedBlock(quotes, "generateAutoQuotesForRfq")).toContain("quote.auto_generated");
    expect(quotes).toContain("recommendMarginForQuote");
    expect(quotes).toContain("QUOTE_MANAGER_HOLD_THRESHOLD");
    expect(quotes).toContain("Applied margin rule");
    expect(exportedBlock(quotes, "bulkApproveRecommendedQuotesForRfq")).toContain("recommendMarginForQuote");
    expect(exportedBlock(quotes, "bulkApproveRecommendedQuotesForRfq")).toContain("quote.bulk_approved_for_release");
    expect(exportedBlock(quotes, "bulkApproveRecommendedQuotesForRfq")).toContain("rfq.quotes_bulk_approved");
  });

  it("keeps PRD saved RFQ carts tenant-scoped, expiring, and audited", () => {
    const schema = readSource("convex/schema.ts");
    const rfqs = readSource("convex/rfqs.ts");

    expect(schema).toContain("savedRfqCarts");
    expect(schema).toContain("expiresAt");
    expect(schema).toContain('index("by_client_expires_at", ["clientOrganizationId", "expiresAt"])');
    expect(exportedBlock(rfqs, "listSavedRfqCartsForActor")).toContain('withIndex("by_client_expires_at"');
    expect(exportedBlock(rfqs, "saveSavedRfqCartForActor")).toContain("SAVED_RFQ_CART_TTL_MS");
    expect(exportedBlock(rfqs, "saveSavedRfqCartForActor")).toContain("normalizeSavedRfqCartItems");
    expect(exportedBlock(rfqs, "saveSavedRfqCartForActor")).toContain("rfq_cart.saved");
    expect(exportedBlock(rfqs, "deleteSavedRfqCartForActor")).toContain("assertSameOrganization");
    expect(exportedBlock(rfqs, "deleteSavedRfqCartForActor")).toContain("rfq_cart.deleted");
  });

  it("keeps SaaS guarantees: idempotency, rate limits, scheduler, observability", () => {
    const schema = readSource("convex/schema.ts");
    const idempotency = readSource("convex/idempotency.ts");
    const rateLimits = readSource("convex/rateLimits.ts");
    const observability = readSource("convex/observability.ts");
    const scheduled = readSource("convex/scheduled.ts");
    const crons = readSource("convex/crons.ts");
    const rfqs = readSource("convex/rfqs.ts");
    const offers = readSource("convex/offers.ts");
    const purchaseOrders = readSource("convex/purchaseOrders.ts");

    expect(schema).toContain("idempotencyKeys: defineTable");
    expect(schema).toContain('index("by_actor_action_key"');
    expect(schema).toContain("rateLimits: defineTable");
    expect(schema).toContain('index("by_actor_action_window"');
    expect(schema).toContain("mutationMetrics: defineTable");
    expect(schema).toContain('index("by_outcome_created_at"');

    expect(idempotency).toContain("lookupIdempotentResult");
    expect(idempotency).toContain("recordIdempotentResult");
    expect(rateLimits).toContain("assertWithinRateLimit");
    expect(rateLimits).toContain("RATE_LIMIT_POLICIES");
    expect(rateLimits).toContain("Rate limit exceeded");
    expect(observability).toContain("withMetrics");
    expect(observability).toContain('outcome: "success"');
    expect(observability).toContain('outcome: "error"');

    expect(scheduled).toContain("sweepExpiredSavedRfqCarts");
    expect(scheduled).toContain("sweepExpiredIdempotencyKeys");
    expect(scheduled).toContain("sweepStaleRateLimits");
    expect(scheduled).toContain("sweepOldMutationMetrics");
    expect(crons).toContain("sweep-saved-rfq-carts");
    expect(crons).toContain("sweep-idempotency-keys");
    expect(crons).toContain("sweep-rate-limits");
    expect(crons).toContain("sweep-mutation-metrics");

    const submitRfq = exportedBlock(rfqs, "submitRfq");
    expect(submitRfq).toContain("idempotencyKey");
    expect(submitRfq).toContain("lookupIdempotentResult");
    expect(submitRfq).toContain("recordIdempotentResult");
    expect(submitRfq).toContain("RATE_LIMIT_POLICIES.rfqSubmit");
    expect(submitRfq).toContain("withMetrics");

    const upsertOffer = exportedBlock(offers, "upsertSupplierOffer");
    expect(upsertOffer).toContain("RATE_LIMIT_POLICIES.supplierOfferUpsert");

    const submitProductRequest = exportedBlock(offers, "submitProductAdditionRequest");
    expect(submitProductRequest).toContain("RATE_LIMIT_POLICIES.productAdditionRequest");

    const generatePo = exportedBlock(purchaseOrders, "generatePoFromSelectedQuote");
    expect(generatePo).toContain("idempotencyKey");
    expect(generatePo).toContain("lookupIdempotentResult");
    expect(generatePo).toContain("recordIdempotentResult");
  });

  it("keeps PRD split award and per-line PO generation wired", () => {
    const schema = readSource("convex/schema.ts");
    const quotes = readSource("convex/quotes.ts");
    const purchaseOrders = readSource("convex/purchaseOrders.ts");

    expect(schema).toContain("awardedQuoteId");
    expect(schema).toContain("awardedRfqLineItemIds");
    expect(schema).toContain("awardKind");
    expect(schema).toContain('index("by_awarded_quote", ["awardedQuoteId"])');

    const splitMutation = exportedBlock(quotes, "selectAwardsByLineItem");
    expect(splitMutation).toContain("Every RFQ line item must be awarded.");
    expect(splitMutation).toContain("Selected quote does not price this line item.");
    expect(splitMutation).toContain("ensureQuoteSelectable");
    expect(splitMutation).toContain("quote.split_awarded");
    expect(splitMutation).toContain('status: "selected"');
    expect(splitMutation).toContain('status: "lost"');
    expect(splitMutation).toContain("awardedQuoteId");

    const generate = exportedBlock(purchaseOrders, "generatePoFromSelectedQuote");
    expect(generate).toContain("awardGroups");
    expect(generate).toContain("awardedRfqLineItemIds");
    expect(generate).toContain('awardKind: isSplit ? "split" : "full"');
    expect(generate).toContain("Every line item must be awarded before generating purchase orders.");
    expect(generate).toContain("purchaseOrderIds.push(purchaseOrderId)");

    expect(purchaseOrders).toContain("scopedRfqLineItemIds");
  });
});
