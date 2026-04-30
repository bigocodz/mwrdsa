import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { notifyOrganization } from "./notifications";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";

async function summarizeRfqLineItems(ctx: QueryCtx, rfqId: Id<"rfqs">) {
  const lineItems = await ctx.db
    .query("rfqLineItems")
    .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
    .collect();

  let totalQuantity = 0;
  for (const item of lineItems) {
    totalQuantity += item.quantity;
  }
  return { count: lineItems.length, totalQuantity, items: lineItems };
}

const quoteLineItemInput = v.object({
  rfqLineItemId: v.id("rfqLineItems"),
  supplierUnitPrice: v.number(),
  supplierTotalPrice: v.number()
});

export const submitSupplierQuote = mutation({
  args: {
    actorUserId: v.id("users"),
    assignmentId: v.id("supplierRfqAssignments"),
    leadTimeDays: v.number(),
    validUntil: v.string(),
    supportsPartialFulfillment: v.boolean(),
    lineItems: v.array(quoteLineItemInput)
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:submit");

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found.");
    }
    assertSameOrganization(actor, assignment.supplierOrganizationId);
    if (assignment.status !== "accepted") {
      throw new Error("Accept the assignment before submitting a quote.");
    }

    if (args.leadTimeDays <= 0) {
      throw new Error("Lead time must be greater than zero.");
    }
    if (!args.validUntil) {
      throw new Error("Quote validity is required.");
    }
    if (args.lineItems.length === 0) {
      throw new Error("Add at least one priced line item.");
    }

    const rfqLineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", assignment.rfqId))
      .collect();
    const rfqLineItemIds = new Set(rfqLineItems.map((item) => item._id));
    for (const line of args.lineItems) {
      if (!rfqLineItemIds.has(line.rfqLineItemId)) {
        throw new Error("Line item does not belong to this RFQ.");
      }
      if (line.supplierUnitPrice < 0 || line.supplierTotalPrice < 0) {
        throw new Error("Prices must be non-negative.");
      }
    }

    const existing = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq", (q) => q.eq("rfqId", assignment.rfqId))
      .collect();
    const existingForSupplier = existing.find((quote) => quote.supplierOrganizationId === assignment.supplierOrganizationId);
    if (existingForSupplier) {
      throw new Error("A quote has already been submitted for this assignment.");
    }

    const now = Date.now();
    const quoteId = await ctx.db.insert("supplierQuotes", {
      rfqId: assignment.rfqId,
      supplierOrganizationId: assignment.supplierOrganizationId,
      submittedByUserId: args.actorUserId,
      status: "submitted",
      leadTimeDays: args.leadTimeDays,
      validUntil: args.validUntil,
      supportsPartialFulfillment: args.supportsPartialFulfillment,
      createdAt: now,
      updatedAt: now
    });

    for (const item of args.lineItems) {
      await ctx.db.insert("supplierQuoteLineItems", {
        quoteId,
        ...item,
        createdAt: now,
        updatedAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: assignment.supplierOrganizationId,
      action: "quote.submitted",
      entityType: "supplierQuote",
      entityId: quoteId,
      summary: "Supplier quote submitted",
      createdAt: now
    });

    return quoteId;
  }
});

export const getQuoteForAssignment = query({
  args: {
    actorUserId: v.id("users"),
    assignmentId: v.id("supplierRfqAssignments")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:submit");

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      return null;
    }
    assertSameOrganization(actor, assignment.supplierOrganizationId);

    const quotes = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq", (q) => q.eq("rfqId", assignment.rfqId))
      .collect();
    const quote = quotes.find((entry) => entry.supplierOrganizationId === assignment.supplierOrganizationId);
    if (!quote) {
      return null;
    }

    const lineItems = await ctx.db
      .query("supplierQuoteLineItems")
      .withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
      .collect();

    return {
      _id: quote._id,
      status: quote.status,
      leadTimeDays: quote.leadTimeDays,
      validUntil: quote.validUntil,
      supportsPartialFulfillment: quote.supportsPartialFulfillment,
      createdAt: quote.createdAt,
      lineItems: lineItems.map((item) => ({
        _id: item._id,
        rfqLineItemId: item.rfqLineItemId,
        supplierUnitPrice: item.supplierUnitPrice,
        supplierTotalPrice: item.supplierTotalPrice
      }))
    };
  }
});

