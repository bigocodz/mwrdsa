import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const userRole = v.union(
  v.literal("superAdmin"),
  v.literal("operationsManager"),
  v.literal("pricingAnalyst"),
  v.literal("accountManager"),
  v.literal("catalogManager"),
  v.literal("reportingAnalyst"),
  v.literal("orgAdmin"),
  v.literal("procurementManager"),
  v.literal("procurementOfficer"),
  v.literal("requester"),
  v.literal("financeApprover"),
  v.literal("departmentHead"),
  v.literal("supplierAdmin"),
  v.literal("quotationOfficer"),
  v.literal("operationsOfficer"),
  v.literal("viewer")
);

export const inviteUser = mutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    name: v.string(),
    roles: v.array(userRole),
    language: v.union(v.literal("ar"), v.literal("en"))
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      ...args,
      status: "invited",
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      organizationId: args.organizationId,
      action: "user.invited",
      entityType: "user",
      entityId: userId,
      summary: "User invited",
      createdAt: now
    });

    return userId;
  }
});

export const listUsersByOrganization = query({
  args: {
    organizationId: v.id("organizations")
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  }
});
