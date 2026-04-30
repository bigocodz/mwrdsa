import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { assertActiveUser, assertHasPermission } from "./rbac";

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

export const listAuditEventsForActor = query({
  args: {
    actorUserId: v.id("users"),
    search: v.optional(v.string()),
    entityType: v.optional(v.string()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "audit:view");

    const limit = Math.min(args.limit ?? 200, 500);
    const events = await ctx.db.query("auditLogs").order("desc").take(limit);
    const search = args.search?.trim().toLowerCase();
    const entityType = args.entityType?.trim();

    return events
      .filter((entry) => (entityType ? entry.entityType === entityType : true))
      .filter((entry) =>
        search
          ? [entry.action, entry.entityType, entry.entityId, entry.summary].some((value) => value.toLowerCase().includes(search))
          : true
      )
      .map((entry) => ({
        _id: entry._id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: entry.summary,
        createdAt: entry.createdAt,
        actorUserId: entry.actorUserId,
        organizationId: entry.organizationId
      }));
  }
});

export const listRecentAuditEvents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("auditLogs").order("desc").take(50);
  }
});
