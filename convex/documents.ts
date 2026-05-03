import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  generateDeliveryNoteNumber,
  generateGoodsReceiptNumber,
  generateInvoiceNumber
} from "./numbers";
import { notifyOrganization } from "./notifications";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";

const VAT_RATE = 0.15;
const VARIANCE_TOLERANCE_PCT = 2;

type ReadCtx = QueryCtx | MutationCtx;

async function loadCpoFromSpo(ctx: ReadCtx, spo: Doc<"purchaseOrders">) {
  if (spo.linkedPurchaseOrderId) {
    const linked = await ctx.db.get(spo.linkedPurchaseOrderId);
    if (linked && linked.type === "cpo") return linked;
  }
  if (spo.transactionRef) {
    const candidates = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_transaction_ref", (q) => q.eq("transactionRef", spo.transactionRef))
      .collect();
    return candidates.find((row) => row.type === "cpo") ?? null;
  }
  return null;
}

async function loadAwardedQuoteLines(ctx: ReadCtx, cpo: Doc<"purchaseOrders">) {
  const quoteLines = await ctx.db
    .query("supplierQuoteLineItems")
    .withIndex("by_quote", (q) => q.eq("quoteId", cpo.selectedQuoteId))
    .collect();
  const scope = cpo.awardedRfqLineItemIds && cpo.awardedRfqLineItemIds.length > 0
    ? new Set<Id<"rfqLineItems">>(cpo.awardedRfqLineItemIds)
    : null;
  return scope ? quoteLines.filter((item) => scope.has(item.rfqLineItemId)) : quoteLines;
}

async function computePoTotal(ctx: ReadCtx, cpo: Doc<"purchaseOrders">) {
  const lines = await loadAwardedQuoteLines(ctx, cpo);
  return lines.reduce((sum, item) => sum + (item.clientFinalTotalPrice ?? 0), 0);
}

async function computeGrnTotal(ctx: ReadCtx, grnId: Id<"goodsReceiptNotes">, cpo: Doc<"purchaseOrders">) {
  const grnItems = await ctx.db
    .query("goodsReceiptNoteItems")
    .withIndex("by_grn", (q) => q.eq("grnId", grnId))
    .collect();
  const quoteLines = await loadAwardedQuoteLines(ctx, cpo);
  const unitPriceByLine = new Map<Id<"rfqLineItems">, number>(
    quoteLines.map((line) => [line.rfqLineItemId, line.clientFinalUnitPrice ?? 0])
  );
  let total = 0;
  for (const item of grnItems) {
    const unit = unitPriceByLine.get(item.rfqLineItemId) ?? 0;
    total += unit * item.qtyReceived;
  }
  return total;
}

function variancePct(reference: number, candidate: number) {
  if (reference === 0) return candidate === 0 ? 0 : 100;
  return Math.abs((candidate - reference) / reference) * 100;
}

export async function runThreeWayMatch(
  ctx: ReadCtx,
  cpoId: Id<"purchaseOrders">,
  grnId: Id<"goodsReceiptNotes">,
  invoiceTotalSar: number
) {
  const cpo = await ctx.db.get(cpoId);
  if (!cpo) {
    throw new Error("CPO not found.");
  }
  const grn = await ctx.db.get(grnId);
  if (!grn) {
    throw new Error("GRN not found.");
  }
  if (grn.cpoId !== cpoId) {
    throw new Error("GRN does not belong to this CPO.");
  }
  const poTotal = await computePoTotal(ctx, cpo);
  const grnTotal = await computeGrnTotal(ctx, grnId, cpo);
  const grnVariance = variancePct(poTotal, grnTotal);
  const invoiceVariance = variancePct(grnTotal, invoiceTotalSar);
  const worst = Math.max(grnVariance, invoiceVariance);
  const withinTolerance = worst <= VARIANCE_TOLERANCE_PCT;
  const holdReason = withinTolerance
    ? undefined
    : `PO ${poTotal.toFixed(2)} / GRN ${grnTotal.toFixed(2)} / INV ${invoiceTotalSar.toFixed(2)} — worst variance ${worst.toFixed(2)}%`;
  return { poTotal, grnTotal, invoiceTotal: invoiceTotalSar, variancePct: worst, withinTolerance, holdReason };
}

