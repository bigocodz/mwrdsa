import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertActiveUser, assertHasPermission } from "./rbac";

const LIVE_REPORT_RECORD_LIMIT = 1000;
const SUMMARY_READ_LIMIT = 5000;
const RECENT_REPORT_ROW_LIMIT = 25;
type ReadCtx = QueryCtx | MutationCtx;

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

function monthKeyFromDay(day: string) {
  return day.slice(0, 7);
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dayRange(day: string) {
  const start = Date.parse(`${day}T00:00:00.000Z`);
  return { start, end: start + 86_400_000 };
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function dimensionName(value?: string) {
  const trimmed = value?.trim();
  return trimmed || "Unassigned";
}

function addDimensionSpend(
  target: Map<string, { name: string; total: number; purchaseOrderCount: number }>,
  name: string,
  total: number
) {
  const existing = target.get(name) ?? { name, total: 0, purchaseOrderCount: 0 };
  existing.total += total;
  existing.purchaseOrderCount++;
  target.set(name, existing);
}

function parseRequiredDeliveryDeadline(requiredDeliveryDate?: string) {
  if (!requiredDeliveryDate) return null;
  const deadline = Date.parse(`${requiredDeliveryDate}T23:59:59.999Z`);
  return Number.isFinite(deadline) ? deadline : null;
}

async function loadSelectedQuoteFinancials(
  ctx: ReadCtx,
  quoteId: Id<"supplierQuotes">,
  scopedRfqLineItemIds?: ReadonlyArray<Id<"rfqLineItems">>
) {
  const lineItems = await ctx.db
    .query("supplierQuoteLineItems")
    .withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
    .collect();
  const scope = scopedRfqLineItemIds && scopedRfqLineItemIds.length > 0
    ? new Set<Id<"rfqLineItems">>(scopedRfqLineItemIds)
    : null;
  const filtered = scope ? lineItems.filter((item) => scope.has(item.rfqLineItemId)) : lineItems;
  const supplierCost = filtered.reduce((sum, item) => sum + item.supplierTotalPrice, 0);
  const revenue = filtered.reduce((sum, item) => sum + (item.clientFinalTotalPrice ?? item.supplierTotalPrice), 0);
  const grossMargin = revenue - supplierCost;
  return {
    supplierCost,
    revenue,
    grossMargin,
    grossMarginRate: percentage(grossMargin, revenue),
    lineItemCount: filtered.length
  };
}

async function loadLatestMarginPercent(ctx: ReadCtx, quoteId: Id<"supplierQuotes">) {
  const overrides = await ctx.db
    .query("marginOverrides")
    .withIndex("by_quote_created_at", (q) => q.eq("quoteId", quoteId))
    .order("desc")
    .collect();
  return {
    currentMarginPercent: overrides[0]?.newMarginPercent ?? 0,
    overrideCount: overrides.length
  };
}

async function loadOrderDeliveredAt(ctx: ReadCtx, orderId: Id<"orders">, status: string, updatedAt: number) {
  const events = await ctx.db
    .query("orderStatusEvents")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  events.sort((a, b) => a.createdAt - b.createdAt);
  const deliveredEvent = events.find((event) => event.status === "delivered" || event.status === "receiptConfirmed" || event.status === "completed");
  if (deliveredEvent) {
    return deliveredEvent.createdAt;
  }
  return status === "delivered" || status === "receiptConfirmed" || status === "completed" ? updatedAt : null;
}

async function loadSelectedQuoteCoverage(
  ctx: ReadCtx,
  rfqId: Id<"rfqs">,
  quoteId: Id<"supplierQuotes">,
  scopedRfqLineItemIds?: ReadonlyArray<Id<"rfqLineItems">>
) {
  const rfqLineItems = await ctx.db
    .query("rfqLineItems")
    .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
    .collect();
  const quoteLineItems = await ctx.db
    .query("supplierQuoteLineItems")
    .withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
    .collect();
  const scope = scopedRfqLineItemIds && scopedRfqLineItemIds.length > 0
    ? new Set<Id<"rfqLineItems">>(scopedRfqLineItemIds)
    : null;
  const requestedSubset = scope ? rfqLineItems.filter((item) => scope.has(item._id)) : rfqLineItems;
  const filteredQuoteLineItems = scope
    ? quoteLineItems.filter((item) => scope.has(item.rfqLineItemId))
    : quoteLineItems;
  const quotedLineItemIds = new Set(filteredQuoteLineItems.map((item) => item.rfqLineItemId));
  const requestedQuantity = requestedSubset.reduce((sum, item) => sum + item.quantity, 0);
  const coveredQuantity = requestedSubset.reduce((sum, item) => sum + (quotedLineItemIds.has(item._id) ? item.quantity : 0), 0);
  return {
    requestedQuantity,
    coveredQuantity,
    requestedLineItemCount: requestedSubset.length,
    coveredLineItemCount: quotedLineItemIds.size,
    fillRate: percentage(coveredQuantity, requestedQuantity)
  };
}

type ClientSpendAccumulator = {
  day: string;
  clientOrganizationId: Id<"organizations">;
  department?: string;
  branch?: string;
  costCenter?: string;
  categoryId?: Id<"categories">;
  totalSpend: number;
  lineItemCount: number;
  purchaseOrderIds: Set<string>;
};

function clientSpendKey(input: {
  department?: string;
  branch?: string;
  costCenter?: string;
  categoryId?: Id<"categories">;
}) {
  return [
    input.department ?? "",
    input.branch ?? "",
    input.costCenter ?? "",
    input.categoryId ?? "base"
  ].join("|");
}

function addClientSpend(
  groups: Map<string, ClientSpendAccumulator>,
  input: {
    day: string;
    clientOrganizationId: Id<"organizations">;
    purchaseOrderId: Id<"purchaseOrders">;
    department?: string;
    branch?: string;
    costCenter?: string;
    categoryId?: Id<"categories">;
    total: number;
    lineItemCount: number;
  }
) {
  const key = clientSpendKey(input);
  const existing = groups.get(key) ?? {
    day: input.day,
    clientOrganizationId: input.clientOrganizationId,
    department: input.department,
    branch: input.branch,
    costCenter: input.costCenter,
    categoryId: input.categoryId,
    totalSpend: 0,
    lineItemCount: 0,
    purchaseOrderIds: new Set<string>()
  };
  existing.totalSpend += input.total;
  existing.lineItemCount += input.lineItemCount;
  existing.purchaseOrderIds.add(input.purchaseOrderId.toString());
  groups.set(key, existing);
}

async function loadApprovedPurchaseOrdersForClientDay(ctx: ReadCtx, clientOrganizationId: Id<"organizations">, day: string) {
  const { start, end } = dayRange(day);
  return await ctx.db
    .query("purchaseOrders")
    .withIndex("by_client_approved_at", (q) =>
      q
        .eq("clientOrganizationId", clientOrganizationId)
        .gte("approvedAt", start)
        .lt("approvedAt", end)
    )
    .collect();
}

async function refreshAdminRevenueDailySummaryForClientDay(ctx: MutationCtx, clientOrganizationId: Id<"organizations">, day: string) {
  const existingRows = await ctx.db
    .query("adminRevenueDailySummaries")
    .withIndex("by_client_day", (q) => q.eq("clientOrganizationId", clientOrganizationId).eq("day", day))
    .collect();
  for (const row of existingRows) {
    await ctx.db.delete(row._id);
  }

  const purchaseOrders = await loadApprovedPurchaseOrdersForClientDay(ctx, clientOrganizationId, day);
  const groups = new Map<Id<"organizations">, {
    supplierOrganizationId: Id<"organizations">;
    revenue: number;
    supplierCost: number;
    grossMargin: number;
    purchaseOrderCount: number;
    lineItemCount: number;
    overrideCount: number;
    marginPercentSum: number;
    marginPercentSamples: number;
  }>();

  for (const purchaseOrder of purchaseOrders) {
    const quote = await ctx.db.get(purchaseOrder.selectedQuoteId);
    if (!quote) continue;
    const financials = await loadSelectedQuoteFinancials(ctx, purchaseOrder.selectedQuoteId, purchaseOrder.awardedRfqLineItemIds);
    const margin = await loadLatestMarginPercent(ctx, purchaseOrder.selectedQuoteId);
    const existing = groups.get(quote.supplierOrganizationId) ?? {
      supplierOrganizationId: quote.supplierOrganizationId,
      revenue: 0,
      supplierCost: 0,
      grossMargin: 0,
      purchaseOrderCount: 0,
      lineItemCount: 0,
      overrideCount: 0,
      marginPercentSum: 0,
      marginPercentSamples: 0
    };
    existing.revenue += financials.revenue;
    existing.supplierCost += financials.supplierCost;
    existing.grossMargin += financials.grossMargin;
    existing.purchaseOrderCount++;
    existing.lineItemCount += financials.lineItemCount;
    existing.overrideCount += margin.overrideCount;
    existing.marginPercentSum += margin.currentMarginPercent;
    existing.marginPercentSamples++;
    groups.set(quote.supplierOrganizationId, existing);
  }

  const now = Date.now();
  for (const group of groups.values()) {
    await ctx.db.insert("adminRevenueDailySummaries", {
      day,
      clientOrganizationId,
      supplierOrganizationId: group.supplierOrganizationId,
      revenue: group.revenue,
      supplierCost: group.supplierCost,
      grossMargin: group.grossMargin,
      purchaseOrderCount: group.purchaseOrderCount,
      lineItemCount: group.lineItemCount,
      overrideCount: group.overrideCount,
      marginPercentSum: group.marginPercentSum,
      marginPercentSamples: group.marginPercentSamples,
      updatedAt: now
    });
  }
}

async function refreshClientSpendDailySummaryForClientDay(ctx: MutationCtx, clientOrganizationId: Id<"organizations">, day: string) {
  const existingRows = await ctx.db
    .query("clientSpendDailySummaries")
    .withIndex("by_client_day", (q) => q.eq("clientOrganizationId", clientOrganizationId).eq("day", day))
    .collect();
  for (const row of existingRows) {
    await ctx.db.delete(row._id);
  }

  const purchaseOrders = await loadApprovedPurchaseOrdersForClientDay(ctx, clientOrganizationId, day);
  const groups = new Map<string, ClientSpendAccumulator>();

  for (const purchaseOrder of purchaseOrders) {
    const rfq = await ctx.db.get(purchaseOrder.rfqId);
    const department = dimensionName(rfq?.department);
    const branch = dimensionName(rfq?.branch);
    const costCenter = dimensionName(rfq?.costCenter);
    const allQuoteLineItems = await ctx.db
      .query("supplierQuoteLineItems")
      .withIndex("by_quote", (q) => q.eq("quoteId", purchaseOrder.selectedQuoteId))
      .collect();
    const awardedScope = purchaseOrder.awardedRfqLineItemIds && purchaseOrder.awardedRfqLineItemIds.length > 0
      ? new Set<Id<"rfqLineItems">>(purchaseOrder.awardedRfqLineItemIds)
      : null;
    const quoteLineItems = awardedScope
      ? allQuoteLineItems.filter((item) => awardedScope.has(item.rfqLineItemId))
      : allQuoteLineItems;
    let poTotal = 0;

    for (const item of quoteLineItems) {
      const total = item.clientFinalTotalPrice ?? 0;
      poTotal += total;
      const rfqLineItem = await ctx.db.get(item.rfqLineItemId);
      const product = rfqLineItem?.productId ? await ctx.db.get(rfqLineItem.productId) : null;
      if (product) {
        addClientSpend(groups, {
          day,
          clientOrganizationId,
          purchaseOrderId: purchaseOrder._id,
          department,
          branch,
          costCenter,
          categoryId: product.categoryId,
          total,
          lineItemCount: 1
        });
      }
    }

    addClientSpend(groups, {
      day,
      clientOrganizationId,
      purchaseOrderId: purchaseOrder._id,
      department,
      branch,
      costCenter,
      total: poTotal,
      lineItemCount: quoteLineItems.length
    });
  }

  const now = Date.now();
  for (const group of groups.values()) {
    await ctx.db.insert("clientSpendDailySummaries", {
      day: group.day,
      clientOrganizationId: group.clientOrganizationId,
      department: group.department,
      branch: group.branch,
      costCenter: group.costCenter,
      categoryId: group.categoryId,
      totalSpend: group.totalSpend,
      purchaseOrderCount: group.purchaseOrderIds.size,
      lineItemCount: group.lineItemCount,
      updatedAt: now
    });
  }
}

async function refreshSupplierPerformanceDailySummary(ctx: MutationCtx, supplierOrganizationId: Id<"organizations">, day: string) {
  const { start, end } = dayRange(day);
  const assignments = await ctx.db
    .query("supplierRfqAssignments")
    .withIndex("by_supplier_updated_at", (q) =>
      q
        .eq("supplierOrganizationId", supplierOrganizationId)
        .gte("updatedAt", start)
        .lt("updatedAt", end)
    )
    .collect();
  const quotes = await ctx.db
    .query("supplierQuotes")
    .withIndex("by_supplier_updated_at", (q) =>
      q
        .eq("supplierOrganizationId", supplierOrganizationId)
        .gte("updatedAt", start)
        .lt("updatedAt", end)
    )
    .collect();
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_supplier_updated_at", (q) =>
      q
        .eq("supplierOrganizationId", supplierOrganizationId)
        .gte("updatedAt", start)
        .lt("updatedAt", end)
    )
    .collect();

  const respondedAssignments = assignments.filter((assignment) => assignment.status === "accepted" || assignment.status === "declined").length;
  const selectedQuoteCount = quotes.filter((quote) => quote.status === "selected").length;
  const decidedQuoteCount = quotes.filter((quote) => quote.status === "selected" || quote.status === "lost" || quote.status === "rejected" || quote.status === "expired").length;
  let completedOrders = 0;
  let delayedOrders = 0;
  let onTimeDeliveries = 0;
  let lateDeliveries = 0;
  let requestedQuantity = 0;
  let coveredQuantity = 0;
  let clientRevenue = 0;

  for (const order of orders) {
    const purchaseOrder = await ctx.db.get(order.purchaseOrderId);
    const rfq = purchaseOrder ? await ctx.db.get(purchaseOrder.rfqId) : null;
    const deliveredAt = await loadOrderDeliveredAt(ctx, order._id, order.status, order.updatedAt);
    const deadline = parseRequiredDeliveryDeadline(rfq?.requiredDeliveryDate);
    const isOnTime = deliveredAt !== null && deadline !== null ? deliveredAt <= deadline : null;
    const coverage = purchaseOrder
      ? await loadSelectedQuoteCoverage(
          ctx,
          purchaseOrder.rfqId,
          purchaseOrder.selectedQuoteId,
          purchaseOrder.awardedRfqLineItemIds
        )
      : { requestedQuantity: 0, coveredQuantity: 0 };
    const financials = purchaseOrder
      ? await loadSelectedQuoteFinancials(ctx, purchaseOrder.selectedQuoteId, purchaseOrder.awardedRfqLineItemIds)
      : { revenue: 0 };

    if (order.status === "delivered" || order.status === "receiptConfirmed" || order.status === "completed") completedOrders++;
    if (order.status === "delayed" || order.status === "disputed") delayedOrders++;
    if (isOnTime === true) onTimeDeliveries++;
    if (isOnTime === false) lateDeliveries++;
    requestedQuantity += coverage.requestedQuantity;
    coveredQuantity += coverage.coveredQuantity;
    clientRevenue += financials.revenue;
  }

  const existing = await ctx.db
    .query("supplierPerformanceDailySummaries")
    .withIndex("by_supplier_day", (q) => q.eq("supplierOrganizationId", supplierOrganizationId).eq("day", day))
    .first();
  const payload = {
    day,
    supplierOrganizationId,
    assignmentCount: assignments.length,
    respondedAssignments,
    quoteCount: quotes.length,
    selectedQuoteCount,
    decidedQuoteCount,
    orderCount: orders.length,
    completedOrders,
    delayedOrders,
    onTimeDeliveries,
    lateDeliveries,
    requestedQuantity,
    coveredQuantity,
    clientRevenue,
    updatedAt: Date.now()
  };
  const hasActivity =
    payload.assignmentCount > 0 ||
    payload.quoteCount > 0 ||
    payload.orderCount > 0 ||
    payload.clientRevenue > 0 ||
    payload.requestedQuantity > 0;

  if (!hasActivity) {
    if (existing) await ctx.db.delete(existing._id);
    return;
  }

  if (existing) {
    await ctx.db.patch(existing._id, payload);
  } else {
    await ctx.db.insert("supplierPerformanceDailySummaries", payload);
  }
}

export async function refreshPurchaseOrderAnalytics(ctx: MutationCtx, purchaseOrderId: Id<"purchaseOrders">) {
  const purchaseOrder = await ctx.db.get(purchaseOrderId);
  if (!purchaseOrder?.approvedAt) return;

  const day = dayKey(purchaseOrder.approvedAt);
  await refreshAdminRevenueDailySummaryForClientDay(ctx, purchaseOrder.clientOrganizationId, day);
  await refreshClientSpendDailySummaryForClientDay(ctx, purchaseOrder.clientOrganizationId, day);
}

export async function refreshSupplierAnalyticsForActivity(ctx: MutationCtx, supplierOrganizationId: Id<"organizations">, timestamp: number) {
  await refreshSupplierPerformanceDailySummary(ctx, supplierOrganizationId, dayKey(timestamp));
}

export async function refreshSupplierAnalyticsForOrder(ctx: MutationCtx, orderId: Id<"orders">, previousUpdatedAt?: number) {
  const order = await ctx.db.get(orderId);
  if (!order) return;

  if (previousUpdatedAt) {
    await refreshSupplierPerformanceDailySummary(ctx, order.supplierOrganizationId, dayKey(previousUpdatedAt));
  }
  if (!previousUpdatedAt || dayKey(previousUpdatedAt) !== dayKey(order.updatedAt)) {
    await refreshSupplierPerformanceDailySummary(ctx, order.supplierOrganizationId, dayKey(order.updatedAt));
  }
}

async function loadRecentAdminQuoteRows(ctx: ReadCtx) {
  const approvedPurchaseOrders = await ctx.db
    .query("purchaseOrders")
    .withIndex("by_approved_at", (q) => q.gt("approvedAt", 0))
    .order("desc")
    .take(RECENT_REPORT_ROW_LIMIT);
  const quoteRows = [];

  for (const purchaseOrder of approvedPurchaseOrders) {
    const quote = await ctx.db.get(purchaseOrder.selectedQuoteId);
    if (!quote) continue;
    const rfq = await ctx.db.get(purchaseOrder.rfqId);
    const client = await ctx.db.get(purchaseOrder.clientOrganizationId);
    const supplier = await ctx.db.get(quote.supplierOrganizationId);
    const financials = await loadSelectedQuoteFinancials(ctx, purchaseOrder.selectedQuoteId, purchaseOrder.awardedRfqLineItemIds);
    const margin = await loadLatestMarginPercent(ctx, purchaseOrder.selectedQuoteId);

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

  return quoteRows;
}

async function buildAdminRevenueMarginSummaryFromRows(ctx: QueryCtx, rows: Doc<"adminRevenueDailySummaries">[]) {
  const monthly = new Map<string, { month: string; revenue: number; supplierCost: number; grossMargin: number; purchaseOrderCount: number }>();
  const clients = new Map<Id<"organizations">, { clientOrganizationId: Id<"organizations">; clientName: string; clientAnonymousId: string; revenue: number; supplierCost: number; grossMargin: number; purchaseOrderCount: number }>();
  const suppliers = new Map<Id<"organizations">, { supplierOrganizationId: Id<"organizations">; supplierName: string; supplierAnonymousId: string; revenue: number; supplierCost: number; grossMargin: number; purchaseOrderCount: number }>();
  const orgCache = new Map<Id<"organizations">, Doc<"organizations"> | null>();
  let totalRevenue = 0;
  let totalSupplierCost = 0;
  let totalGrossMargin = 0;
  let totalLineItems = 0;
  let totalOverrides = 0;
  let marginPercentSum = 0;
  let marginPercentSamples = 0;
  let purchaseOrderCount = 0;

  async function getOrg(id: Id<"organizations">) {
    if (orgCache.has(id)) return orgCache.get(id) ?? null;
    const org = await ctx.db.get(id);
    orgCache.set(id, org);
    return org;
  }

  for (const row of rows) {
    totalRevenue += row.revenue;
    totalSupplierCost += row.supplierCost;
    totalGrossMargin += row.grossMargin;
    totalLineItems += row.lineItemCount;
    totalOverrides += row.overrideCount;
    marginPercentSum += row.marginPercentSum;
    marginPercentSamples += row.marginPercentSamples;
    purchaseOrderCount += row.purchaseOrderCount;

    const month = monthKeyFromDay(row.day);
    const existingMonth = monthly.get(month) ?? { month, revenue: 0, supplierCost: 0, grossMargin: 0, purchaseOrderCount: 0 };
    existingMonth.revenue += row.revenue;
    existingMonth.supplierCost += row.supplierCost;
    existingMonth.grossMargin += row.grossMargin;
    existingMonth.purchaseOrderCount += row.purchaseOrderCount;
    monthly.set(month, existingMonth);

    const client = await getOrg(row.clientOrganizationId);
    const existingClient = clients.get(row.clientOrganizationId) ?? {
      clientOrganizationId: row.clientOrganizationId,
      clientName: client?.name ?? "—",
      clientAnonymousId: client?.clientAnonymousId ?? "—",
      revenue: 0,
      supplierCost: 0,
      grossMargin: 0,
      purchaseOrderCount: 0
    };
    existingClient.revenue += row.revenue;
    existingClient.supplierCost += row.supplierCost;
    existingClient.grossMargin += row.grossMargin;
    existingClient.purchaseOrderCount += row.purchaseOrderCount;
    clients.set(row.clientOrganizationId, existingClient);

    const supplier = await getOrg(row.supplierOrganizationId);
    const existingSupplier = suppliers.get(row.supplierOrganizationId) ?? {
      supplierOrganizationId: row.supplierOrganizationId,
      supplierName: supplier?.name ?? "—",
      supplierAnonymousId: supplier?.supplierAnonymousId ?? "—",
      revenue: 0,
      supplierCost: 0,
      grossMargin: 0,
      purchaseOrderCount: 0
    };
    existingSupplier.revenue += row.revenue;
    existingSupplier.supplierCost += row.supplierCost;
    existingSupplier.grossMargin += row.grossMargin;
    existingSupplier.purchaseOrderCount += row.purchaseOrderCount;
    suppliers.set(row.supplierOrganizationId, existingSupplier);
  }

  const monthlySeries = Array.from(monthly.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
    .map((entry) => ({ ...entry, grossMarginRate: percentage(entry.grossMargin, entry.revenue) }));

  const clientBreakdown = Array.from(clients.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((entry) => ({ ...entry, grossMarginRate: percentage(entry.grossMargin, entry.revenue) }));

  const supplierBreakdown = Array.from(suppliers.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((entry) => ({ ...entry, grossMarginRate: percentage(entry.grossMargin, entry.revenue) }));

  return {
    totalRevenue,
    totalSupplierCost,
    totalGrossMargin,
    grossMarginRate: percentage(totalGrossMargin, totalRevenue),
    averageAppliedMarginPercent: marginPercentSamples > 0 ? marginPercentSum / marginPercentSamples : 0,
    purchaseOrderCount,
    selectedQuoteCount: purchaseOrderCount,
    totalLineItems,
    totalOverrides,
    monthlySeries,
    clientBreakdown,
    supplierBreakdown,
    quoteRows: await loadRecentAdminQuoteRows(ctx)
  };
}

async function buildClientOperationalMetrics(
  ctx: QueryCtx,
  rfqs: Doc<"rfqs">[],
  purchaseOrders: Doc<"purchaseOrders">[],
  orders: Doc<"orders">[]
) {
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

  let poApprovalSamples = 0;
  let poApprovalSum = 0;
  for (const purchaseOrder of purchaseOrders) {
    if (purchaseOrder.approvedAt) {
      poApprovalSamples++;
      poApprovalSum += purchaseOrder.approvedAt - purchaseOrder.createdAt;
    }
  }

  return {
    conversionRate,
    avgTimeToQuoteHours: timeToQuoteSamples > 0 ? timeToQuoteSum / timeToQuoteSamples / 3_600_000 : 0,
    avgPoApprovalHours: poApprovalSamples > 0 ? poApprovalSum / poApprovalSamples / 3_600_000 : 0,
    completedOrders: orders.filter((order) => order.status === "completed" || order.status === "receiptConfirmed").length,
    activeOrders: orders.filter((order) => !["completed", "receiptConfirmed"].includes(order.status)).length
  };
}

async function buildClientReportSummaryFromRows(
  ctx: QueryCtx,
  rows: Doc<"clientSpendDailySummaries">[],
  counts: { orderCount: number; poCount: number; rfqCount: number },
  operationalMetrics: Awaited<ReturnType<typeof buildClientOperationalMetrics>>
) {
  const baseRows = rows.filter((row) => row.categoryId === undefined);
  const categoryRows = rows.filter((row) => row.categoryId !== undefined);
  const monthlySpend = new Map<string, number>();
  const categorySpend = new Map<Id<"categories">, { nameAr: string; nameEn: string; total: number }>();
  const departmentSpend = new Map<string, { name: string; total: number; purchaseOrderCount: number }>();
  const branchSpend = new Map<string, { name: string; total: number; purchaseOrderCount: number }>();
  const costCenterSpend = new Map<string, { name: string; total: number; purchaseOrderCount: number }>();
  let totalSpend = 0;
  let lineItemTotal = 0;

  for (const row of baseRows) {
    totalSpend += row.totalSpend;
    lineItemTotal += row.lineItemCount;
    const month = monthKeyFromDay(row.day);
    monthlySpend.set(month, (monthlySpend.get(month) ?? 0) + row.totalSpend);
    addDimensionSpend(departmentSpend, row.department ?? "Unassigned", row.totalSpend);
    departmentSpend.get(row.department ?? "Unassigned")!.purchaseOrderCount += row.purchaseOrderCount - 1;
    addDimensionSpend(branchSpend, row.branch ?? "Unassigned", row.totalSpend);
    branchSpend.get(row.branch ?? "Unassigned")!.purchaseOrderCount += row.purchaseOrderCount - 1;
    addDimensionSpend(costCenterSpend, row.costCenter ?? "Unassigned", row.totalSpend);
    costCenterSpend.get(row.costCenter ?? "Unassigned")!.purchaseOrderCount += row.purchaseOrderCount - 1;
  }

  for (const row of categoryRows) {
    if (!row.categoryId) continue;
    const category = await ctx.db.get(row.categoryId);
    const existing = categorySpend.get(row.categoryId);
    if (existing) {
      existing.total += row.totalSpend;
    } else {
      categorySpend.set(row.categoryId, {
        nameAr: category?.nameAr ?? "—",
        nameEn: category?.nameEn ?? "—",
        total: row.totalSpend
      });
    }
  }

  return {
    totalSpend,
    orderCount: counts.orderCount,
    poCount: counts.poCount,
    rfqCount: counts.rfqCount,
    lineItemTotal,
    ...operationalMetrics,
    monthlySeries: Array.from(monthlySpend.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, amount]) => ({ month, amount })),
    categoryBreakdown: Array.from(categorySpend.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),
    departmentBreakdown: Array.from(departmentSpend.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
    branchBreakdown: Array.from(branchSpend.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
    costCenterBreakdown: Array.from(costCenterSpend.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  };
}

async function loadRecentSupplierFulfillmentRows(ctx: QueryCtx, supplierOrganizationId: Id<"organizations">) {
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_supplier_updated_at", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
    .order("desc")
    .take(RECENT_REPORT_ROW_LIMIT);
  const fulfillmentRows = [];

  for (const order of orders) {
    const purchaseOrder = await ctx.db.get(order.purchaseOrderId);
    const rfq = purchaseOrder ? await ctx.db.get(purchaseOrder.rfqId) : null;
    const client = await ctx.db.get(order.clientOrganizationId);
    const deliveredAt = await loadOrderDeliveredAt(ctx, order._id, order.status, order.updatedAt);
    const deadline = parseRequiredDeliveryDeadline(rfq?.requiredDeliveryDate);
    const isDeliverySample = deliveredAt !== null && deadline !== null;
    const isOnTime = isDeliverySample ? deliveredAt <= deadline : null;
    const coverage = purchaseOrder
      ? await loadSelectedQuoteCoverage(
          ctx,
          purchaseOrder.rfqId,
          purchaseOrder.selectedQuoteId,
          purchaseOrder.awardedRfqLineItemIds
        )
      : { requestedQuantity: 0, coveredQuantity: 0, requestedLineItemCount: 0, coveredLineItemCount: 0, fillRate: 0 };
    const financials = purchaseOrder
      ? await loadSelectedQuoteFinancials(ctx, purchaseOrder.selectedQuoteId, purchaseOrder.awardedRfqLineItemIds)
      : { revenue: 0 };

    fulfillmentRows.push({
      orderId: order._id,
      purchaseOrderId: order.purchaseOrderId,
      rfqId: purchaseOrder?.rfqId ?? null,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      requiredDeliveryDate: rfq?.requiredDeliveryDate,
      deliveredAt,
      isOnTime,
      clientAnonymousId: client?.clientAnonymousId ?? "—",
      fillRate: coverage.fillRate,
      requestedQuantity: coverage.requestedQuantity,
      coveredQuantity: coverage.coveredQuantity,
      requestedLineItemCount: coverage.requestedLineItemCount,
      coveredLineItemCount: coverage.coveredLineItemCount,
      clientRevenue: financials.revenue
    });
  }

  return fulfillmentRows;
}

async function buildSupplierPerformanceSummaryFromRows(
  ctx: QueryCtx,
  supplierOrganizationId: Id<"organizations">,
  rows: Doc<"supplierPerformanceDailySummaries">[]
) {
  const monthly = new Map<string, { month: string; orderCount: number; onTimeDeliveries: number; lateDeliveries: number; requestedQuantity: number; coveredQuantity: number }>();
  let assignmentCount = 0;
  let respondedAssignments = 0;
  let quoteCount = 0;
  let selectedQuotes = 0;
  let decidedQuotes = 0;
  let orderCount = 0;
  let completedOrders = 0;
  let delayedOrders = 0;
  let onTimeDeliveries = 0;
  let lateDeliveries = 0;
  let requestedQuantity = 0;
  let coveredQuantity = 0;
  let clientRevenue = 0;

  for (const row of rows) {
    assignmentCount += row.assignmentCount;
    respondedAssignments += row.respondedAssignments;
    quoteCount += row.quoteCount;
    selectedQuotes += row.selectedQuoteCount;
    decidedQuotes += row.decidedQuoteCount;
    orderCount += row.orderCount;
    completedOrders += row.completedOrders;
    delayedOrders += row.delayedOrders;
    onTimeDeliveries += row.onTimeDeliveries;
    lateDeliveries += row.lateDeliveries;
    requestedQuantity += row.requestedQuantity;
    coveredQuantity += row.coveredQuantity;
    clientRevenue += row.clientRevenue;

    const month = monthKeyFromDay(row.day);
    const existingMonth = monthly.get(month) ?? { month, orderCount: 0, onTimeDeliveries: 0, lateDeliveries: 0, requestedQuantity: 0, coveredQuantity: 0 };
    existingMonth.orderCount += row.orderCount;
    existingMonth.onTimeDeliveries += row.onTimeDeliveries;
    existingMonth.lateDeliveries += row.lateDeliveries;
    existingMonth.requestedQuantity += row.requestedQuantity;
    existingMonth.coveredQuantity += row.coveredQuantity;
    monthly.set(month, existingMonth);
  }

  return {
    assignmentCount,
    respondedAssignments,
    responseRate: percentage(respondedAssignments, assignmentCount),
    quoteCount,
    selectedQuotes,
    winRate: percentage(selectedQuotes, decidedQuotes),
    orderCount,
    completedOrders,
    delayedOrders,
    onTimeDeliveries,
    lateDeliveries,
    onTimeRate: percentage(onTimeDeliveries, onTimeDeliveries + lateDeliveries),
    fillRate: percentage(coveredQuantity, requestedQuantity),
    requestedQuantity,
    coveredQuantity,
    clientRevenue,
    monthlySeries: Array.from(monthly.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((entry) => ({
        ...entry,
        onTimeRate: percentage(entry.onTimeDeliveries, entry.onTimeDeliveries + entry.lateDeliveries),
        fillRate: percentage(entry.coveredQuantity, entry.requestedQuantity)
      })),
    fulfillmentRows: await loadRecentSupplierFulfillmentRows(ctx, supplierOrganizationId)
  };
}

export const rebuildAnalyticsSummariesForAdmin = mutation({
  args: {
    actorUserId: v.id("users"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "analytics:view");
    const actorOrganization = await ctx.db.get(actor.organizationId as Id<"organizations">);
    if (!actorOrganization || actorOrganization.type !== "admin") {
      throw new Error("Only admin organizations can rebuild analytics summaries.");
    }

    const limit = Math.min(args.limit ?? 200, 500);
    const approvedPurchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_approved_at", (q) => q.gt("approvedAt", 0))
      .order("desc")
      .take(limit);
    const clientDays = new Map<string, { clientOrganizationId: Id<"organizations">; day: string }>();

    for (const purchaseOrder of approvedPurchaseOrders) {
      if (!purchaseOrder.approvedAt) continue;
      const day = dayKey(purchaseOrder.approvedAt);
      clientDays.set(`${purchaseOrder.clientOrganizationId}:${day}`, {
        clientOrganizationId: purchaseOrder.clientOrganizationId,
        day
      });
    }

    for (const entry of clientDays.values()) {
      await refreshAdminRevenueDailySummaryForClientDay(ctx, entry.clientOrganizationId, entry.day);
      await refreshClientSpendDailySummaryForClientDay(ctx, entry.clientOrganizationId, entry.day);
    }

    const recentOrders = await ctx.db.query("orders").order("desc").take(limit);
    const supplierDays = new Map<string, { supplierOrganizationId: Id<"organizations">; day: string }>();
    for (const order of recentOrders) {
      const day = dayKey(order.updatedAt);
      supplierDays.set(`${order.supplierOrganizationId}:${day}`, {
        supplierOrganizationId: order.supplierOrganizationId,
        day
      });
    }

    for (const entry of supplierDays.values()) {
      await refreshSupplierPerformanceDailySummary(ctx, entry.supplierOrganizationId, entry.day);
    }

    return {
      refreshedClientDays: clientDays.size,
      refreshedSupplierDays: supplierDays.size
    };
  }
});

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
      .withIndex("by_client_updated_at", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .order("desc")
      .take(LIVE_REPORT_RECORD_LIMIT);

    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_client_updated_at", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .order("desc")
      .take(LIVE_REPORT_RECORD_LIMIT);

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_client_updated_at", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .order("desc")
      .take(LIVE_REPORT_RECORD_LIMIT);
    const approvedPurchaseOrders = purchaseOrders.filter((purchaseOrder) => purchaseOrder.approvedAt !== undefined);
    const operationalMetrics = await buildClientOperationalMetrics(ctx, rfqs, purchaseOrders, orders);
    const summaryRows = await ctx.db
      .query("clientSpendDailySummaries")
      .withIndex("by_client_day", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .order("desc")
      .take(SUMMARY_READ_LIMIT);
    if (summaryRows.length > 0) {
      return await buildClientReportSummaryFromRows(
        ctx,
        summaryRows,
        { orderCount: orders.length, poCount: purchaseOrders.length, rfqCount: rfqs.length },
        operationalMetrics
      );
    }

    const monthlySpend = new Map<string, number>();
    const categorySpend = new Map<Id<"categories">, { nameAr: string; nameEn: string; total: number }>();
    const departmentSpend = new Map<string, { name: string; total: number; purchaseOrderCount: number }>();
    const branchSpend = new Map<string, { name: string; total: number; purchaseOrderCount: number }>();
    const costCenterSpend = new Map<string, { name: string; total: number; purchaseOrderCount: number }>();
    let totalSpend = 0;
    let lineItemTotal = 0;

    for (const purchaseOrder of approvedPurchaseOrders) {
      const rfq = await ctx.db.get(purchaseOrder.rfqId);
      const allQuoteLineItems = await ctx.db
        .query("supplierQuoteLineItems")
        .withIndex("by_quote", (q) => q.eq("quoteId", purchaseOrder.selectedQuoteId))
        .collect();
      const awardedScope = purchaseOrder.awardedRfqLineItemIds && purchaseOrder.awardedRfqLineItemIds.length > 0
        ? new Set<Id<"rfqLineItems">>(purchaseOrder.awardedRfqLineItemIds)
        : null;
      const quoteLineItems = awardedScope
        ? allQuoteLineItems.filter((item) => awardedScope.has(item.rfqLineItemId))
        : allQuoteLineItems;
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
      addDimensionSpend(departmentSpend, dimensionName(rfq?.department), poTotal);
      addDimensionSpend(branchSpend, dimensionName(rfq?.branch), poTotal);
      addDimensionSpend(costCenterSpend, dimensionName(rfq?.costCenter), poTotal);
    }

    const monthlySeries = Array.from(monthlySpend.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, amount]) => ({ month, amount }));

    const categoryBreakdown = Array.from(categorySpend.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const departmentBreakdown = Array.from(departmentSpend.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    const branchBreakdown = Array.from(branchSpend.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    const costCenterBreakdown = Array.from(costCenterSpend.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

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
      categoryBreakdown,
      departmentBreakdown,
      branchBreakdown,
      costCenterBreakdown
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

    const summaryRows = await ctx.db
      .query("adminRevenueDailySummaries")
      .withIndex("by_day")
      .order("desc")
      .take(SUMMARY_READ_LIMIT);
    if (summaryRows.length > 0) {
      return await buildAdminRevenueMarginSummaryFromRows(ctx, summaryRows);
    }

    const approvedPurchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_approved_at", (q) => q.gt("approvedAt", 0))
      .order("desc")
      .take(LIVE_REPORT_RECORD_LIMIT);

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

    for (const purchaseOrder of approvedPurchaseOrders) {
      const quote = await ctx.db.get(purchaseOrder.selectedQuoteId);
      if (!quote) {
        continue;
      }
      const rfq = await ctx.db.get(purchaseOrder.rfqId);
      const client = await ctx.db.get(purchaseOrder.clientOrganizationId);
      const supplier = await ctx.db.get(quote.supplierOrganizationId);
      const financials = await loadSelectedQuoteFinancials(ctx, purchaseOrder.selectedQuoteId, purchaseOrder.awardedRfqLineItemIds);
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
      purchaseOrderCount: approvedPurchaseOrders.length,
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

export const getSupplierPerformanceSummary = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "analytics:view");

    const supplierOrganizationId = actor.organizationId as Id<"organizations">;
    const supplier = await ctx.db.get(supplierOrganizationId);
    if (!supplier || supplier.type !== "supplier") {
      throw new Error("Only supplier organizations can view supplier performance analytics.");
    }

    const summaryRows = await ctx.db
      .query("supplierPerformanceDailySummaries")
      .withIndex("by_supplier_day", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .order("desc")
      .take(SUMMARY_READ_LIMIT);
    if (summaryRows.length > 0) {
      return await buildSupplierPerformanceSummaryFromRows(ctx, supplierOrganizationId, summaryRows);
    }

    const assignments = await ctx.db
      .query("supplierRfqAssignments")
      .withIndex("by_supplier", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .order("desc")
      .take(LIVE_REPORT_RECORD_LIMIT);
    const quotes = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_supplier", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .order("desc")
      .take(LIVE_REPORT_RECORD_LIMIT);
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_supplier_updated_at", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .order("desc")
      .take(LIVE_REPORT_RECORD_LIMIT);

    const respondedAssignments = assignments.filter((assignment) => assignment.status === "accepted" || assignment.status === "declined").length;
    const selectedQuotes = quotes.filter((quote) => quote.status === "selected").length;
    const decidedQuotes = quotes.filter((quote) => quote.status === "selected" || quote.status === "lost" || quote.status === "rejected" || quote.status === "expired").length;

    let onTimeDeliveries = 0;
    let lateDeliveries = 0;
    let deliverySamples = 0;
    let requestedQuantity = 0;
    let coveredQuantity = 0;
    let clientRevenue = 0;

    const monthly = new Map<string, { month: string; orderCount: number; onTimeDeliveries: number; lateDeliveries: number; requestedQuantity: number; coveredQuantity: number }>();
    const fulfillmentRows = [];

    for (const order of orders) {
      const purchaseOrder = await ctx.db.get(order.purchaseOrderId);
      const rfq = purchaseOrder ? await ctx.db.get(purchaseOrder.rfqId) : null;
      const client = await ctx.db.get(order.clientOrganizationId);
      const deliveredAt = await loadOrderDeliveredAt(ctx, order._id, order.status, order.updatedAt);
      const deadline = parseRequiredDeliveryDeadline(rfq?.requiredDeliveryDate);
      const isDeliverySample = deliveredAt !== null && deadline !== null;
      const isOnTime = isDeliverySample ? deliveredAt <= deadline : null;
      const coverage = purchaseOrder
        ? await loadSelectedQuoteCoverage(
            ctx,
            purchaseOrder.rfqId,
            purchaseOrder.selectedQuoteId,
            purchaseOrder.awardedRfqLineItemIds
          )
        : { requestedQuantity: 0, coveredQuantity: 0, requestedLineItemCount: 0, coveredLineItemCount: 0, fillRate: 0 };
      const financials = purchaseOrder
        ? await loadSelectedQuoteFinancials(ctx, purchaseOrder.selectedQuoteId, purchaseOrder.awardedRfqLineItemIds)
        : { revenue: 0 };

      if (isOnTime === true) {
        onTimeDeliveries++;
        deliverySamples++;
      } else if (isOnTime === false) {
        lateDeliveries++;
        deliverySamples++;
      }

      requestedQuantity += coverage.requestedQuantity;
      coveredQuantity += coverage.coveredQuantity;
      clientRevenue += financials.revenue;

      const month = monthKey(order.createdAt);
      const existingMonth = monthly.get(month) ?? { month, orderCount: 0, onTimeDeliveries: 0, lateDeliveries: 0, requestedQuantity: 0, coveredQuantity: 0 };
      existingMonth.orderCount++;
      existingMonth.onTimeDeliveries += isOnTime === true ? 1 : 0;
      existingMonth.lateDeliveries += isOnTime === false ? 1 : 0;
      existingMonth.requestedQuantity += coverage.requestedQuantity;
      existingMonth.coveredQuantity += coverage.coveredQuantity;
      monthly.set(month, existingMonth);

      fulfillmentRows.push({
        orderId: order._id,
        purchaseOrderId: order.purchaseOrderId,
        rfqId: purchaseOrder?.rfqId ?? null,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        requiredDeliveryDate: rfq?.requiredDeliveryDate,
        deliveredAt,
        isOnTime,
        clientAnonymousId: client?.clientAnonymousId ?? "—",
        fillRate: coverage.fillRate,
        requestedQuantity: coverage.requestedQuantity,
        coveredQuantity: coverage.coveredQuantity,
        requestedLineItemCount: coverage.requestedLineItemCount,
        coveredLineItemCount: coverage.coveredLineItemCount,
        clientRevenue: financials.revenue
      });
    }

    const completedOrders = orders.filter((order) => order.status === "delivered" || order.status === "receiptConfirmed" || order.status === "completed").length;
    const delayedOrders = orders.filter((order) => order.status === "delayed" || order.status === "disputed").length;

    const monthlySeries = Array.from(monthly.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((entry) => ({
        ...entry,
        onTimeRate: percentage(entry.onTimeDeliveries, entry.onTimeDeliveries + entry.lateDeliveries),
        fillRate: percentage(entry.coveredQuantity, entry.requestedQuantity)
      }));

    return {
      assignmentCount: assignments.length,
      respondedAssignments,
      responseRate: percentage(respondedAssignments, assignments.length),
      quoteCount: quotes.length,
      selectedQuotes,
      winRate: percentage(selectedQuotes, decidedQuotes),
      orderCount: orders.length,
      completedOrders,
      delayedOrders,
      onTimeDeliveries,
      lateDeliveries,
      onTimeRate: percentage(onTimeDeliveries, deliverySamples),
      fillRate: percentage(coveredQuantity, requestedQuantity),
      requestedQuantity,
      coveredQuantity,
      clientRevenue,
      monthlySeries,
      fulfillmentRows: fulfillmentRows.slice(0, 25)
    };
  }
});