export const setQuoteDecision = mutation({
  args: {
    actorUserId: v.id("users"),
    quoteId: v.id("supplierQuotes"),
    decision: v.union(v.literal("approvedForRelease"), v.literal("held"), v.literal("rejected")),
    marginPercent: v.optional(v.number()),
    reason: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:apply_margin");

    const quote = await ctx.db.get(args.quoteId);
    if (!quote) {
      throw new Error("Quote not found.");
    }
    if (quote.status === "released" || quote.status === "selected") {
      throw new Error("Quote has already been released.");
    }

    const now = Date.now();
    const trimmedReason = args.reason?.trim();

    if (args.decision === "approvedForRelease") {
      if (typeof args.marginPercent !== "number" || Number.isNaN(args.marginPercent)) {
        throw new Error("Margin percent is required when approving a quote.");
      }
      if (args.marginPercent < 0) {
        throw new Error("Margin percent cannot be negative.");
      }

      const quoteItems = await ctx.db
        .query("supplierQuoteLineItems")
        .withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
        .collect();

      const factor = 1 + args.marginPercent / 100;
      for (const item of quoteItems) {
        await ctx.db.patch(item._id, {
          clientFinalUnitPrice: item.supplierUnitPrice * factor,
          clientFinalTotalPrice: item.supplierTotalPrice * factor,
          updatedAt: now
        });
      }

      const previousOverride = await ctx.db
        .query("marginOverrides")
        .withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
        .collect();
      const previousMarginPercent = previousOverride.length > 0 ? previousOverride[previousOverride.length - 1].newMarginPercent : 0;

      if (previousMarginPercent !== args.marginPercent) {
        if (!trimmedReason) {
          throw new Error("Reason is required when adjusting margin.");
        }
        await ctx.db.insert("marginOverrides", {
          quoteId: args.quoteId,
          adjustedByUserId: args.actorUserId,
          previousMarginPercent,
          newMarginPercent: args.marginPercent,
          reason: trimmedReason,
          createdAt: now
        });
      }

      await ctx.db.patch(args.quoteId, {
        status: "approvedForRelease",
        updatedAt: now
      });

      await ctx.db.insert("auditLogs", {
        actorUserId: args.actorUserId,
        organizationId: quote.supplierOrganizationId,
        action: "quote.approved_for_release",
        entityType: "supplierQuote",
        entityId: args.quoteId,
        summary: `Quote approved with ${args.marginPercent}% margin${trimmedReason ? ` (${trimmedReason})` : ""}`,
        createdAt: now
      });
      return;
    }

    if (args.decision === "rejected" && !trimmedReason) {
      throw new Error("Rejection reason is required.");
    }

    await ctx.db.patch(args.quoteId, {
      status: args.decision,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: quote.supplierOrganizationId,
      action: args.decision === "held" ? "quote.held" : "quote.rejected",
      entityType: "supplierQuote",
      entityId: args.quoteId,
      summary: args.decision === "held" ? "Quote placed on hold" : `Quote rejected${trimmedReason ? `: ${trimmedReason}` : ""}`,
      createdAt: now
    });
  }
});

