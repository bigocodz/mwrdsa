import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createApprovalInstance = mutation({
  args: {
    purchaseOrderId: v.id("purchaseOrders")
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("approvalInstances", {
      purchaseOrderId: args.purchaseOrderId,
      status: "pending",
      createdAt: now,
      updatedAt: now
    });
  }
});

export const listApprovalsByPurchaseOrder = query({
  args: {
    purchaseOrderId: v.id("purchaseOrders")
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("approvalInstances")
      .withIndex("by_po", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();
  }
});
