import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { notifyOrganization } from "./notifications";
import { assertActiveUser, assertHasAnyPermission, assertHasPermission, assertSameOrganization } from "./rbac";

const orderStatus = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("processing"),
  v.literal("shipped"),
  v.literal("delivered"),
  v.literal("receiptConfirmed"),
  v.literal("completed"),
  v.literal("disputed"),
  v.literal("delayed")
);

const supplierAllowedTransitions: Record<string, readonly string[]> = {
  pending: ["confirmed", "delayed", "disputed"],
  confirmed: ["processing", "delayed", "disputed"],
  processing: ["shipped", "delayed", "disputed"],
  shipped: ["delivered", "delayed", "disputed"],
  delivered: ["disputed", "delayed"],
  receiptConfirmed: [],
  completed: [],
  disputed: ["confirmed", "processing", "shipped"],
  delayed: ["confirmed", "processing", "shipped", "delivered"]
};

async function loadOrderTotals(ctx: QueryCtx, purchaseOrderId: Id<"purchaseOrders">) {
  const purchaseOrder = await ctx.db.get(purchaseOrderId);
  if (!purchaseOrder) {
    return { clientTotal: 0, lineItemCount: 0 };
  }
  const lineItems = await ctx.db
    .query("supplierQuoteLineItems")
    .withIndex("by_quote", (q) => q.eq("quoteId", purchaseOrder.selectedQuoteId))
    .collect();
  const clientTotal = lineItems.reduce((sum, item) => sum + (item.clientFinalTotalPrice ?? 0), 0);
  return { clientTotal, lineItemCount: lineItems.length };
}

async function loadOrderLineItems(ctx: QueryCtx, purchaseOrderId: Id<"purchaseOrders">) {
  const purchaseOrder = await ctx.db.get(purchaseOrderId);
  if (!purchaseOrder) {
    return [] as Array<{
      _id: Id<"supplierQuoteLineItems">;
      quantity: number;
      unit: string;
      descriptionAr?: string;
      descriptionEn?: string;
      clientFinalUnitPrice: number;
      clientFinalTotalPrice: number;
      product: { _id: Id<"products">; sku: string; nameAr: string; nameEn: string } | null;
    }>;
  }
  const quoteLineItems = await ctx.db
    .query("supplierQuoteLineItems")
    .withIndex("by_quote", (q) => q.eq("quoteId", purchaseOrder.selectedQuoteId))
    .collect();
  return await Promise.all(
    quoteLineItems.map(async (item) => {
      const rfqLineItem = await ctx.db.get(item.rfqLineItemId);
      const product = rfqLineItem?.productId ? await ctx.db.get(rfqLineItem.productId) : null;
      return {
        _id: item._id,
        quantity: rfqLineItem?.quantity ?? 0,
        unit: rfqLineItem?.unit ?? "unit",
        descriptionAr: rfqLineItem?.descriptionAr,
        descriptionEn: rfqLineItem?.descriptionEn,
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
}

export const createOrderFromApprovedPo = mutation({
  args: {
    purchaseOrderId: v.id("purchaseOrders"),
    clientOrganizationId: v.id("organizations"),
    supplierOrganizationId: v.id("organizations")
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("orders", {
      purchaseOrderId: args.purchaseOrderId,
      clientOrganizationId: args.clientOrganizationId,
      supplierOrganizationId: args.supplierOrganizationId,
      status: "pending",
      createdAt: now,
      updatedAt: now
    });
  }
});

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    actorUserId: v.id("users"),
    status: orderStatus,
    notes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found.");
    }

    if (args.status === "receiptConfirmed" || args.status === "completed") {
      assertHasPermission(actor, "delivery:confirm");
      assertSameOrganization(actor, order.clientOrganizationId);
    } else {
      assertHasAnyPermission(actor, ["order:update_status"]);
      assertSameOrganization(actor, order.supplierOrganizationId);
    }

    const allowed = supplierAllowedTransitions[order.status] ?? [];
    if (args.status !== order.status && !allowed.includes(args.status) && !(args.status === "receiptConfirmed" && order.status === "delivered") && !(args.status === "completed" && order.status === "receiptConfirmed")) {
      throw new Error(`Transition from ${order.status} to ${args.status} is not allowed.`);
    }

    const trimmedNotes = args.notes?.trim();
    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      status: args.status,
      updatedAt: now
    });
    await ctx.db.insert("orderStatusEvents", {
      orderId: args.orderId,
      status: args.status,
      actorUserId: args.actorUserId,
      notes: trimmedNotes,
      createdAt: now
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId:
        args.status === "receiptConfirmed" || args.status === "completed"
          ? order.clientOrganizationId
          : order.supplierOrganizationId,
      action: `order.status.${args.status}`,
      entityType: "order",
      entityId: args.orderId,
      summary: `Order moved to ${args.status}${trimmedNotes ? `: ${trimmedNotes}` : ""}`,
      createdAt: now
    });

    if (args.status === "receiptConfirmed") {
      await notifyOrganization(ctx, order.supplierOrganizationId, {
        type: "order.receipt_confirmed",
        titleAr: "تم تأكيد الاستلام",
        titleEn: "Client confirmed receipt",
        bodyAr: "أكد العميل استلام الطلب.",
        bodyEn: "Client confirmed delivery on the order."
      });
    } else {
      await notifyOrganization(ctx, order.clientOrganizationId, {
        type: `order.status.${args.status}`,
        titleAr: "تحديث حالة الطلب",
        titleEn: "Order status updated",
        bodyAr: `أصبحت حالة الطلب ${args.status}${trimmedNotes ? ` — ${trimmedNotes}` : ""}.`,
        bodyEn: `Order is now ${args.status}${trimmedNotes ? ` — ${trimmedNotes}` : ""}.`
      });
    }
  }
});