export const createDeliveryNote = mutation({
  args: {
    actorUserId: v.id("users"),
    spoId: v.id("purchaseOrders"),
    courier: v.string(),
    trackingNumber: v.string(),
    dispatchDate: v.string(),
    expectedDeliveryDate: v.string(),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        rfqLineItemId: v.id("rfqLineItems"),
        qtyDispatched: v.number(),
        notes: v.optional(v.string())
      })
    )
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "order:update_status");

    const spo = await ctx.db.get(args.spoId);
    if (!spo) throw new Error("SPO not found.");
    if (spo.type !== "spo") throw new Error("Pass the SPO id.");
    const quote = await ctx.db.get(spo.selectedQuoteId);
    if (!quote) throw new Error("Underlying quote not found.");
    assertSameOrganization(actor, quote.supplierOrganizationId);
    if (spo.status !== "sentToSupplier") {
      throw new Error("DN can only be created for an SPO that has been dispatched.");
    }
    if (args.items.length === 0) {
      throw new Error("Add at least one line item to the delivery note.");
    }

    const cpo = await loadCpoFromSpo(ctx, spo);
    if (!cpo) throw new Error("Linked CPO not found.");

    const now = Date.now();
    const dnId = await ctx.db.insert("deliveryNotes", {
      spoId: spo._id,
      cpoId: cpo._id,
      transactionRef: spo.transactionRef,
      dnNumber: generateDeliveryNoteNumber(now),
      courier: args.courier.trim(),
      trackingNumber: args.trackingNumber.trim(),
      dispatchDate: args.dispatchDate,
      expectedDeliveryDate: args.expectedDeliveryDate,
      notes: args.notes?.trim() ? args.notes.trim() : undefined,
      createdByUserId: args.actorUserId,
      createdAt: now,
      updatedAt: now
    });

    for (const item of args.items) {
      if (item.qtyDispatched <= 0) {
        throw new Error("DN line item quantity must be greater than zero.");
      }
      await ctx.db.insert("deliveryNoteItems", {
        deliveryNoteId: dnId,
        rfqLineItemId: item.rfqLineItemId,
        qtyDispatched: item.qtyDispatched,
        notes: item.notes?.trim() ? item.notes.trim() : undefined,
        createdAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: quote.supplierOrganizationId,
      action: "dn.created",
      entityType: "deliveryNote",
      entityId: dnId,
      summary: `Delivery note created for SPO ${spo._id.slice(-6).toUpperCase()}`,
      createdAt: now
    });

    await notifyOrganization(ctx, cpo.clientOrganizationId, {
      type: "dn.created",
      titleAr: "تم إصدار إشعار التسليم",
      titleEn: "Delivery note issued",
      bodyAr: "صدر إشعار تسليم لطلبك.",
      bodyEn: "A delivery note has been issued for your order."
    });

    return dnId;
  }
});

