import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("processing"),
      v.literal("shipped"),
      v.literal("delivered"),
      v.literal("receiptConfirmed"),
      v.literal("completed"),
      v.literal("disputed"),
      v.literal("delayed")
    ),
    notes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      status: args.status,
      updatedAt: now
    });
    await ctx.db.insert("orderStatusEvents", {
      orderId: args.orderId,
      status: args.status,
      actorUserId: args.actorUserId,
      notes: args.notes,
      createdAt: now
    });
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