export const listOrdersForSupplierActor = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasAnyPermission(actor, ["order:update_status", "quote:submit"]);

    const supplierOrganizationId = actor.organizationId as Id<"organizations">;
    const supplier = await ctx.db.get(supplierOrganizationId);
    if (!supplier || supplier.type !== "supplier") {
      throw new Error("Only supplier organizations can list supplier orders.");
    }

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_supplier", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .collect();
    orders.sort((a, b) => b.updatedAt - a.updatedAt);

    return await Promise.all(
      orders.map(async (order) => {
        const totals = await loadOrderTotals(ctx, order.purchaseOrderId);
        const purchaseOrder = await ctx.db.get(order.purchaseOrderId);
        const clientOrg = await ctx.db.get(order.clientOrganizationId);
        return {
          _id: order._id,
          status: order.status,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          purchaseOrderId: order.purchaseOrderId,
          rfqId: purchaseOrder?.rfqId ?? null,
          clientAnonymousId: clientOrg?.clientAnonymousId ?? "—",
          clientTotal: totals.clientTotal,
          lineItemCount: totals.lineItemCount
        };
      })
    );
  }
});

export const getOrderDetailForActor = query({
  args: {
    actorUserId: v.id("users"),
    orderId: v.id("orders")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasAnyPermission(actor, ["order:update_status", "quote:submit", "delivery:confirm", "rfq:create"]);

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      return null;
    }

    const isSupplierActor = actor.organizationId === order.supplierOrganizationId;
    const isClientActor = actor.organizationId === order.clientOrganizationId;
    if (!isSupplierActor && !isClientActor && !actor.roles.includes("superAdmin")) {
      throw new Error("Cross-organization access is not allowed.");
    }

    const lineItems = await loadOrderLineItems(ctx, order.purchaseOrderId);
    const purchaseOrder = await ctx.db.get(order.purchaseOrderId);
    const events = await ctx.db
      .query("orderStatusEvents")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    events.sort((a, b) => b.createdAt - a.createdAt);

    const clientOrg = await ctx.db.get(order.clientOrganizationId);
    const supplierOrg = await ctx.db.get(order.supplierOrganizationId);

    return {
      _id: order._id,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      purchaseOrderId: order.purchaseOrderId,
      rfqId: purchaseOrder?.rfqId ?? null,
      clientAnonymousId: clientOrg?.clientAnonymousId ?? "—",
      supplierAnonymousId: supplierOrg?.supplierAnonymousId ?? "—",
      lineItems,
      events: events.map((event) => ({
        _id: event._id,
        status: event.status,
        notes: event.notes,
        createdAt: event.createdAt
      })),
      allowedTransitions: supplierAllowedTransitions[order.status] ?? [],
      perspective: isClientActor ? ("client" as const) : isSupplierActor ? ("supplier" as const) : ("admin" as const)
    };
  }
});

