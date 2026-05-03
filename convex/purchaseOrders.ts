import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { refreshPurchaseOrderAnalytics, refreshSupplierAnalyticsForOrder } from "./analytics";
import { notifyOrganization } from "./notifications";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";

const CLIENT_PURCHASE_ORDER_LIST_LIMIT = 100;

async function loadQuoteSnapshot(ctx: QueryCtx, quoteId: Id<"supplierQuotes">) {
  const quote = await ctx.db.get(quoteId);
  if (!quote) {
    return null;
  }
  const lineItems = await ctx.db
    .query("supplierQuoteLineItems")
    .withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
    .collect();
  const enriched = await Promise.all(
    lineItems.map(async (item) => {
      const rfqLine = await ctx.db.get(item.rfqLineItemId);
      const product = rfqLine?.productId ? await ctx.db.get(rfqLine.productId) : null;
      return {
        _id: item._id,
        quantity: rfqLine?.quantity ?? 0,
        unit: rfqLine?.unit ?? "unit",
        descriptionAr: rfqLine?.descriptionAr,
        descriptionEn: rfqLine?.descriptionEn,
        clientFinalUnitPrice: item.clientFinalUnitPrice ?? 0,
        clientFinalTotalPrice: item.clientFinalTotalPrice ?? 0,
        product: product
          ? {
              _id: product._id,
              sku: product.sku,
              nameAr: product.nameAr,
              nameEn: product.nameEn
            }
          : null
      };
    })
  );
  const clientTotal = enriched.reduce((sum, item) => sum + item.clientFinalTotalPrice, 0);
  return {
    _id: quote._id,
    leadTimeDays: quote.leadTimeDays,
    validUntil: quote.validUntil,
    supportsPartialFulfillment: quote.supportsPartialFulfillment,
    supplierOrganizationId: quote.supplierOrganizationId,
    lineItems: enriched,
    clientTotal
  };
}

async function buildPurchaseOrderRow(ctx: QueryCtx, purchaseOrder: Doc<"purchaseOrders">) {
  const snapshot = await loadQuoteSnapshot(ctx, purchaseOrder.selectedQuoteId);
  const supplier = snapshot ? await ctx.db.get(snapshot.supplierOrganizationId) : null;
  const approvals = await ctx.db
    .query("approvalInstances")
    .withIndex("by_po", (q) => q.eq("purchaseOrderId", purchaseOrder._id))
    .collect();
  const latest = approvals.length > 0 ? approvals.sort((a, b) => b.createdAt - a.createdAt)[0] : null;

  return {
    _id: purchaseOrder._id,
    rfqId: purchaseOrder.rfqId,
    status: purchaseOrder.status,
    createdAt: purchaseOrder.createdAt,
    updatedAt: purchaseOrder.updatedAt,
    approvedAt: purchaseOrder.approvedAt,
    clientTotal: snapshot?.clientTotal ?? 0,
    supplierAnonymousId: supplier?.supplierAnonymousId ?? "—",
    approvalStatus: latest?.status ?? "pending"
  };
}

export const generatePoFromSelectedQuote = mutation({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs"),
    termsTemplateId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      throw new Error("RFQ not found.");
    }
    assertSameOrganization(actor, rfq.clientOrganizationId);
    if (rfq.status !== "selected") {
      throw new Error("Select a quote before generating a PO.");
    }

    const duplicate = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .first();
    if (duplicate) {
      throw new Error("A purchase order already exists for this RFQ.");
    }

    const quotes = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    const selectedQuote = quotes.find((quote) => quote.status === "selected");
    if (!selectedQuote) {
      throw new Error("No selected quote found for this RFQ.");
    }

    const now = Date.now();
    const purchaseOrderId = await ctx.db.insert("purchaseOrders", {
      rfqId: args.rfqId,
      selectedQuoteId: selectedQuote._id,
      clientOrganizationId: rfq.clientOrganizationId,
      status: "pendingApproval",
      termsTemplateId: args.termsTemplateId,
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("approvalInstances", {
      purchaseOrderId,
      status: "pending",
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.patch(args.rfqId, {
      status: "poGenerated",
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: rfq.clientOrganizationId,
      action: "po.generated",
      entityType: "purchaseOrder",
      entityId: purchaseOrderId,
      summary: "Purchase order generated from selected quote",
      createdAt: now
    });

    await notifyOrganization(ctx, rfq.clientOrganizationId, {
      type: "po.pending_approval",
      titleAr: "أمر شراء بانتظار الموافقة",
      titleEn: "Purchase order pending approval",
      bodyAr: `أمر الشراء ${purchaseOrderId.slice(-6).toUpperCase()} بانتظار الموافقة.`,
      bodyEn: `Purchase order ${purchaseOrderId.slice(-6).toUpperCase()} is awaiting approval.`
    });

    return purchaseOrderId;
  }
});

export const listPurchaseOrdersForActor = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const clientOrganizationId = actor.organizationId as Id<"organizations">;
    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_client_updated_at", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .order("desc")
      .take(CLIENT_PURCHASE_ORDER_LIST_LIMIT);

    return await Promise.all(purchaseOrders.map((purchaseOrder) => buildPurchaseOrderRow(ctx, purchaseOrder)));
  }
});

export const listPurchaseOrdersForActorPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const clientOrganizationId = actor.organizationId as Id<"organizations">;
    const result = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_client_updated_at", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((purchaseOrder) => buildPurchaseOrderRow(ctx, purchaseOrder)))
    };
  }
});

