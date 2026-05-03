import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { refreshPurchaseOrderAnalytics, refreshSupplierAnalyticsForOrder } from "./analytics";
import { computeApprovalChain } from "./approvals";
import { lookupIdempotentResult, recordIdempotentResult } from "./idempotency";
import { notifyOrganization } from "./notifications";
import { generateTransactionRef } from "./numbers";
import { assertActiveUser, assertHasPermission, assertSameOrganization, hasPermission } from "./rbac";

const CLIENT_PURCHASE_ORDER_LIST_LIMIT = 100;

async function loadQuoteSnapshot(
  ctx: QueryCtx,
  quoteId: Id<"supplierQuotes">,
  scopedRfqLineItemIds?: ReadonlyArray<Id<"rfqLineItems">>
) {
  const quote = await ctx.db.get(quoteId);
  if (!quote) {
    return null;
  }
  const lineItems = await ctx.db
    .query("supplierQuoteLineItems")
    .withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
    .collect();
  const scopeSet = scopedRfqLineItemIds && scopedRfqLineItemIds.length > 0
    ? new Set<Id<"rfqLineItems">>(scopedRfqLineItemIds)
    : null;
  const filtered = scopeSet ? lineItems.filter((item) => scopeSet.has(item.rfqLineItemId)) : lineItems;
  const enriched = await Promise.all(
    filtered.map(async (item) => {
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
  const snapshot = await loadQuoteSnapshot(ctx, purchaseOrder.selectedQuoteId, purchaseOrder.awardedRfqLineItemIds);
  const supplier = snapshot ? await ctx.db.get(snapshot.supplierOrganizationId) : null;
  const tasks = await ctx.db
    .query("approvalTasks")
    .withIndex("by_po_order", (q) => q.eq("purchaseOrderId", purchaseOrder._id))
    .collect();
  tasks.sort((a, b) => a.orderInChain - b.orderInChain);
  const pendingTask = tasks.find((task) => task.status === "pending");
  const approvalStatus = pendingTask
    ? "pending"
    : tasks.some((task) => task.status === "rejected")
      ? "rejected"
      : tasks.length > 0 && tasks.every((task) => task.status === "approved")
        ? "approved"
        : "pending";

  return {
    _id: purchaseOrder._id,
    rfqId: purchaseOrder.rfqId,
    status: purchaseOrder.status,
    type: purchaseOrder.type ?? "cpo",
    transactionRef: purchaseOrder.transactionRef ?? null,
    linkedPurchaseOrderId: purchaseOrder.linkedPurchaseOrderId ?? null,
    createdAt: purchaseOrder.createdAt,
    updatedAt: purchaseOrder.updatedAt,
    approvedAt: purchaseOrder.approvedAt,
    awardKind: purchaseOrder.awardKind ?? "full",
    clientTotal: snapshot?.clientTotal ?? 0,
    supplierAnonymousId: supplier?.supplierAnonymousId ?? "—",
    approvalStatus,
    chainLength: tasks.length,
    pendingApproverUserId: pendingTask?.approverUserId ?? null
  };
}

async function resolveDefaultApproverChain(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  actorUserId: Id<"users">
): Promise<Id<"users">[]> {
  const chain = await computeApprovalChain(ctx, organizationId, actorUserId);
  if (chain.length > 0) return chain;
  // Fallback: pick any other org member with po:approve. If none, the actor
  // approves their own PO so the workflow still completes.
  const orgUsers = await ctx.db
    .query("users")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const fallback = orgUsers.find(
    (member) => member._id !== actorUserId && hasPermission(member.roles, "po:approve")
  );
  return [fallback?._id ?? actorUserId];
}

export const generatePoFromSelectedQuote = mutation({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs"),
    termsTemplateId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    if (args.idempotencyKey) {
      const cached = await lookupIdempotentResult(ctx, args.actorUserId, "po.generate", args.idempotencyKey);
      if (cached !== undefined) {
        const existing = await ctx.db
          .query("purchaseOrders")
          .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
          .collect();
        return {
          purchaseOrderIds: existing.map((row) => row._id),
          isSplit: existing.length > 1
        };
      }
    }

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

    const rfqLineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    if (rfqLineItems.length === 0) {
      throw new Error("RFQ has no line items.");
    }

    const awardGroups = new Map<Id<"supplierQuotes">, Id<"rfqLineItems">[]>();
    for (const item of rfqLineItems) {
      const awardedQuoteId = item.awardedQuoteId;
      if (!awardedQuoteId) {
        throw new Error("Every line item must be awarded before generating purchase orders.");
      }
      const list = awardGroups.get(awardedQuoteId) ?? [];
      list.push(item._id);
      awardGroups.set(awardedQuoteId, list);
    }

    const isSplit = awardGroups.size > 1;
    const now = Date.now();
    const purchaseOrderIds: Id<"purchaseOrders">[] = [];

    for (const [quoteId, lineItemIds] of awardGroups) {
      const quote = await ctx.db.get(quoteId);
      if (!quote || quote.status !== "selected") {
        throw new Error("Awarded quote is no longer in a selected state.");
      }

      const transactionRef = generateTransactionRef(now);
      const cpoId = await ctx.db.insert("purchaseOrders", {
        rfqId: args.rfqId,
        selectedQuoteId: quoteId,
        clientOrganizationId: rfq.clientOrganizationId,
        status: "pendingApproval",
        type: "cpo",
        transactionRef,
        termsTemplateId: args.termsTemplateId,
        awardedRfqLineItemIds: isSplit ? lineItemIds : undefined,
        awardKind: isSplit ? "split" : "full",
        createdAt: now,
        updatedAt: now
      });

      const spoId = await ctx.db.insert("purchaseOrders", {
        rfqId: args.rfqId,
        selectedQuoteId: quoteId,
        clientOrganizationId: rfq.clientOrganizationId,
        status: "draft",
        type: "spo",
        transactionRef,
        linkedPurchaseOrderId: cpoId,
        termsTemplateId: args.termsTemplateId,
        awardedRfqLineItemIds: isSplit ? lineItemIds : undefined,
        awardKind: isSplit ? "split" : "full",
        createdAt: now,
        updatedAt: now
      });

      await ctx.db.patch(cpoId, { linkedPurchaseOrderId: spoId });
      purchaseOrderIds.push(cpoId);

      const approverChain = await resolveDefaultApproverChain(ctx, rfq.clientOrganizationId, args.actorUserId);
      for (let index = 0; index < approverChain.length; index++) {
        await ctx.db.insert("approvalTasks", {
          purchaseOrderId: cpoId,
          approverUserId: approverChain[index],
          orderInChain: index,
          status: index === 0 ? "pending" : "skipped",
          createdAt: now,
          updatedAt: now
        });
      }

      await ctx.db.insert("auditLogs", {
        actorUserId: args.actorUserId,
        organizationId: rfq.clientOrganizationId,
        action: "po.generated",
        entityType: "purchaseOrder",
        entityId: cpoId,
        summary: isSplit
          ? `CPO + SPO generated for split award (${lineItemIds.length} of ${rfqLineItems.length} line items, txn ${transactionRef})`
          : `CPO + SPO generated from selected quote (txn ${transactionRef})`,
        createdAt: now
      });

      await notifyOrganization(ctx, rfq.clientOrganizationId, {
        type: "po.pending_approval",
        titleAr: "أمر شراء بانتظار الموافقة",
        titleEn: "Purchase order pending approval",
        bodyAr: `أمر الشراء ${cpoId.slice(-6).toUpperCase()} بانتظار الموافقة.`,
        bodyEn: `Purchase order ${cpoId.slice(-6).toUpperCase()} is awaiting approval.`
      });
    }

    await ctx.db.patch(args.rfqId, {
      status: "poGenerated",
      updatedAt: now
    });

    if (args.idempotencyKey) {
      await recordIdempotentResult(ctx, {
        actorUserId: args.actorUserId,
        action: "po.generate",
        key: args.idempotencyKey,
        resultEntityType: "rfq",
        resultEntityId: args.rfqId
      });
    }

    return { purchaseOrderIds, isSplit };
  }
});

function isClientFacingPurchaseOrder(purchaseOrder: Doc<"purchaseOrders">) {
  // Client-facing list shows the CPO. Legacy rows (no `type` set) predate the
  // dual-PO split and are also surfaced — their data is stable enough that
  // hiding them would silently drop history.
  return purchaseOrder.type !== "spo";
}

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

    const filtered = purchaseOrders.filter(isClientFacingPurchaseOrder);
    return await Promise.all(filtered.map((purchaseOrder) => buildPurchaseOrderRow(ctx, purchaseOrder)));
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

    const filteredPage = result.page.filter(isClientFacingPurchaseOrder);
    return {
      ...result,
      page: await Promise.all(filteredPage.map((purchaseOrder) => buildPurchaseOrderRow(ctx, purchaseOrder)))
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

    const snapshot = await loadQuoteSnapshot(ctx, purchaseOrder.selectedQuoteId, purchaseOrder.awardedRfqLineItemIds);
    const supplier = snapshot ? await ctx.db.get(snapshot.supplierOrganizationId) : null;
    const rfq = await ctx.db.get(purchaseOrder.rfqId);
    const approvalTasks = await ctx.db
      .query("approvalTasks")
      .withIndex("by_po_order", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();
    approvalTasks.sort((a, b) => a.orderInChain - b.orderInChain);
    const enrichedTasks = await Promise.all(
      approvalTasks.map(async (task) => {
        const approver = await ctx.db.get(task.approverUserId);
        return {
          _id: task._id,
          orderInChain: task.orderInChain,
          status: task.status,
          decidedAt: task.decidedAt ?? null,
          note: task.note ?? null,
          approverUserId: task.approverUserId,
          approverName: approver?.name ?? "—",
          approverEmail: approver?.email ?? "—",
          createdAt: task.createdAt,
          updatedAt: task.updatedAt
        };
      })
    );

    return {
      _id: purchaseOrder._id,
      status: purchaseOrder.status,
      type: purchaseOrder.type ?? "cpo",
      transactionRef: purchaseOrder.transactionRef ?? null,
      linkedPurchaseOrderId: purchaseOrder.linkedPurchaseOrderId ?? null,
      termsTemplateId: purchaseOrder.termsTemplateId,
      approvedAt: purchaseOrder.approvedAt,
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt,
      awardKind: purchaseOrder.awardKind ?? "full",
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
      approvalTasks: enrichedTasks
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
    const tasks = await ctx.db
      .query("approvalTasks")
      .withIndex("by_po_order", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();
    tasks.sort((a, b) => a.orderInChain - b.orderInChain);
    const pendingTask = tasks.find((task) => task.status === "pending");
    if (!pendingTask) {
      throw new Error("Purchase order has no pending approval task.");
    }
    if (pendingTask.approverUserId !== args.actorUserId) {
      throw new Error("Only the next approver in the chain can act on this purchase order.");
    }

    let nextPoStatus: "approved" | "rejected" | "returnedForChanges" | "pendingApproval";

    if (args.decision === "approved") {
      await ctx.db.patch(pendingTask._id, {
        status: "approved",
        decidedAt: now,
        note: trimmedReason,
        updatedAt: now
      });
      const nextTask = tasks.find((task) => task.orderInChain > pendingTask.orderInChain && task.status === "skipped");
      if (nextTask) {
        await ctx.db.patch(nextTask._id, { status: "pending", updatedAt: now });
        nextPoStatus = "pendingApproval";
      } else {
        nextPoStatus = "approved";
      }
    } else if (args.decision === "rejected") {
      await ctx.db.patch(pendingTask._id, {
        status: "rejected",
        decidedAt: now,
        note: trimmedReason,
        updatedAt: now
      });
      // Mark every later skipped task as cancelled-equivalent so the chain
      // is clearly closed. We reuse the "skipped" status since a downstream
      // approver never had a turn.
      for (const task of tasks) {
        if (task.orderInChain > pendingTask.orderInChain && task.status === "skipped") {
          await ctx.db.patch(task._id, { updatedAt: now });
        }
      }
      nextPoStatus = "rejected";
    } else {
      await ctx.db.patch(pendingTask._id, {
        status: "skipped",
        decidedAt: now,
        note: trimmedReason,
        updatedAt: now
      });
      nextPoStatus = "returnedForChanges";
    }

    await ctx.db.patch(args.purchaseOrderId, {
      status: nextPoStatus,
      ...(nextPoStatus === "approved" ? { approvedAt: now } : {}),
      updatedAt: now
    });

    if (nextPoStatus === "approved") {
      await refreshPurchaseOrderAnalytics(ctx, args.purchaseOrderId);
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: purchaseOrder.clientOrganizationId,
      action:
        nextPoStatus === "approved"
          ? "po.approved"
          : nextPoStatus === "rejected"
            ? "po.rejected"
            : nextPoStatus === "returnedForChanges"
              ? "po.returned"
              : "po.advanced",
      entityType: "purchaseOrder",
      entityId: args.purchaseOrderId,
      summary:
        args.decision === "approved"
          ? nextPoStatus === "approved"
            ? "Purchase order approved (final approver)"
            : `Approval step ${pendingTask.orderInChain + 1} approved`
          : `Purchase order ${args.decision === "rejected" ? "rejected" : "returned"}: ${trimmedReason}`,
      createdAt: now
    });

    return nextPoStatus;
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

    const cpo = await ctx.db.get(args.purchaseOrderId);
    if (!cpo) {
      throw new Error("Purchase order not found.");
    }
    assertSameOrganization(actor, cpo.clientOrganizationId);
    if (cpo.type === "spo") {
      throw new Error("Pass the CPO id; the SPO is dispatched automatically.");
    }
    if (cpo.status !== "approved") {
      throw new Error("Only approved purchase orders can be sent to suppliers.");
    }

    const now = Date.now();
    await ctx.db.patch(args.purchaseOrderId, {
      status: "sentToSupplier",
      updatedAt: now
    });

    // Locate the paired SPO. Prefer the direct linkedPurchaseOrderId pointer
    // when present; otherwise fall back to the shared transactionRef.
    let spo: Doc<"purchaseOrders"> | null = null;
    if (cpo.linkedPurchaseOrderId) {
      spo = await ctx.db.get(cpo.linkedPurchaseOrderId);
    }
    if (!spo && cpo.transactionRef) {
      const candidates = await ctx.db
        .query("purchaseOrders")
        .withIndex("by_transaction_ref", (q) => q.eq("transactionRef", cpo.transactionRef))
        .collect();
      spo = candidates.find((row) => row.type === "spo") ?? null;
    }
    if (spo) {
      await ctx.db.patch(spo._id, { status: "sentToSupplier", updatedAt: now });
    }

    const orderPurchaseOrderId = spo?._id ?? args.purchaseOrderId;
    const quote = await ctx.db.get(cpo.selectedQuoteId);
    if (quote) {
      const orderId = await ctx.db.insert("orders", {
        purchaseOrderId: orderPurchaseOrderId,
        clientOrganizationId: cpo.clientOrganizationId,
        supplierOrganizationId: quote.supplierOrganizationId,
        status: "pending",
        createdAt: now,
        updatedAt: now
      });
      await refreshSupplierAnalyticsForOrder(ctx, orderId);
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: cpo.clientOrganizationId,
      action: "po.sent_to_supplier",
      entityType: "purchaseOrder",
      entityId: args.purchaseOrderId,
      summary: spo
        ? `CPO ${args.purchaseOrderId.slice(-6).toUpperCase()} approved and SPO ${spo._id.slice(-6).toUpperCase()} dispatched (txn ${cpo.transactionRef ?? "n/a"})`
        : "Approved PO sent to supplier and order created",
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
