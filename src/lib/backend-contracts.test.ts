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

  it("keeps the dual-PO model (CPO + SPO + transactionRef) wired", () => {
    const schema = readSource("convex/schema.ts");
    const purchaseOrders = readSource("convex/purchaseOrders.ts");
    const numbers = readSource("convex/numbers.ts");
    const seed = readSource("convex/seed.ts");

    expect(schema).toContain('type: v.optional(v.union(v.literal("cpo"), v.literal("spo")))');
    expect(schema).toContain("transactionRef: v.optional(v.string())");
    expect(schema).toContain('linkedPurchaseOrderId: v.optional(v.id("purchaseOrders"))');
    expect(schema).toContain('index("by_transaction_ref"');
    expect(schema).toContain('index("by_client_type_updated_at"');

    expect(numbers).toContain("MWRD-TXN-");
    expect(numbers).toContain("MWRD-CPO-");
    expect(numbers).toContain("MWRD-SPO-");
    expect(numbers).toContain("generateTransactionRef");

    const generate = exportedBlock(purchaseOrders, "generatePoFromSelectedQuote");
    expect(generate).toContain('type: "cpo"');
    expect(generate).toContain('type: "spo"');
    expect(generate).toContain("generateTransactionRef");
    expect(generate).toContain("linkedPurchaseOrderId: cpoId");

    const send = exportedBlock(purchaseOrders, "sendPurchaseOrderToSupplier");
    expect(send).toContain("Pass the CPO id; the SPO is dispatched automatically.");
    expect(send).toContain("by_transaction_ref");
    expect(send).toContain('purchaseOrderId: orderPurchaseOrderId');

    expect(purchaseOrders).toContain("isClientFacingPurchaseOrder");

    expect(seed).toContain("demoTransactionRef");
    expect(seed).toContain('type: "cpo"');
    expect(seed).toContain('type: "spo"');
    expect(seed).toContain("purchaseOrderId: spoId");
  });

  it("keeps Approval Tree (approvalNodes + approvalTasks) wired with cycle detection", () => {
    const schema = readSource("convex/schema.ts");
    const approvals = readSource("convex/approvals.ts");
    const purchaseOrders = readSource("convex/purchaseOrders.ts");
    const clientRouter = readSource("src/routes/client-router.tsx");
    const clientNav = readSource("src/features/rfq/hooks/use-client-nav.tsx");

    expect(schema).toContain("approvalNodes: defineTable");
    expect(schema).toContain("approvalTasks: defineTable");
    expect(schema).not.toContain("approvalInstances:");
    expect(schema).toContain('index("by_organization_member"');
    expect(schema).toContain('index("by_po_order"');
    expect(schema).toContain('index("by_approver_status"');

    expect(approvals).toContain("computeApprovalChain");
    const setApprover = exportedBlock(approvals, "setDirectApprover");
    expect(setApprover).toContain("Approver chain would create a cycle.");
    expect(setApprover).toContain("A user cannot approve themselves.");
    expect(setApprover).toContain("Approver must belong to the same organization.");
    expect(setApprover).toContain('assertHasPermission(actor, "user:invite")');
    expect(setApprover).toContain("approval_node.set");

    const tree = exportedBlock(approvals, "listApprovalTreeForActor");
    expect(tree).toContain("computeApprovalChain");

    const generate = exportedBlock(purchaseOrders, "generatePoFromSelectedQuote");
    expect(generate).toContain("resolveDefaultApproverChain");
    expect(generate).toContain('"approvalTasks"');
    expect(generate).toContain('orderInChain: index');

    const decide = exportedBlock(purchaseOrders, "decidePurchaseOrder");
    expect(decide).toContain("Only the next approver in the chain can act on this purchase order.");
    expect(decide).toContain("Purchase order has no pending approval task.");
    expect(decide).not.toContain("approvalInstances");

    expect(clientRouter).toContain("ClientApprovalTreePage");
    expect(clientRouter).toContain('path: "account/approval-tree"');
    expect(clientNav).toContain('"/client/account/approval-tree"');
  });

  it("keeps Leads + KYC queues wired into the backoffice", () => {
    const schema = readSource("convex/schema.ts");
    const publicAuth = readSource("convex/publicAuth.ts");
    const backofficeRouter = readSource("src/routes/backoffice-router.tsx");
    const adminNav = readSource("src/features/admin/hooks/use-admin-nav.tsx");

    expect(schema).toContain('v.literal("callbackCompleted")');
    expect(schema).toContain("kycSubmittedAt");
    expect(schema).toContain("kycDecision");
    expect(schema).toContain("kycDecisionNote");
    expect(schema).toContain("kycDecidedAt");
    expect(schema).toContain("kycDocuments");

    const callback = exportedBlock(publicAuth, "markCallbackComplete");
    expect(callback).toContain('status: "callbackCompleted"');

    const activation = exportedBlock(publicAuth, "completeActivation");
    expect(activation).toContain('status: "pendingKyc"');
    expect(activation).toContain("kycSubmittedAt: now");

    const leads = exportedBlock(publicAuth, "listPendingLeads");
    expect(leads).toContain('"pendingCallback"');
    expect(leads).toContain('"callbackCompleted"');
    expect(leads).toContain('assertHasPermission(actor, "audit:view")');

    const kycList = exportedBlock(publicAuth, "listPendingKycReviews");
    expect(kycList).toContain('"pendingKyc"');
    expect(kycList).toContain("crNumber");
    expect(kycList).toContain("vatNumber");

    const decide = exportedBlock(publicAuth, "decideKycReview");
    expect(decide).toContain("kyc.approved");
    expect(decide).toContain("kyc.rejected");
    expect(decide).toContain("kyc.more_requested");
    expect(decide).toContain('status: "active"');
    expect(decide).toContain('status: "suspended"');
    expect(decide).toContain('A note is required when rejecting or requesting more documents.');

    expect(backofficeRouter).toContain('path: "leads"');
    expect(backofficeRouter).toContain('path: "kyc"');
    expect(adminNav).toContain('"/admin/leads"');
    expect(adminNav).toContain('"/admin/kyc"');
  });

  it("keeps the public callback registration flow wired and isolated from backoffice", () => {
    const schema = readSource("convex/schema.ts");
    const publicAuth = readSource("convex/publicAuth.ts");
    const auth = readSource("convex/auth.ts");
    const clientRouter = readSource("src/routes/client-router.tsx");
    const supplierRouter = readSource("src/routes/supplier-router.tsx");
    const backofficeRouter = readSource("src/routes/backoffice-router.tsx");

    expect(schema).toContain('v.literal("pendingCallback")');
    expect(schema).toContain('v.literal("pendingKyc")');
    expect(schema).toContain("activationStatus");
    expect(schema).toContain("activationToken");
    expect(schema).toContain("activationTokenExpiresAt");
    expect(schema).toContain("callbackNotes");
    expect(schema).toContain("crNumber");
    expect(schema).toContain("vatNumber");
    expect(schema).toContain("onboardingCompleted");
    expect(schema).toContain('index("by_activation_token", ["activationToken"])');

    const register = exportedBlock(publicAuth, "publicRegisterRequest");
    expect(register).toContain("RATE_LIMIT_POLICIES.publicRegister");
    expect(register).toContain('status: "pendingCallback"');
    expect(register).toContain('activationStatus: "awaitingCallback"');
    expect(register).toContain('roles: [role]');
    expect(register).not.toContain('"superAdmin"');
    expect(register).not.toContain('"operationsManager"');

    const callback = exportedBlock(publicAuth, "markCallbackComplete");
    expect(callback).toContain('assertHasPermission(actor, "audit:view")');
    expect(callback).toContain("activationToken: token");
    expect(callback).toContain('activationStatus: "callbackCompleted"');

    const lookup = exportedBlock(publicAuth, "lookupActivationToken");
    expect(lookup).toContain('withIndex("by_activation_token"');
    expect(lookup).toContain('user.activationStatus !== "callbackCompleted"');

    const complete = exportedBlock(publicAuth, "completeActivation");
    expect(complete).toContain('status: "pendingKyc"');
    expect(complete).toContain('activationStatus: "activated"');
    expect(complete).toContain("activationToken: undefined");

    const onboarding = exportedBlock(publicAuth, "completeOnboarding");
    expect(onboarding).toContain("onboardingCompleted: true");

    expect(auth).toContain("disableSignUp: false");

    expect(clientRouter).toContain('path: "/register"');
    expect(clientRouter).toContain('path: "/register/thank-you"');
    expect(clientRouter).toContain('path: "/activate"');
    expect(clientRouter).toContain('path: "/onboarding"');
    expect(supplierRouter).toContain('path: "/register"');
    expect(supplierRouter).toContain('path: "/activate"');
    expect(backofficeRouter).not.toContain('path: "/register"');
    expect(backofficeRouter).not.toContain('path: "/activate"');
    expect(backofficeRouter).not.toContain('path: "/onboarding"');
  });

  it("keeps Moyasar payment stub and storage URL interface in place without ZATCA / Tap", () => {
    const payments = readSource("convex/payments.ts");
    const storage = readSource("convex/storage.ts");

    expect(payments).toContain("moyasar");
    expect(payments).not.toMatch(/\btap[_\s-]?payment/i);
    expect(payments).not.toMatch(/zatca/i);
    expect(payments).not.toMatch(/fatoora/i);

    const createIntent = exportedBlock(payments, "createPaymentIntent");
    expect(createIntent).toContain("idempotencyKey");
    expect(createIntent).toContain("RATE_LIMIT_POLICIES.paymentIntentCreate");
    expect(createIntent).toContain("payment.intent_created");

    const capture = exportedBlock(payments, "capturePayment");
    expect(capture).toContain("payment.captured");
    expect(capture).toContain("not a recognized Moyasar charge");

    const refund = exportedBlock(payments, "refundPayment");
    expect(refund).toContain("payment.refunded");

    expect(storage).toContain("getDocumentDownloadUrl");
    expect(storage).toContain("clientPurchaseOrder");
    expect(storage).toContain("supplierPurchaseOrder");
    expect(storage).toContain("deliveryNote");
    expect(storage).toContain("goodsReceiptNote");
    expect(storage).toContain("invoice");
    expect(storage).toContain("kycDocument");
    expect(storage).toContain("expiresAt");
    expect(storage).not.toMatch(/zatca/i);
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
    expect(generate).toContain("purchaseOrderIds.push(cpoId)");

    expect(purchaseOrders).toContain("scopedRfqLineItemIds");
  });
});
