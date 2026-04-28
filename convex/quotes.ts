import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const quoteLineItemInput = v.object({
  rfqLineItemId: v.id("rfqLineItems"),
  supplierUnitPrice: v.number(),
  supplierTotalPrice: v.number()
});

export const submitSupplierQuote = mutation({
  args: {
    rfqId: v.id("rfqs"),
    supplierOrganizationId: v.id("organizations"),
    submittedByUserId: v.id("users"),
    leadTimeDays: v.number(),
    validUntil: v.string(),
    supportsPartialFulfillment: v.boolean(),
    lineItems: v.array(quoteLineItemInput)
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const quoteId = await ctx.db.insert("supplierQuotes", {
      rfqId: args.rfqId,
      supplierOrganizationId: args.supplierOrganizationId,
      submittedByUserId: args.submittedByUserId,
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
      actorUserId: args.submittedByUserId,
      organizationId: args.supplierOrganizationId,
      action: "quote.submitted",
      entityType: "supplierQuote",
      entityId: quoteId,
      summary: "Supplier quote submitted",
      createdAt: now
    });

    return quoteId;
  }
});

export const approveQuoteForRelease = mutation({
  args: {
    quoteId: v.id("supplierQuotes"),
    actorUserId: v.id("users"),
    marginPercent: v.number()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const quoteItems = await ctx.db
      .query("supplierQuoteLineItems")
      .withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
      .collect();

    for (const item of quoteItems) {
      await ctx.db.patch(item._id, {
        clientFinalUnitPrice: item.supplierUnitPrice * (1 + args.marginPercent / 100),
        clientFinalTotalPrice: item.supplierTotalPrice * (1 + args.marginPercent / 100),
        updatedAt: now
      });
    }

    await ctx.db.patch(args.quoteId, {
      status: "approvedForRelease",
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      action: "quote.approved_for_release",
      entityType: "supplierQuote",
      entityId: args.quoteId,
      summary: "Quote approved with admin-controlled margin",
      createdAt: now
    });
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
