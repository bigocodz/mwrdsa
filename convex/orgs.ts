import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertActiveUser, assertHasPermission } from "./rbac";

const anonymousPrefixes = {
  client: "CLT",
  supplier: "SUP"
} as const;

const ADMIN_ORGANIZATION_LIST_LIMIT = 500;

function createAnonymousId(prefix: "CLT" | "SUP") {
  const value = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `${prefix}-${value}`;
}

export const createOrganization = mutation({
  args: {
    actorUserId: v.id("users"),
    type: v.union(v.literal("client"), v.literal("supplier"), v.literal("admin")),
    name: v.string(),
    defaultLanguage: v.union(v.literal("ar"), v.literal("en"))
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "organization:create");

    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      type: args.type,
      name: args.name,
      clientAnonymousId: args.type === "client" ? createAnonymousId(anonymousPrefixes.client) : undefined,
      supplierAnonymousId: args.type === "supplier" ? createAnonymousId(anonymousPrefixes.supplier) : undefined,
      status: "active",
      defaultLanguage: args.defaultLanguage,
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      action: "organization.created",
      entityType: "organization",
      entityId: organizationId,
      summary: `Created ${args.type} organization`,
      createdAt: now
    });

    return organizationId;
  }
});

export const listOrganizationsForAdmin = query({
  args: {
    actorUserId: v.id("users"),
    type: v.optional(v.union(v.literal("client"), v.literal("supplier"), v.literal("admin")))
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "organization:update");

    const organizationType = args.type;
    if (organizationType) {
      return await ctx.db
        .query("organizations")
        .withIndex("by_type", (q) => q.eq("type", organizationType))
        .order("desc")
        .take(ADMIN_ORGANIZATION_LIST_LIMIT);
    }

    return await ctx.db.query("organizations").order("desc").take(ADMIN_ORGANIZATION_LIST_LIMIT);
  }
});