export const releaseApprovedQuotes = mutation({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:release");

    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      throw new Error("RFQ not found.");
    }

    const quotes = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    const approvedQuotes = quotes.filter((quote) => quote.status === "approvedForRelease");
    if (approvedQuotes.length === 0) {
      throw new Error("Approve at least one quote before releasing.");
    }

    const now = Date.now();
    for (const quote of approvedQuotes) {
      await ctx.db.patch(quote._id, {
        status: "released",
        updatedAt: now
      });
    }

    if (rfq.status !== "released" && rfq.status !== "selected" && rfq.status !== "poGenerated") {
      await ctx.db.patch(args.rfqId, {
        status: "released",
        updatedAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: rfq.clientOrganizationId,
      action: "rfq.quotes_released",
      entityType: "rfq",
      entityId: args.rfqId,
      summary: `Released ${approvedQuotes.length} quote(s) to client`,
      createdAt: now
    });

    await notifyOrganization(ctx, rfq.clientOrganizationId, {
      type: "quotes.released",
      titleAr: "عروض جاهزة للمقارنة",
      titleEn: "Quotes ready to compare",
      bodyAr: `تم إصدار ${approvedQuotes.length} عرضاً مجهولاً للطلب ${args.rfqId.slice(-6).toUpperCase()}.`,
      bodyEn: `${approvedQuotes.length} anonymous quote(s) released for RFQ ${args.rfqId.slice(-6).toUpperCase()}.`
    });

    return { releasedCount: approvedQuotes.length };
  }
});

export const listSupplierAssignments = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:submit");

    const supplierOrganizationId = actor.organizationId as Id<"organizations">;
    const supplier = await ctx.db.get(supplierOrganizationId);
    if (!supplier || supplier.type !== "supplier") {
      throw new Error("Only supplier organizations can view RFQ assignments.");
    }

    const assignments = await ctx.db
      .query("supplierRfqAssignments")
      .withIndex("by_supplier", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .collect();

    assignments.sort((a, b) => b.createdAt - a.createdAt);

    return await Promise.all(
      assignments.map(async (assignment) => {
        const rfq = await ctx.db.get(assignment.rfqId);
        const summary = rfq ? await summarizeRfqLineItems(ctx, assignment.rfqId) : { count: 0, totalQuantity: 0 };
        const clientOrg = rfq ? await ctx.db.get(rfq.clientOrganizationId) : null;
        return {
          _id: assignment._id,
          status: assignment.status,
          declineReason: assignment.declineReason,
          responseDeadline: assignment.responseDeadline,
          createdAt: assignment.createdAt,
          rfq: rfq
            ? {
                _id: rfq._id,
                status: rfq.status,
                requiredDeliveryDate: rfq.requiredDeliveryDate,
                isNonCatalog: rfq.isNonCatalog,
                createdAt: rfq.createdAt,
                clientAnonymousId: clientOrg?.clientAnonymousId ?? "—",
                lineItemCount: summary.count,
                totalQuantity: summary.totalQuantity
              }
            : null
        };
      })
    );
  }
});

