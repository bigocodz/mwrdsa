import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const rfqLineItemInput = v.object({
  productId: v.optional(v.id("products")),
  descriptionAr: v.optional(v.string()),
  descriptionEn: v.optional(v.string()),
  quantity: v.number(),
  unit: v.string()
});

export const createRfq = mutation({
  args: {
    clientOrganizationId: v.id("organizations"),
    createdByUserId: v.id("users"),
    requiredDeliveryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    isNonCatalog: v.boolean(),
    lineItems: v.array(rfqLineItemInput)
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rfqId = await ctx.db.insert("rfqs", {
      clientOrganizationId: args.clientOrganizationId,
      createdByUserId: args.createdByUserId,
      status: "draft",
      requiredDeliveryDate: args.requiredDeliveryDate,
      notes: args.notes,
      isNonCatalog: args.isNonCatalog,
      createdAt: now,
      updatedAt: now
    });

    for (const item of args.lineItems) {
      await ctx.db.insert("rfqLineItems", {
        rfqId,
        ...item,
        createdAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.createdByUserId,
      organizationId: args.clientOrganizationId,
      action: "rfq.created",
      entityType: "rfq",
      entityId: rfqId,
      summary: "RFQ saved as draft",
      createdAt: now
    });

    return rfqId;
  }
});

export const submitRfq = mutation({
  args: {
    rfqId: v.id("rfqs"),
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.rfqId, {
      status: "submitted",
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      action: "rfq.submitted",
      entityType: "rfq",
      entityId: args.rfqId,
      summary: "RFQ submitted for admin triage",
      createdAt: now
    });
  }
});

export const listRfqsByClient = query({
  args: {
    clientOrganizationId: v.id("organizations")
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rfqs")
      .withIndex("by_client", (q) => q.eq("clientOrganizationId", args.clientOrganizationId))
      .order("desc")
      .collect();
  }
});