export const confirmGoodsReceipt = mutation({
  args: {
    actorUserId: v.id("users"),
    deliveryNoteId: v.id("deliveryNotes"),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        rfqLineItemId: v.id("rfqLineItems"),
        qtyReceived: v.number(),
        condition: v.union(v.literal("ok"), v.literal("damaged"), v.literal("short")),
        notes: v.optional(v.string())
      })
    )
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "delivery:confirm");

    const dn = await ctx.db.get(args.deliveryNoteId);
    if (!dn) throw new Error("Delivery note not found.");
    const cpo = await ctx.db.get(dn.cpoId);
    if (!cpo) throw new Error("CPO not found.");
    assertSameOrganization(actor, cpo.clientOrganizationId);
    if (args.items.length === 0) {
      throw new Error("Confirm at least one line item.");
    }

    const existing = await ctx.db
      .query("goodsReceiptNotes")
      .withIndex("by_delivery_note", (q) => q.eq("deliveryNoteId", dn._id))
      .first();
    if (existing) {
      throw new Error("This delivery note has already been receipted.");
    }

    const now = Date.now();
    const grnId = await ctx.db.insert("goodsReceiptNotes", {
      cpoId: cpo._id,
      deliveryNoteId: dn._id,
      transactionRef: cpo.transactionRef,
      grnNumber: generateGoodsReceiptNumber(now),
      receivedByUserId: args.actorUserId,
      receivedAt: now,
      notes: args.notes?.trim() ? args.notes.trim() : undefined,
      createdAt: now,
      updatedAt: now
    });

    for (const item of args.items) {
      if (item.qtyReceived < 0) {
        throw new Error("GRN line item quantity cannot be negative.");
      }
      await ctx.db.insert("goodsReceiptNoteItems", {
        grnId,
        rfqLineItemId: item.rfqLineItemId,
        qtyReceived: item.qtyReceived,
        condition: item.condition,
        notes: item.notes?.trim() ? item.notes.trim() : undefined,
        createdAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: cpo.clientOrganizationId,
      action: "grn.confirmed",
      entityType: "goodsReceiptNote",
      entityId: grnId,
      summary: `Goods receipt confirmed for CPO ${cpo._id.slice(-6).toUpperCase()}`,
      createdAt: now
    });

    return grnId;
  }
});

export const issueInvoice = mutation({
  args: {
    actorUserId: v.id("users"),
    cpoId: v.id("purchaseOrders"),
    grnId: v.id("goodsReceiptNotes"),
    subtotalSar: v.number(),
    dueDate: v.optional(v.string()),
    invoiceNumber: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "po:approve");

    const cpo = await ctx.db.get(args.cpoId);
    if (!cpo) throw new Error("CPO not found.");
    if (cpo.type !== "cpo" && cpo.type !== undefined) {
      throw new Error("Invoice must reference the CPO, not the SPO.");
    }
    const grn = await ctx.db.get(args.grnId);
    if (!grn) throw new Error("GRN not found.");
    if (grn.cpoId !== args.cpoId) {
      throw new Error("GRN does not belong to this CPO.");
    }
    if (args.subtotalSar <= 0) {
      throw new Error("Invoice subtotal must be greater than zero.");
    }

    const duplicate = await ctx.db
      .query("invoices")
      .withIndex("by_grn", (q) => q.eq("grnId", args.grnId))
      .first();
    if (duplicate) {
      throw new Error("An invoice has already been issued for this GRN.");
    }

    const subtotal = Math.round(args.subtotalSar * 100) / 100;
    const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
    const total = Math.round((subtotal + vat) * 100) / 100;
    const variance = await runThreeWayMatch(ctx, args.cpoId, args.grnId, total);
    const now = Date.now();
    const status: "issued" | "onHold" = variance.withinTolerance ? "issued" : "onHold";
    const issueDate = new Date(now).toISOString().slice(0, 10);

    const invoiceId = await ctx.db.insert("invoices", {
      cpoId: args.cpoId,
      grnId: args.grnId,
      transactionRef: cpo.transactionRef,
      invoiceNumber: args.invoiceNumber?.trim() || generateInvoiceNumber(now),
      subtotalSar: subtotal,
      vatAmountSar: vat,
      totalSar: total,
      status,
      holdReason: variance.holdReason,
      issueDate: status === "issued" ? issueDate : undefined,
      dueDate: args.dueDate,
      createdByUserId: args.actorUserId,
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("invoiceVarianceSummaries", {
      invoiceId,
      cpoId: args.cpoId,
      grnId: args.grnId,
      poTotalSar: variance.poTotal,
      grnTotalSar: variance.grnTotal,
      invoiceTotalSar: variance.invoiceTotal,
      variancePct: variance.variancePct,
      withinTolerance: variance.withinTolerance,
      holdReason: variance.holdReason,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: cpo.clientOrganizationId,
      action: status === "issued" ? "invoice.issued" : "invoice.held",
      entityType: "invoice",
      entityId: invoiceId,
      summary: status === "issued"
        ? `Invoice ${total.toFixed(2)} SAR issued (within ${VARIANCE_TOLERANCE_PCT}% tolerance).`
        : `Invoice held for three-way-match review: ${variance.holdReason}`,
      createdAt: now
    });

    return { invoiceId, status, variance };
  }
});

export const decideInvoiceVariance = mutation({
  args: {
    actorUserId: v.id("users"),
    invoiceId: v.id("invoices"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    note: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "po:approve");

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "onHold") {
      throw new Error("Only on-hold invoices can be decided.");
    }
    const trimmedNote = args.note?.trim();
    if (args.decision === "rejected" && !trimmedNote) {
      throw new Error("A note is required when rejecting an invoice.");
    }

    const summary = await ctx.db
      .query("invoiceVarianceSummaries")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .first();

    const now = Date.now();
    const issueDate = new Date(now).toISOString().slice(0, 10);
    const nextStatus: "issued" | "cancelled" = args.decision === "approved" ? "issued" : "cancelled";
    await ctx.db.patch(args.invoiceId, {
      status: nextStatus,
      issueDate: nextStatus === "issued" ? issueDate : invoice.issueDate,
      holdReason: undefined,
      updatedAt: now
    });

    if (summary) {
      await ctx.db.patch(summary._id, {
        decidedByUserId: args.actorUserId,
        decidedAt: now,
        decisionNote: trimmedNote,
        withinTolerance: args.decision === "approved",
        updatedAt: now
      });
    }

    const cpo = await ctx.db.get(invoice.cpoId);
    if (cpo) {
      await ctx.db.insert("auditLogs", {
        actorUserId: args.actorUserId,
        organizationId: cpo.clientOrganizationId,
        action: args.decision === "approved" ? "invoice.variance_approved" : "invoice.variance_rejected",
        entityType: "invoice",
        entityId: args.invoiceId,
        summary: args.decision === "approved"
          ? `Variance approved with override: ${trimmedNote ?? "no note"}`
          : `Variance rejected: ${trimmedNote}`,
        createdAt: now
      });
    }

    return { status: nextStatus };
  }
});