export const getSupplierAssignmentDetail = query({
  args: {
    actorUserId: v.id("users"),
    assignmentId: v.id("supplierRfqAssignments")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:submit");

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      return null;
    }
    assertSameOrganization(actor, assignment.supplierOrganizationId);

    const rfq = await ctx.db.get(assignment.rfqId);
    if (!rfq) {
      return null;
    }

    const lineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
      .collect();

    const enrichedLineItems = await Promise.all(
      lineItems.map(async (item) => {
        const product = item.productId ? await ctx.db.get(item.productId) : null;
        return {
          _id: item._id,
          quantity: item.quantity,
          unit: item.unit,
          descriptionAr: item.descriptionAr,
          descriptionEn: item.descriptionEn,
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

    const clientOrg = await ctx.db.get(rfq.clientOrganizationId);

    return {
      _id: assignment._id,
      status: assignment.status,
      declineReason: assignment.declineReason,
      responseDeadline: assignment.responseDeadline,
      createdAt: assignment.createdAt,
      rfq: {
        _id: rfq._id,
        status: rfq.status,
        requiredDeliveryDate: rfq.requiredDeliveryDate,
        notes: rfq.notes,
        isNonCatalog: rfq.isNonCatalog,
        createdAt: rfq.createdAt,
        clientAnonymousId: clientOrg?.clientAnonymousId ?? "—"
      },
      lineItems: enrichedLineItems
    };
  }
});

export const respondToAssignment = mutation({
  args: {
    actorUserId: v.id("users"),
    assignmentId: v.id("supplierRfqAssignments"),
    response: v.union(v.literal("accepted"), v.literal("declined")),
    declineReason: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:submit");

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found.");
    }
    assertSameOrganization(actor, assignment.supplierOrganizationId);

    if (assignment.status !== "assigned") {
      throw new Error("Assignment has already been actioned.");
    }

    const trimmedReason = args.declineReason?.trim();
    if (args.response === "declined" && !trimmedReason) {
      throw new Error("Decline reason is required.");
    }

    const now = Date.now();
    await ctx.db.patch(args.assignmentId, {
      status: args.response,
      declineReason: args.response === "declined" ? trimmedReason : undefined,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: assignment.supplierOrganizationId,
      action: args.response === "accepted" ? "supplier.assignment.accepted" : "supplier.assignment.declined",
      entityType: "supplierAssignment",
      entityId: args.assignmentId,
      summary:
        args.response === "accepted"
          ? "Supplier accepted RFQ assignment"
          : `Supplier declined RFQ assignment${trimmedReason ? `: ${trimmedReason}` : ""}`,
      createdAt: now
    });

    const adminOrgs = await ctx.db.query("organizations").withIndex("by_type", (q) => q.eq("type", "admin")).collect();
    for (const adminOrg of adminOrgs) {
      await notifyOrganization(ctx, adminOrg._id, {
        type: args.response === "accepted" ? "supplier.assignment.accepted" : "supplier.assignment.declined",
        titleAr: args.response === "accepted" ? "قبول مورد لطلب" : "رفض مورد لطلب",
        titleEn: args.response === "accepted" ? "Supplier accepted assignment" : "Supplier declined assignment",
        bodyAr: args.response === "accepted" ? "قبل أحد الموردين تعييناً." : `رفض أحد الموردين تعييناً${trimmedReason ? `: ${trimmedReason}` : ""}.`,
        bodyEn: args.response === "accepted" ? "A supplier accepted an assignment." : `A supplier declined an assignment${trimmedReason ? `: ${trimmedReason}` : ""}.`
      });
    }
  }
});

export const listSubmittedQuotesForRfq = query({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:apply_margin");

    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      return null;
    }

    const rfqLineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    const enrichedRfqItems = await Promise.all(
      rfqLineItems.map(async (item) => {
        const product = item.productId ? await ctx.db.get(item.productId) : null;
        return {
          _id: item._id,
          quantity: item.quantity,
          unit: item.unit,
          descriptionAr: item.descriptionAr,
          descriptionEn: item.descriptionEn,
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

    const clientOrg = await ctx.db.get(rfq.clientOrganizationId);

    const quotes = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    quotes.sort((a, b) => b.createdAt - a.createdAt);

    const quoteRows = await Promise.all(
      quotes.map(async (quote) => {
        const supplier = await ctx.db.get(quote.supplierOrganizationId);
        const lineItems = await ctx.db
          .query("supplierQuoteLineItems")
          .withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
          .collect();
        const supplierTotal = lineItems.reduce((sum, item) => sum + item.supplierTotalPrice, 0);
        const clientTotal = lineItems.reduce((sum, item) => sum + (item.clientFinalTotalPrice ?? 0), 0);
        const overrides = await ctx.db
          .query("marginOverrides")
          .withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
          .collect();
        overrides.sort((a, b) => b.createdAt - a.createdAt);
        const currentMarginPercent = overrides.length > 0 ? overrides[0].newMarginPercent : 0;
        return {
          _id: quote._id,
          status: quote.status,
          leadTimeDays: quote.leadTimeDays,
          validUntil: quote.validUntil,
          supportsPartialFulfillment: quote.supportsPartialFulfillment,
          createdAt: quote.createdAt,
          supplierName: supplier?.name ?? "—",
          supplierAnonymousId: supplier?.supplierAnonymousId ?? "—",
          supplierTotal,
          clientTotal,
          currentMarginPercent,
          overrideCount: overrides.length,
          lineItems: lineItems.map((item) => ({
            _id: item._id,
            rfqLineItemId: item.rfqLineItemId,
            supplierUnitPrice: item.supplierUnitPrice,
            supplierTotalPrice: item.supplierTotalPrice,
            clientFinalUnitPrice: item.clientFinalUnitPrice,
            clientFinalTotalPrice: item.clientFinalTotalPrice
          }))
        };
      })
    );

    return {
      rfq: {
        _id: rfq._id,
        status: rfq.status,
        clientName: clientOrg?.name ?? "—",
        clientAnonymousId: clientOrg?.clientAnonymousId ?? "—",
        requiredDeliveryDate: rfq.requiredDeliveryDate,
        notes: rfq.notes,
        isNonCatalog: rfq.isNonCatalog,
        createdAt: rfq.createdAt
      },
      lineItems: enrichedRfqItems,
      quotes: quoteRows
    };
  }
});

export const listSupplierQuotesForActor = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:submit");

    const supplierOrganizationId = actor.organizationId as Id<"organizations">;
    const supplier = await ctx.db.get(supplierOrganizationId);
    if (!supplier || supplier.type !== "supplier") {
      throw new Error("Only supplier organizations can list quotes.");
    }

    const quotes = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_supplier", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .collect();
    quotes.sort((a, b) => b.createdAt - a.createdAt);

    return await Promise.all(
      quotes.map(async (quote) => {
        const lineItems = await ctx.db
          .query("supplierQuoteLineItems")
          .withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
          .collect();
        const supplierTotal = lineItems.reduce((sum, item) => sum + item.supplierTotalPrice, 0);
        const rfq = await ctx.db.get(quote.rfqId);
        const clientOrg = rfq ? await ctx.db.get(rfq.clientOrganizationId) : null;
        return {
          _id: quote._id,
          rfqId: quote.rfqId,
          status: quote.status,
          leadTimeDays: quote.leadTimeDays,
          validUntil: quote.validUntil,
          supportsPartialFulfillment: quote.supportsPartialFulfillment,
          createdAt: quote.createdAt,
          supplierTotal,
          lineItemCount: lineItems.length,
          clientAnonymousId: clientOrg?.clientAnonymousId ?? "—",
          rfqShortId: quote.rfqId.slice(-6).toUpperCase()
        };
      })
    );
  }
});

export const listReleasedRfqsForClient = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const clientOrganizationId = actor.organizationId as Id<"organizations">;
    const rfqs = await ctx.db
      .query("rfqs")
      .withIndex("by_client", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .collect();

    const releasedRfqs = rfqs.filter((rfq) => rfq.status === "released" || rfq.status === "selected" || rfq.status === "poGenerated");
    releasedRfqs.sort((a, b) => b.updatedAt - a.updatedAt);

    return await Promise.all(
      releasedRfqs.map(async (rfq) => {
        const quotes = await ctx.db
          .query("supplierQuotes")
          .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
          .collect();
        const visibleQuotes = quotes.filter((quote) => quote.status === "released" || quote.status === "selected");
        const releasedTotals = await Promise.all(
          visibleQuotes.map(async (quote) => {
            const lineItems = await ctx.db
              .query("supplierQuoteLineItems")
              .withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
              .collect();
            return lineItems.reduce((sum, item) => sum + (item.clientFinalTotalPrice ?? 0), 0);
          })
        );
        const lowest = releasedTotals.length > 0 ? Math.min(...releasedTotals) : 0;
        const selectedCount = visibleQuotes.filter((quote) => quote.status === "selected").length;

        return {
          _id: rfq._id,
          status: rfq.status,
          requiredDeliveryDate: rfq.requiredDeliveryDate,
          createdAt: rfq.createdAt,
          updatedAt: rfq.updatedAt,
          releasedQuoteCount: visibleQuotes.length,
          selectedCount,
          lowestClientTotal: lowest
        };
      })
    );
  }
});

