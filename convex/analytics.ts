import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertActiveUser, assertHasPermission } from "./rbac";

export const recordAnalyticsEvent = mutation({
  args: {
    eventName: v.string(),
    userId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations"))
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("analyticsEvents", {
      ...args,
      createdAt: Date.now()
    });
  }
});

function monthKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const getClientReportSummary = query({
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

    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_client", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .collect();

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_client", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .collect();

    const monthlySpend = new Map<string, number>();
    const categorySpend = new Map<Id<"categories">, { nameAr: string; nameEn: string; total: number }>();
    let totalSpend = 0;
    let lineItemTotal = 0;

    for (const purchaseOrder of purchaseOrders) {
      const quoteLineItems = await ctx.db
        .query("supplierQuoteLineItems")
        .withIndex("by_quote", (q) => q.eq("quoteId", purchaseOrder.selectedQuoteId))
        .collect();
      let poTotal = 0;
      for (const item of quoteLineItems) {
        poTotal += item.clientFinalTotalPrice ?? 0;
        lineItemTotal++;
        const rfqLineItem = await ctx.db.get(item.rfqLineItemId);
        if (rfqLineItem?.productId) {
          const product = await ctx.db.get(rfqLineItem.productId);
          if (product) {
            const existing = categorySpend.get(product.categoryId);
            if (existing) {
              existing.total += item.clientFinalTotalPrice ?? 0;
            } else {
              const category = await ctx.db.get(product.categoryId);
              categorySpend.set(product.categoryId, {
                nameAr: category?.nameAr ?? "—",
                nameEn: category?.nameEn ?? "—",
                total: item.clientFinalTotalPrice ?? 0
              });
            }
          }
        }
      }
      totalSpend += poTotal;
      const key = monthKey(purchaseOrder.createdAt);
      monthlySpend.set(key, (monthlySpend.get(key) ?? 0) + poTotal);
    }

    const monthlySeries = Array.from(monthlySpend.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, amount]) => ({ month, amount }));

    const categoryBreakdown = Array.from(categorySpend.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const releasedRfqs = rfqs.filter((rfq) => rfq.status !== "draft");
    const orderRfqIds = new Set(purchaseOrders.map((purchaseOrder) => purchaseOrder.rfqId));
    const conversionRate = releasedRfqs.length > 0 ? (orderRfqIds.size / releasedRfqs.length) * 100 : 0;

    let timeToQuoteSamples = 0;
    let timeToQuoteSum = 0;
    for (const rfq of rfqs) {
      const quotes = await ctx.db
        .query("supplierQuotes")
        .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
        .collect();
      const releasedQuotes = quotes.filter((quote) => quote.status === "released" || quote.status === "selected");
      if (releasedQuotes.length === 0) continue;
      const earliest = releasedQuotes.reduce((min, quote) => (quote.updatedAt < min ? quote.updatedAt : min), Number.POSITIVE_INFINITY);
      timeToQuoteSamples++;
      timeToQuoteSum += earliest - rfq.createdAt;
    }
    const avgTimeToQuoteHours = timeToQuoteSamples > 0 ? timeToQuoteSum / timeToQuoteSamples / 3_600_000 : 0;

    let poApprovalSamples = 0;
    let poApprovalSum = 0;
    for (const purchaseOrder of purchaseOrders) {
      if (purchaseOrder.approvedAt) {
        poApprovalSamples++;
        poApprovalSum += purchaseOrder.approvedAt - purchaseOrder.createdAt;
      }
    }
    const avgPoApprovalHours = poApprovalSamples > 0 ? poApprovalSum / poApprovalSamples / 3_600_000 : 0;

    const completedOrders = orders.filter((order) => order.status === "completed" || order.status === "receiptConfirmed").length;
    const activeOrders = orders.filter((order) => !["completed", "receiptConfirmed"].includes(order.status)).length;

    return {
      totalSpend,
      orderCount: orders.length,
      poCount: purchaseOrders.length,
      rfqCount: rfqs.length,
      lineItemTotal,
      conversionRate,
      avgTimeToQuoteHours,
      avgPoApprovalHours,
      completedOrders,
      activeOrders,
      monthlySeries,
      categoryBreakdown
    };
  }
});
