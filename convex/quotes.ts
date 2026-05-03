import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { refreshSupplierAnalyticsForActivity } from "./analytics";
import { notifyOrganization } from "./notifications";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";

const CLIENT_RELEASED_RFQ_LIST_LIMIT = 100;
const CLIENT_RELEASED_RFQ_STATUSES = ["released", "selected", "poGenerated"] as const;
const CLIENT_VISIBLE_QUOTE_STATUSES = ["released", "selected"] as const;
const DEFAULT_MARGIN_PERCENT = 12;
const QUOTE_MANAGER_HOLD_THRESHOLD = 25_000;
type ReadCtx = QueryCtx | MutationCtx;

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

async function loadClientVisibleQuotesForRfq(ctx: QueryCtx, rfqId: Id<"rfqs">) {
  const groups = await Promise.all(
    CLIENT_VISIBLE_QUOTE_STATUSES.map((status) =>
      ctx.db
        .query("supplierQuotes")
        .withIndex("by_rfq_status", (q) => q.eq("rfqId", rfqId).eq("status", status))
        .collect()
    )
  );
  return groups.flat();
}

async function loadReleasedRfqsForClient(ctx: QueryCtx, clientOrganizationId: Id<"organizations">, limit: number) {
  const groups = await Promise.all(
    CLIENT_RELEASED_RFQ_STATUSES.map((status) =>
      ctx.db
        .query("rfqs")
        .withIndex("by_client_status_updated_at", (q) => q.eq("clientOrganizationId", clientOrganizationId).eq("status", status))
        .order("desc")
        .take(limit)
    )
  );

  return groups
    .flat()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

async function buildReleasedRfqRowForClient(ctx: QueryCtx, rfq: Doc<"rfqs">) {
  const visibleQuotes = await loadClientVisibleQuotesForRfq(ctx, rfq._id);
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
}

async function buildSupplierAssignmentRow(ctx: QueryCtx, assignment: Doc<"supplierRfqAssignments">) {
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
}

async function buildSupplierQuoteRow(ctx: QueryCtx, quote: Doc<"supplierQuotes">) {
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
}

type AutoQuoteDraftLine = {
  rfqLineItemId: Id<"rfqLineItems">;
  supplierUnitPrice: number;
  supplierTotalPrice: number;
  leadTimeDays: number;
};

type AutoQuoteDraft = {
  supplierOrganizationId: Id<"organizations">;
  submittedByUserId: Id<"users">;
  reviewWindowMinutes: number;
  lines: AutoQuoteDraftLine[];
};

async function findExistingQuotesForRfq(ctx: ReadCtx, rfqId: Id<"rfqs">) {
  return await ctx.db
    .query("supplierQuotes")
    .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
    .collect();
}

async function loadQuoteLineItems(ctx: ReadCtx, quoteId: Id<"supplierQuotes">) {
  return await ctx.db
    .query("supplierQuoteLineItems")
    .withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
    .collect();
}

async function recommendMarginForQuote(
  ctx: ReadCtx,
  quote: Doc<"supplierQuotes">,
  quoteLineItems?: Doc<"supplierQuoteLineItems">[]
) {
  const rfq = await ctx.db.get(quote.rfqId);
  const lineItems = quoteLineItems ?? await loadQuoteLineItems(ctx, quote._id);
  const rfqLineItems = await Promise.all(lineItems.map((item) => ctx.db.get(item.rfqLineItemId)));
  const categoryIds = new Set<Id<"categories">>();

  for (const rfqLineItem of rfqLineItems) {
    if (!rfqLineItem?.productId) continue;
    const product = await ctx.db.get(rfqLineItem.productId);
    if (product) {
      categoryIds.add(product.categoryId);
    }
  }

  const activeRules = await ctx.db
    .query("marginRules")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .take(500);
  const rankedRules = activeRules
    .map((rule) => {
      const clientMatches = !rule.clientOrganizationId || rule.clientOrganizationId === rfq?.clientOrganizationId;
      const categoryMatches = !rule.categoryId || categoryIds.has(rule.categoryId);
      if (!clientMatches || !categoryMatches) return null;
      const score =
        (rule.clientOrganizationId ? 2 : 0) +
        (rule.categoryId ? 1 : 0);
      return { rule, score };
    })
    .filter((entry): entry is { rule: Doc<"marginRules">; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score || b.rule.updatedAt - a.rule.updatedAt);
  const selected = rankedRules[0]?.rule;
  const recommendedMarginPercent = selected?.marginPercent ?? DEFAULT_MARGIN_PERCENT;
  const supplierTotal = lineItems.reduce((sum, item) => sum + item.supplierTotalPrice, 0);
  const recommendedClientTotal = supplierTotal * (1 + recommendedMarginPercent / 100);

  return {
    recommendedMarginPercent,
    marginRuleName: selected?.name ?? "Default margin",
    marginRuleSource: selected
      ? selected.clientOrganizationId && selected.categoryId
        ? "clientCategory"
        : selected.clientOrganizationId
          ? "client"
          : selected.categoryId
            ? "category"
            : "global"
      : "default",
    supplierTotal,
    recommendedClientTotal,
    thresholdHoldAmount: QUOTE_MANAGER_HOLD_THRESHOLD,
    thresholdHoldRecommended: recommendedClientTotal >= QUOTE_MANAGER_HOLD_THRESHOLD
  };
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
    await refreshSupplierAnalyticsForActivity(ctx, assignment.supplierOrganizationId, now);

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

export const generateAutoQuotesForRfq = mutation({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:operations");

    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      throw new Error("RFQ not found.");
    }
    if (rfq.status === "draft" || rfq.status === "cancelled" || rfq.status === "expired") {
      throw new Error("RFQ is not ready for auto-quote generation.");
    }
    if (rfq.status === "released" || rfq.status === "selected" || rfq.status === "poGenerated") {
      throw new Error("RFQ already moved past admin quote review.");
    }

    const rfqLineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    const catalogLineItems = rfqLineItems.filter((item) => item.productId);
    if (catalogLineItems.length === 0) {
      throw new Error("Auto-quote requires at least one catalog line item.");
    }

    const existingQuotes = await findExistingQuotesForRfq(ctx, args.rfqId);
    const quotedSupplierIds = new Set(existingQuotes.map((quote) => quote.supplierOrganizationId));
    const assignments = await ctx.db
      .query("supplierRfqAssignments")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    const assignmentBySupplierId = new Map(assignments.map((assignment) => [assignment.supplierOrganizationId, assignment]));
    const drafts = new Map<Id<"organizations">, AutoQuoteDraft>();

    for (const lineItem of catalogLineItems) {
      const offers = await ctx.db
        .query("supplierOffers")
        .withIndex("by_product_status", (q) => q.eq("productId", lineItem.productId!).eq("status", "approved"))
        .take(50);
      for (const offer of offers) {
        if (!offer.autoQuoteEnabled || quotedSupplierIds.has(offer.supplierOrganizationId)) {
          continue;
        }
        if (lineItem.quantity < offer.minOrderQuantity) {
          continue;
        }
        if (offer.availableQuantity !== undefined && lineItem.quantity > offer.availableQuantity) {
          continue;
        }
        const existingAssignment = assignmentBySupplierId.get(offer.supplierOrganizationId);
        if (existingAssignment?.status === "declined" || existingAssignment?.status === "expired") {
          continue;
        }

        const draft = drafts.get(offer.supplierOrganizationId) ?? {
          supplierOrganizationId: offer.supplierOrganizationId,
          submittedByUserId: offer.createdByUserId,
          reviewWindowMinutes: offer.reviewWindowMinutes,
          lines: []
        };
        draft.reviewWindowMinutes = Math.max(draft.reviewWindowMinutes, offer.reviewWindowMinutes);
        draft.lines.push({
          rfqLineItemId: lineItem._id,
          supplierUnitPrice: offer.unitCost,
          supplierTotalPrice: offer.unitCost * lineItem.quantity,
          leadTimeDays: offer.leadTimeDays
        });
        drafts.set(offer.supplierOrganizationId, draft);
      }
    }

    if (drafts.size === 0) {
      return {
        quotesCreated: 0,
        lineItemsQuoted: 0,
        skippedExisting: existingQuotes.length,
        partialQuotes: 0
      };
    }

    const now = Date.now();
    let quotesCreated = 0;
    let lineItemsQuoted = 0;
    let partialQuotes = 0;
    const validUntil = new Date(now + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10);

    for (const draft of drafts.values()) {
      if (draft.lines.length === 0) continue;
      const leadTimeDays = Math.max(...draft.lines.map((line) => line.leadTimeDays));
      const assignment = assignmentBySupplierId.get(draft.supplierOrganizationId);
      const responseDeadline = now + draft.reviewWindowMinutes * 60_000;
      if (!assignment) {
        await ctx.db.insert("supplierRfqAssignments", {
          rfqId: args.rfqId,
          supplierOrganizationId: draft.supplierOrganizationId,
          status: "accepted",
          responseDeadline,
          createdAt: now,
          updatedAt: now
        });
      } else if (assignment.status === "assigned") {
        await ctx.db.patch(assignment._id, {
          status: "accepted",
          responseDeadline,
          updatedAt: now
        });
      }

      const quoteId = await ctx.db.insert("supplierQuotes", {
        rfqId: args.rfqId,
        supplierOrganizationId: draft.supplierOrganizationId,
        submittedByUserId: draft.submittedByUserId,
        status: "underReview",
        leadTimeDays,
        validUntil,
        supportsPartialFulfillment: draft.lines.length < rfqLineItems.length,
        createdAt: now,
        updatedAt: now
      });
      for (const line of draft.lines) {
        await ctx.db.insert("supplierQuoteLineItems", {
          quoteId,
          rfqLineItemId: line.rfqLineItemId,
          supplierUnitPrice: line.supplierUnitPrice,
          supplierTotalPrice: line.supplierTotalPrice,
          createdAt: now,
          updatedAt: now
        });
      }
      const quote = await ctx.db.get(quoteId);
      if (quote) {
        const recommendation = await recommendMarginForQuote(ctx, quote);
        if (recommendation.thresholdHoldRecommended) {
          await ctx.db.patch(quoteId, {
            status: "held",
            updatedAt: now
          });
          await ctx.db.insert("auditLogs", {
            actorUserId: args.actorUserId,
            organizationId: draft.supplierOrganizationId,
            action: "quote.threshold_held",
            entityType: "supplierQuote",
            entityId: quoteId,
            summary: `Auto-generated quote held because projected client total exceeds SAR ${QUOTE_MANAGER_HOLD_THRESHOLD}`,
            createdAt: now
          });
        }
      }
      quotesCreated++;
      lineItemsQuoted += draft.lines.length;
      if (draft.lines.length < rfqLineItems.length) {
        partialQuotes++;
      }

      await refreshSupplierAnalyticsForActivity(ctx, draft.supplierOrganizationId, now);
      await notifyOrganization(ctx, draft.supplierOrganizationId, {
        type: "quote.auto_generated",
        titleAr: "تم إنشاء عرض آلي",
        titleEn: "Auto-quote generated",
        bodyAr: "تم إنشاء عرض من قائمة الأسعار المعتمدة وهو بانتظار مراجعة الإدارة.",
        bodyEn: "A quote was generated from your approved rate card and is awaiting MWRD review."
      });
    }

    if (quotesCreated > 0 && rfq.status !== "adminReview") {
      await ctx.db.patch(args.rfqId, {
        status: "adminReview",
        updatedAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: rfq.clientOrganizationId,
      action: "quote.auto_generated",
      entityType: "rfq",
      entityId: args.rfqId,
      summary: `Generated ${quotesCreated} auto quote(s) from approved supplier offers`,
      createdAt: now
    });

    return {
      quotesCreated,
      lineItemsQuoted,
      skippedExisting: existingQuotes.length,
      partialQuotes
    };
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

      const quoteItems = await loadQuoteLineItems(ctx, args.quoteId);
      const recommendation = await recommendMarginForQuote(ctx, quote, quoteItems);

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
        const matchesRecommendedMargin = Math.abs(args.marginPercent - recommendation.recommendedMarginPercent) < 0.0001;
        if (!trimmedReason && !matchesRecommendedMargin) {
          throw new Error("Reason is required when adjusting margin.");
        }
        await ctx.db.insert("marginOverrides", {
          quoteId: args.quoteId,
          adjustedByUserId: args.actorUserId,
          previousMarginPercent,
          newMarginPercent: args.marginPercent,
          reason: trimmedReason ?? `Applied margin rule: ${recommendation.marginRuleName}`,
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

export const bulkApproveRecommendedQuotesForRfq = mutation({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:apply_margin");

    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      throw new Error("RFQ not found.");
    }

    const quotes = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    const reviewableQuotes = quotes.filter((quote) => quote.status === "submitted" || quote.status === "underReview" || quote.status === "held");
    if (reviewableQuotes.length === 0) {
      throw new Error("No reviewable quotes are available for bulk approval.");
    }

    const now = Date.now();
    let approvedCount = 0;
    let thresholdHeldApprovedCount = 0;

    for (const quote of reviewableQuotes) {
      const quoteItems = await loadQuoteLineItems(ctx, quote._id);
      if (quoteItems.length === 0) {
        continue;
      }
      const recommendation = await recommendMarginForQuote(ctx, quote, quoteItems);
      const factor = 1 + recommendation.recommendedMarginPercent / 100;

      for (const item of quoteItems) {
        await ctx.db.patch(item._id, {
          clientFinalUnitPrice: item.supplierUnitPrice * factor,
          clientFinalTotalPrice: item.supplierTotalPrice * factor,
          updatedAt: now
        });
      }

      const previousOverride = await ctx.db
        .query("marginOverrides")
        .withIndex("by_quote_created_at", (q) => q.eq("quoteId", quote._id))
        .order("desc")
        .first();
      const previousMarginPercent = previousOverride?.newMarginPercent ?? 0;
      if (previousMarginPercent !== recommendation.recommendedMarginPercent) {
        await ctx.db.insert("marginOverrides", {
          quoteId: quote._id,
          adjustedByUserId: args.actorUserId,
          previousMarginPercent,
          newMarginPercent: recommendation.recommendedMarginPercent,
          reason: `Bulk applied margin rule: ${recommendation.marginRuleName}`,
          createdAt: now
        });
      }

      await ctx.db.patch(quote._id, {
        status: "approvedForRelease",
        updatedAt: now
      });
      await ctx.db.insert("auditLogs", {
        actorUserId: args.actorUserId,
        organizationId: quote.supplierOrganizationId,
        action: "quote.bulk_approved_for_release",
        entityType: "supplierQuote",
        entityId: quote._id,
        summary: `Bulk approved with ${recommendation.recommendedMarginPercent}% recommended margin`,
        createdAt: now
      });

      approvedCount++;
      if (quote.status === "held" || recommendation.thresholdHoldRecommended) {
        thresholdHeldApprovedCount++;
      }
    }

    if (approvedCount === 0) {
      throw new Error("No quotes could be approved.");
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: rfq.clientOrganizationId,
      action: "rfq.quotes_bulk_approved",
      entityType: "rfq",
      entityId: args.rfqId,
      summary: `Bulk approved ${approvedCount} quote(s) using recommended margins`,
      createdAt: now
    });

    return {
      approvedCount,
      thresholdHeldApprovedCount
    };
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
      .withIndex("by_supplier_updated_at", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .order("desc")
      .take(150);

    return await Promise.all(assignments.map((assignment) => buildSupplierAssignmentRow(ctx, assignment)));
  }
});

export const listSupplierAssignmentsPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:submit");

    const supplierOrganizationId = actor.organizationId as Id<"organizations">;
    const supplier = await ctx.db.get(supplierOrganizationId);
    if (!supplier || supplier.type !== "supplier") {
      throw new Error("Only supplier organizations can view RFQ assignments.");
    }

    const result = await ctx.db
      .query("supplierRfqAssignments")
      .withIndex("by_supplier_updated_at", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((assignment) => buildSupplierAssignmentRow(ctx, assignment)))
    };
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
    await refreshSupplierAnalyticsForActivity(ctx, assignment.supplierOrganizationId, now);

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
        const lineItems = await loadQuoteLineItems(ctx, quote._id);
        const supplierTotal = lineItems.reduce((sum, item) => sum + item.supplierTotalPrice, 0);
        const clientTotal = lineItems.reduce((sum, item) => sum + (item.clientFinalTotalPrice ?? 0), 0);
        const overrides = await ctx.db
          .query("marginOverrides")
          .withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
          .collect();
        overrides.sort((a, b) => b.createdAt - a.createdAt);
        const currentMarginPercent = overrides.length > 0 ? overrides[0].newMarginPercent : 0;
        const recommendation = await recommendMarginForQuote(ctx, quote, lineItems);
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
          recommendedMarginPercent: recommendation.recommendedMarginPercent,
          marginRuleName: recommendation.marginRuleName,
          marginRuleSource: recommendation.marginRuleSource,
          recommendedClientTotal: recommendation.recommendedClientTotal,
          thresholdHoldAmount: recommendation.thresholdHoldAmount,
          thresholdHoldRecommended: recommendation.thresholdHoldRecommended,
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
      .withIndex("by_supplier_updated_at", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .order("desc")
      .take(150);

    return await Promise.all(quotes.map((quote) => buildSupplierQuoteRow(ctx, quote)));
  }
});

export const listSupplierQuotesForActorPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "quote:submit");

    const supplierOrganizationId = actor.organizationId as Id<"organizations">;
    const supplier = await ctx.db.get(supplierOrganizationId);
    if (!supplier || supplier.type !== "supplier") {
      throw new Error("Only supplier organizations can list quotes.");
    }

    const result = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_supplier_updated_at", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((quote) => buildSupplierQuoteRow(ctx, quote)))
    };
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
    const releasedRfqs = await loadReleasedRfqsForClient(ctx, clientOrganizationId, CLIENT_RELEASED_RFQ_LIST_LIMIT);

    return await Promise.all(releasedRfqs.map((rfq) => buildReleasedRfqRowForClient(ctx, rfq)));
  }
});

export const listReleasedRfqsForClientPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const clientOrganizationId = actor.organizationId as Id<"organizations">;
    const result = await ctx.db
      .query("rfqs")
      .withIndex("by_client_updated_at", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    const releasedRfqs = result.page.filter((rfq) => CLIENT_RELEASED_RFQ_STATUSES.includes(rfq.status as (typeof CLIENT_RELEASED_RFQ_STATUSES)[number]));

    return {
      ...result,
      page: await Promise.all(releasedRfqs.map((rfq) => buildReleasedRfqRowForClient(ctx, rfq)))
    };
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

    const visibleQuotes = await loadClientVisibleQuotesForRfq(ctx, rfq._id);

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

async function ensureQuoteSelectable(ctx: ReadCtx, rfqId: Id<"rfqs">, quoteId: Id<"supplierQuotes">) {
  const quote = await ctx.db.get(quoteId);
  if (!quote || quote.rfqId !== rfqId) {
    throw new Error("Quote does not belong to this RFQ.");
  }
  if (quote.status !== "released") {
    throw new Error("Quote is no longer available for selection.");
  }
  const expiry = new Date(`${quote.validUntil}T23:59:59`).getTime();
  if (Number.isFinite(expiry) && expiry < Date.now()) {
    throw new Error("Quote validity has expired.");
  }
  return quote;
}

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

    await ensureQuoteSelectable(ctx, args.rfqId, args.quoteId);

    const now = Date.now();
    await ctx.db.patch(args.quoteId, {
      status: "selected",
      updatedAt: now
    });

    const otherQuotes = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq_status", (q) => q.eq("rfqId", args.rfqId).eq("status", "released"))
      .collect();
    for (const other of otherQuotes) {
      if (other._id !== args.quoteId) {
        await ctx.db.patch(other._id, {
          status: "lost",
          updatedAt: now
        });
      }
    }

    const rfqLineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    for (const item of rfqLineItems) {
      await ctx.db.patch(item._id, { awardedQuoteId: args.quoteId });
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

export const selectAwardsByLineItem = mutation({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs"),
    awards: v.array(
      v.object({
        rfqLineItemId: v.id("rfqLineItems"),
        quoteId: v.id("supplierQuotes")
      })
    )
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
      throw new Error("Only released RFQs can have awards selected.");
    }

    if (args.awards.length === 0) {
      throw new Error("At least one line item award is required.");
    }

    const lineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    if (args.awards.length !== lineItems.length) {
      throw new Error("Every RFQ line item must be awarded.");
    }

    const lineItemIds = new Set(lineItems.map((item) => item._id));
    const awardedLineIds = new Set<string>();
    for (const award of args.awards) {
      if (!lineItemIds.has(award.rfqLineItemId)) {
        throw new Error("Award references a line item outside this RFQ.");
      }
      if (awardedLineIds.has(award.rfqLineItemId)) {
        throw new Error("A line item cannot be awarded twice.");
      }
      awardedLineIds.add(award.rfqLineItemId);
    }

    const uniqueQuoteIds = Array.from(new Set(args.awards.map((award) => award.quoteId)));
    const quotesById = new Map<Id<"supplierQuotes">, Doc<"supplierQuotes">>();
    for (const quoteId of uniqueQuoteIds) {
      const quote = await ensureQuoteSelectable(ctx, args.rfqId, quoteId);
      quotesById.set(quoteId, quote);
    }

    const quoteLinesByQuote = new Map<Id<"supplierQuotes">, Set<Id<"rfqLineItems">>>();
    for (const quoteId of uniqueQuoteIds) {
      const quoteLines = await ctx.db
        .query("supplierQuoteLineItems")
        .withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
        .collect();
      quoteLinesByQuote.set(quoteId, new Set(quoteLines.map((line) => line.rfqLineItemId)));
    }

    for (const award of args.awards) {
      const covered = quoteLinesByQuote.get(award.quoteId);
      if (!covered || !covered.has(award.rfqLineItemId)) {
        throw new Error("Selected quote does not price this line item.");
      }
    }

    const now = Date.now();
    for (const award of args.awards) {
      await ctx.db.patch(award.rfqLineItemId, { awardedQuoteId: award.quoteId });
    }

    const allReleased = await ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq_status", (q) => q.eq("rfqId", args.rfqId).eq("status", "released"))
      .collect();
    for (const quote of allReleased) {
      if (uniqueQuoteIds.includes(quote._id)) {
        await ctx.db.patch(quote._id, { status: "selected", updatedAt: now });
      } else {
        await ctx.db.patch(quote._id, { status: "lost", updatedAt: now });
      }
    }

    await ctx.db.patch(args.rfqId, {
      status: "selected",
      updatedAt: now
    });

    const isSplit = uniqueQuoteIds.length > 1;
    const summary = isSplit
      ? `Client split award across ${uniqueQuoteIds.length} suppliers — RFQ locked`
      : "Client selected quote — RFQ locked";

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: rfq.clientOrganizationId,
      action: isSplit ? "quote.split_awarded" : "quote.selected",
      entityType: "rfq",
      entityId: args.rfqId,
      summary,
      createdAt: now
    });

    const adminOrgs = await ctx.db.query("organizations").withIndex("by_type", (q) => q.eq("type", "admin")).collect();
    for (const adminOrg of adminOrgs) {
      await notifyOrganization(ctx, adminOrg._id, {
        type: isSplit ? "quote.split_awarded" : "quote.selected",
        titleAr: isSplit ? "تم توزيع الجائزة" : "تم اختيار عرض",
        titleEn: isSplit ? "Award split across suppliers" : "Quote selected",
        bodyAr: isSplit
          ? `وزّع العميل الجائزة على ${uniqueQuoteIds.length} موردين للطلب ${args.rfqId.slice(-6).toUpperCase()}.`
          : `قام العميل باختيار عرض للطلب ${args.rfqId.slice(-6).toUpperCase()}.`,
        bodyEn: isSplit
          ? `Client split award across ${uniqueQuoteIds.length} suppliers for RFQ ${args.rfqId.slice(-6).toUpperCase()}.`
          : `Client selected a quote for RFQ ${args.rfqId.slice(-6).toUpperCase()}.`
      });
    }

    return { awardedQuoteIds: uniqueQuoteIds, isSplit };
  }
});

export const listQuotesForAdminReview = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("supplierQuotes")
      .withIndex("by_status_updated_at", (q) => q.eq("status", "submitted"))
      .order("desc")
      .take(500);
  }
});