export const listOrdersForClientActor = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const clientOrganizationId = actor.organizationId as Id<"organizations">;
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_client", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .collect();
    orders.sort((a, b) => b.updatedAt - a.updatedAt);

    return await Promise.all(
      orders.map(async (order) => {
        const totals = await loadOrderTotals(ctx, order.purchaseOrderId);
        const supplier = await ctx.db.get(order.supplierOrganizationId);
        return {
          _id: order._id,
          status: order.status,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          purchaseOrderId: order.purchaseOrderId,
          supplierAnonymousId: supplier?.supplierAnonymousId ?? "—",
          clientTotal: totals.clientTotal,
          lineItemCount: totals.lineItemCount
        };
      })
    );
  }
});

export const openDispute = mutation({
  args: {
    actorUserId: v.id("users"),
    orderId: v.id("orders"),
    subject: v.string(),
    description: v.string()
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasAnyPermission(actor, ["delivery:confirm", "order:update_status"]);

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found.");
    }
    if (actor.organizationId !== order.clientOrganizationId && actor.organizationId !== order.supplierOrganizationId) {
      throw new Error("Cross-organization access is not allowed.");
    }

    const subject = args.subject.trim();
    const description = args.description.trim();
    if (!subject) {
      throw new Error("Dispute subject is required.");
    }
    if (!description) {
      throw new Error("Dispute description is required.");
    }

    const now = Date.now();
    const disputeId = await ctx.db.insert("disputes", {
      orderId: args.orderId,
      openedByUserId: args.actorUserId,
      organizationId: actor.organizationId as Id<"organizations">,
      subject,
      description,
      status: "open",
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.patch(args.orderId, {
      status: "disputed",
      updatedAt: now
    });
    await ctx.db.insert("orderStatusEvents", {
      orderId: args.orderId,
      status: "disputed",
      actorUserId: args.actorUserId,
      notes: subject,
      createdAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: actor.organizationId as Id<"organizations">,
      action: "order.dispute.opened",
      entityType: "order",
      entityId: args.orderId,
      summary: `Dispute opened: ${subject}`,
      createdAt: now
    });

    const adminOrgs = await ctx.db.query("organizations").withIndex("by_type", (q) => q.eq("type", "admin")).collect();
    for (const adminOrg of adminOrgs) {
      await notifyOrganization(ctx, adminOrg._id, {
        type: "order.dispute.opened",
        titleAr: "نزاع جديد",
        titleEn: "New dispute opened",
        bodyAr: `تم فتح نزاع: ${subject}.`,
        bodyEn: `Dispute opened: ${subject}.`
      });
    }

    return disputeId;
  }
});

export const listDisputesForOrder = query({
  args: {
    actorUserId: v.id("users"),
    orderId: v.id("orders")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasAnyPermission(actor, ["delivery:confirm", "order:update_status", "rfq:create"]);

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      return [];
    }
    if (
      actor.organizationId !== order.clientOrganizationId &&
      actor.organizationId !== order.supplierOrganizationId &&
      !actor.roles.includes("superAdmin")
    ) {
      throw new Error("Cross-organization access is not allowed.");
    }

    const disputes = await ctx.db
      .query("disputes")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    disputes.sort((a, b) => b.createdAt - a.createdAt);
    return disputes.map((dispute) => ({
      _id: dispute._id,
      subject: dispute.subject,
      description: dispute.description,
      status: dispute.status,
      createdAt: dispute.createdAt,
      updatedAt: dispute.updatedAt
    }));
  }
});

export const listOrdersBySupplier = query({
  args: {
    supplierOrganizationId: v.id("organizations")
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_supplier", (q) => q.eq("supplierOrganizationId", args.supplierOrganizationId))
      .collect();
  }
});