export const getPurchaseOrderDetail = query({
  args: {
    actorUserId: v.id("users"),
    purchaseOrderId: v.id("purchaseOrders")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const purchaseOrder = await ctx.db.get(args.purchaseOrderId);
    if (!purchaseOrder) {
      return null;
    }
    assertSameOrganization(actor, purchaseOrder.clientOrganizationId);

    const snapshot = await loadQuoteSnapshot(ctx, purchaseOrder.selectedQuoteId);
    const supplier = snapshot ? await ctx.db.get(snapshot.supplierOrganizationId) : null;
    const rfq = await ctx.db.get(purchaseOrder.rfqId);
    const approvals = await ctx.db
      .query("approvalInstances")
      .withIndex("by_po", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();
    approvals.sort((a, b) => b.createdAt - a.createdAt);

    return {
      _id: purchaseOrder._id,
      status: purchaseOrder.status,
      termsTemplateId: purchaseOrder.termsTemplateId,
      approvedAt: purchaseOrder.approvedAt,
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt,
      rfq: rfq
        ? {
            _id: rfq._id,
            requiredDeliveryDate: rfq.requiredDeliveryDate,
            notes: rfq.notes
          }
        : null,
      supplierAnonymousId: supplier?.supplierAnonymousId ?? "—",
      lineItems: snapshot?.lineItems ?? [],
      clientTotal: snapshot?.clientTotal ?? 0,
      leadTimeDays: snapshot?.leadTimeDays ?? 0,
      validUntil: snapshot?.validUntil ?? "",
      approvals: approvals.map((approval) => ({
        _id: approval._id,
        status: approval.status,
        createdAt: approval.createdAt,
        updatedAt: approval.updatedAt
      }))
    };
  }
});

export const decidePurchaseOrder = mutation({
  args: {
    actorUserId: v.id("users"),
    purchaseOrderId: v.id("purchaseOrders"),
    decision: v.union(v.literal("approved"), v.literal("rejected"), v.literal("returnedForChanges")),
    reason: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "po:approve");

    const purchaseOrder = await ctx.db.get(args.purchaseOrderId);
    if (!purchaseOrder) {
      throw new Error("Purchase order not found.");
    }
    assertSameOrganization(actor, purchaseOrder.clientOrganizationId);
    if (purchaseOrder.status !== "pendingApproval") {
      throw new Error("Purchase order is not awaiting approval.");
    }

    const trimmedReason = args.reason?.trim();
    if (args.decision !== "approved" && !trimmedReason) {
      throw new Error("Reason is required when rejecting or returning for changes.");
    }

    const now = Date.now();
    const approvals = await ctx.db
      .query("approvalInstances")
      .withIndex("by_po", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();
    const pending = approvals.find((entry) => entry.status === "pending");
    if (pending) {
      await ctx.db.patch(pending._id, {
        status: args.decision === "approved" ? "approved" : "rejected",
        updatedAt: now
      });
    }

    const nextStatus =
      args.decision === "approved"
        ? "approved"
        : args.decision === "rejected"
          ? "rejected"
          : "returnedForChanges";

    await ctx.db.patch(args.purchaseOrderId, {
      status: nextStatus,
      ...(args.decision === "approved" ? { approvedAt: now } : {}),
      updatedAt: now
    });

    if (args.decision === "approved") {
      await refreshPurchaseOrderAnalytics(ctx, args.purchaseOrderId);
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: purchaseOrder.clientOrganizationId,
      action:
        args.decision === "approved"
          ? "po.approved"
          : args.decision === "rejected"
            ? "po.rejected"
            : "po.returned",
      entityType: "purchaseOrder",
      entityId: args.purchaseOrderId,
      summary:
        args.decision === "approved"
          ? "Purchase order approved"
          : `Purchase order ${args.decision === "rejected" ? "rejected" : "returned"}: ${trimmedReason}`,
      createdAt: now
    });

    return nextStatus;
  }
});

export const sendPurchaseOrderToSupplier = mutation({
  args: {
    actorUserId: v.id("users"),
    purchaseOrderId: v.id("purchaseOrders")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "po:approve");

    const purchaseOrder = await ctx.db.get(args.purchaseOrderId);
    if (!purchaseOrder) {
      throw new Error("Purchase order not found.");
    }
    assertSameOrganization(actor, purchaseOrder.clientOrganizationId);
    if (purchaseOrder.status !== "approved") {
      throw new Error("Only approved purchase orders can be sent to suppliers.");
    }

    const now = Date.now();
    await ctx.db.patch(args.purchaseOrderId, {
      status: "sentToSupplier",
      updatedAt: now
    });

    const quote = await ctx.db.get(purchaseOrder.selectedQuoteId);
    if (quote) {
      const orderId = await ctx.db.insert("orders", {
        purchaseOrderId: purchaseOrder._id,
        clientOrganizationId: purchaseOrder.clientOrganizationId,
        supplierOrganizationId: quote.supplierOrganizationId,
        status: "pending",
        createdAt: now,
        updatedAt: now
      });
      await refreshSupplierAnalyticsForOrder(ctx, orderId);
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: purchaseOrder.clientOrganizationId,
      action: "po.sent_to_supplier",
      entityType: "purchaseOrder",
      entityId: args.purchaseOrderId,
      summary: "Approved PO sent to supplier and order created",
      createdAt: now
    });

    if (quote) {
      await notifyOrganization(ctx, quote.supplierOrganizationId, {
        type: "po.received",
        titleAr: "تم استلام أمر شراء",
        titleEn: "Purchase order received",
        bodyAr: "تم استلام أمر شراء معتمد. يرجى تأكيد التنفيذ.",
        bodyEn: "An approved PO has been received. Please confirm and start fulfillment."
      });
    }
  }
});