export const recordInvoicePayment = mutation({
  args: {
    actorUserId: v.id("users"),
    invoiceId: v.id("invoices"),
    paymentIntentId: v.string()
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "po:approve");

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "issued" && invoice.status !== "overdue") {
      throw new Error("Only issued or overdue invoices can be marked paid.");
    }

    const now = Date.now();
    await ctx.db.patch(args.invoiceId, {
      status: "paid",
      paymentIntentId: args.paymentIntentId,
      updatedAt: now
    });

    const cpo = await ctx.db.get(invoice.cpoId);
    if (cpo) {
      await ctx.db.insert("auditLogs", {
        actorUserId: args.actorUserId,
        organizationId: cpo.clientOrganizationId,
        action: "invoice.paid",
        entityType: "invoice",
        entityId: args.invoiceId,
        summary: `Invoice ${invoice.invoiceNumber} marked paid via ${args.paymentIntentId}`,
        createdAt: now
      });
    }

    return { status: "paid" as const };
  }
});

export const listInvoicesOnHold = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "po:approve");

    const onHold = await ctx.db
      .query("invoices")
      .withIndex("by_status_updated_at", (q) => q.eq("status", "onHold"))
      .order("desc")
      .take(100);

    return await Promise.all(
      onHold.map(async (invoice) => {
        const summary = await ctx.db
          .query("invoiceVarianceSummaries")
          .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
          .first();
        const cpo = await ctx.db.get(invoice.cpoId);
        const client = cpo ? await ctx.db.get(cpo.clientOrganizationId) : null;
        return {
          _id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          totalSar: invoice.totalSar,
          subtotalSar: invoice.subtotalSar,
          vatAmountSar: invoice.vatAmountSar,
          createdAt: invoice.createdAt,
          updatedAt: invoice.updatedAt,
          holdReason: invoice.holdReason ?? null,
          transactionRef: invoice.transactionRef ?? null,
          poTotalSar: summary?.poTotalSar ?? 0,
          grnTotalSar: summary?.grnTotalSar ?? 0,
          variancePct: summary?.variancePct ?? 0,
          clientAnonymousId: client?.clientAnonymousId ?? "—"
        };
      })
    );
  }
});
