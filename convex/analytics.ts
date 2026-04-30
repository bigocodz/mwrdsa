import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
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

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

async function loadSelectedQuoteFinancials(ctx: QueryCtx, quoteId: Id<"supplierQuotes">) {
  const lineItems = await ctx.db
    .query("supplierQuoteLineItems")
    .withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
    .collect();
  const supplierCost = lineItems.reduce((sum, item) => sum + item.supplierTotalPrice, 0);
  const revenue = lineItems.reduce((sum, item) => sum + (item.clientFinalTotalPrice ?? item.supplierTotalPrice), 0);
  const grossMargin = revenue - supplierCost;
  return {
    supplierCost,
    revenue,
    grossMargin,
    grossMarginRate: percentage(grossMargin, revenue),
    lineItemCount: lineItems.length
  };
}

async function loadLatestMarginPercent(ctx: QueryCtx, quoteId: Id<"supplierQuotes">) {
  const overrides = await ctx.db
    .query("marginOverrides")
    .withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
    .collect();
  overrides.sort((a, b) => b.createdAt - a.createdAt);
  return {
    currentMarginPercent: overrides[0]?.newMarginPercent ?? 0,
    overrideCount: overrides.length
  };
}

export const getClientReportSummary = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "analytics:view");

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

export const getAdminRevenueMarginSummary = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "analytics:view");

    const actorOrganization = await ctx.db.get(actor.organizationId as Id<"organizations">);
    if (!actorOrganization || actorOrganization.type !== "admin") {
      throw new Error("Only admin organizations can view revenue and margin analytics.");
    }

    const purchaseOrders = await ctx.db.query("purchaseOrders").collect();
    purchaseOrders.sort((a, b) => b.createdAt - a.createdAt);

    const monthly = new Map<string, { month: string; revenue: number; supplierCost: number; grossMargin: number; purchaseOrderCount: number }>();
    const clients = new Map<Id<"organizations">, { clientOrganizationId: Id<"organizations">; clientName: string; clientAnonymousId: string; revenue: number; supplierCost: number; grossMargin: number; purchaseOrderCount: number }>();
    const suppliers = new Map<Id<"organizations">, { supplierOrganizationId: Id<"organizations">; supplierName: string; supplierAnonymousId: string; revenue: number; supplierCost: number; grossMargin: number; purchaseOrderCount: number }>();

    let totalRevenue = 0;
    let totalSupplierCost = 0;
    let totalGrossMargin = 0;
    let totalLineItems = 0;
    let totalOverrides = 0;
    let marginPercentSum = 0;
    let marginPercentSamples = 0;

    const quoteRows = [];

    for (const purchaseOrder of purchaseOrders) {
      const quote = await ctx.db.get(purchaseOrder.selectedQuoteId);
      if (!quote) {
        continue;
      }
      const rfq = await ctx.db.get(purchaseOrder.rfqId);
      const client = await ctx.db.get(purchaseOrder.clientOrganizationId);
      const supplier = await ctx.db.get(quote.supplierOrganizationId);
      const financials = await loadSelectedQuoteFinancials(ctx, purchaseOrder.selectedQuoteId);
      const margin = await loadLatestMarginPercent(ctx, purchaseOrder.selectedQuoteId);

      totalRevenue += financials.revenue;
      totalSupplierCost += financials.supplierCost;
      totalGrossMargin += financials.grossMargin;
      totalLineItems += financials.lineItemCount;
      totalOverrides += margin.overrideCount;
      marginPercentSum += margin.currentMarginPercent;
      marginPercentSamples++;

      const month = monthKey(purchaseOrder.createdAt);
      const existingMonth = monthly.get(month) ?? { month, revenue: 0, supplierCost: 0, grossMargin: 0, purchaseOrderCount: 0 };
      existingMonth.revenue += financials.revenue;
      existingMonth.supplierCost += financials.supplierCost;
      existingMonth.grossMargin += financials.grossMargin;
      existingMonth.purchaseOrderCount++;
      monthly.set(month, existingMonth);

      const existingClient = clients.get(purchaseOrder.clientOrganizationId) ?? {
        clientOrganizationId: purchaseOrder.clientOrganizationId,
        clientName: client?.name ?? "—",
        clientAnonymousId: client?.clientAnonymousId ?? "—",
        revenue: 0,
        supplierCost: 0,
        grossMargin: 0,
        purchaseOrderCount: 0
      };
      existingClient.revenue += financials.revenue;
      existingClient.supplierCost += financials.supplierCost;
      existingClient.grossMargin += financials.grossMargin;
      existingClient.purchaseOrderCount++;
      clients.set(purchaseOrder.clientOrganizationId, existingClient);

      const existingSupplier = suppliers.get(quote.supplierOrganizationId) ?? {
        supplierOrganizationId: quote.supplierOrganizationId,
        supplierName: supplier?.name ?? "—",
        supplierAnonymousId: supplier?.supplierAnonymousId ?? "—",
        revenue: 0,
        supplierCost: 0,
        grossMargin: 0,
        purchaseOrderCount: 0
      };
      existingSupplier.revenue += financials.revenue;
      existingSupplier.supplierCost += financials.supplierCost;
      existingSupplier.grossMargin += financials.grossMargin;
      existingSupplier.purchaseOrderCount++;
      suppliers.set(quote.supplierOrganizationId, existingSupplier);

      quoteRows.push({
        purchaseOrderId: purchaseOrder._id,
        rfqId: purchaseOrder.rfqId,
        quoteId: purchaseOrder.selectedQuoteId,
        status: purchaseOrder.status,
        createdAt: purchaseOrder.createdAt,
        approvedAt: purchaseOrder.approvedAt,
        clientName: client?.name ?? "—",
        clientAnonymousId: client?.clientAnonymousId ?? "—",
        supplierName: supplier?.name ?? "—",
        supplierAnonymousId: supplier?.supplierAnonymousId ?? "—",
        requiredDeliveryDate: rfq?.requiredDeliveryDate,
        revenue: financials.revenue,
        supplierCost: financials.supplierCost,
        grossMargin: financials.grossMargin,
        grossMarginRate: financials.grossMarginRate,
        currentMarginPercent: margin.currentMarginPercent,
        overrideCount: margin.overrideCount,
        lineItemCount: financials.lineItemCount
      });
    }

    const monthlySeries = Array.from(monthly.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((entry) => ({
        ...entry,
        grossMarginRate: percentage(entry.grossMargin, entry.revenue)
      }));

    const clientBreakdown = Array.from(clients.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((entry) => ({
        ...entry,
        grossMarginRate: percentage(entry.grossMargin, entry.revenue)
      }));

    const supplierBreakdown = Array.from(suppliers.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((entry) => ({
        ...entry,
        grossMarginRate: percentage(entry.grossMargin, entry.revenue)
      }));

    return {
      totalRevenue,
      totalSupplierCost,
      totalGrossMargin,
      grossMarginRate: percentage(totalGrossMargin, totalRevenue),
      averageAppliedMarginPercent: marginPercentSamples > 0 ? marginPercentSum / marginPercentSamples : 0,
      purchaseOrderCount: purchaseOrders.length,
      selectedQuoteCount: quoteRows.length,
      totalLineItems,
      totalOverrides,
      monthlySeries,
      clientBreakdown: clientBreakdown.slice(0, 8),
      supplierBreakdown: supplierBreakdown.slice(0, 8),
      quoteRows: quoteRows.slice(0, 25)
    };
  }
});
