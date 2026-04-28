import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const recordAuditEvent = internalMutation({
  args: {
    actorUserId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    summary: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLogs", {
      ...args,
      createdAt: Date.now()
    });
  }
});

export const listRecentAuditEvents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("auditLogs").order("desc").take(50);
  }
});