export const getRfqQuoteComparison = query({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      return null;
    }
    assertSameOrganization(actor, rfq.clientOrganizationId);

    if (rfq.status !== "released" && rfq.status !== "selected" && rfq.status !== "poGenerated") {
      return { rfq: null, lineItems: [], quotes: [], locked: false };
    }

    const rfqLineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
      .collect();
    const enrichedLineItems = await Promise.all(
      rfqLineItems.map(async (item) => {
        const product = item.productId ? await ctx.db.get(item.productId) : null;
        return {
          _id: item._id,
          quantity: item.quantity,
          unit: item.unit,
          descriptionAr: item.descriptionAr,
          descriptionEn: item.descriptionEn,
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

    const quotes = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
      .collect();
    const visibleQuotes = quotes.filter((quote) => quote.status === "released" || quote.status === "selected");

    const enrichedQuotes = await Promise.all(
      visibleQuotes.map(async (quote) => {
        const supplier = await ctx.db.get(quote.supplierOrganizationId);
        const lineItems = await ctx.db
          .query("supplierQuoteLineItems")
          .withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
          .collect();
        const clientTotal = lineItems.reduce((sum, item) => sum + (item.clientFinalTotalPrice ?? 0), 0);
        return {
          _id: quote._id,
          status: quote.status,
          leadTimeDays: quote.leadTimeDays,
          validUntil: quote.validUntil,
          supportsPartialFulfillment: quote.supportsPartialFulfillment,
          createdAt: quote.createdAt,
          supplierAnonymousId: supplier?.supplierAnonymousId ?? "—",
          clientTotal,
          lineItems: lineItems.map((item) => ({
            _id: item._id,
            rfqLineItemId: item.rfqLineItemId,
            clientFinalUnitPrice: item.clientFinalUnitPrice ?? 0,
            clientFinalTotalPrice: item.clientFinalTotalPrice ?? 0
          }))
        };
      })
    );

    return {
      rfq: {
        _id: rfq._id,
        status: rfq.status,
        requiredDeliveryDate: rfq.requiredDeliveryDate,
        notes: rfq.notes
      },
      lineItems: enrichedLineItems,
      quotes: enrichedQuotes,
      locked: rfq.status === "selected" || rfq.status === "poGenerated"
    };
  }
});

export const selectQuote = mutation({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs"),
    quoteId: v.id("supplierQuotes")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      throw new Error("RFQ not found.");
    }
    assertSameOrganization(actor, rfq.clientOrganizationId);
    if (rfq.status !== "released") {
      throw new Error("Only released RFQs can have a quote selected.");
    }

    const quote = await ctx.db.get(args.quoteId);
    if (!quote || quote.rfqId !== args.rfqId) {
      throw new Error("Quote does not belong to this RFQ.");
    }
    if (quote.status !== "released") {
      throw new Error("Quote is no longer available for selection.");
    }

    const expiry = new Date(`${quote.validUntil}T23:59:59`).getTime();
    if (Number.isFinite(expiry) && expiry < Date.now()) {
      throw new Error("Quote validity has expired.");
    }

    const now = Date.now();
    await ctx.db.patch(args.quoteId, {
      status: "selected",
      updatedAt: now
    });

    const otherQuotes = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    for (const other of otherQuotes) {
      if (other._id !== args.quoteId && other.status === "released") {
        await ctx.db.patch(other._id, {
          status: "lost",
          updatedAt: now
        });
      }
    }

    await ctx.db.patch(args.rfqId, {
      status: "selected",
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: rfq.clientOrganizationId,
      action: "quote.selected",
      entityType: "supplierQuote",
      entityId: args.quoteId,
      summary: "Client selected quote — RFQ locked",
      createdAt: now
    });

    const adminOrgs = await ctx.db.query("organizations").withIndex("by_type", (q) => q.eq("type", "admin")).collect();
    for (const adminOrg of adminOrgs) {
      await notifyOrganization(ctx, adminOrg._id, {
        type: "quote.selected",
        titleAr: "تم اختيار عرض",
        titleEn: "Quote selected",
        bodyAr: `قام العميل باختيار عرض للطلب ${args.rfqId.slice(-6).toUpperCase()}.`,
        bodyEn: `Client selected a quote for RFQ ${args.rfqId.slice(-6).toUpperCase()}.`
      });
    }
  }
});

export const listQuotesForAdminReview = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("supplierQuotes")
      .withIndex("by_status", (q) => q.eq("status", "submitted"))
      .collect();
  }
});
