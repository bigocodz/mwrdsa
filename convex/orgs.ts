import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const anonymousPrefixes = {
  client: "CLT",
  supplier: "SUP"
} as const;

function createAnonymousId(prefix: "CLT" | "SUP") {
  const value = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `${prefix}-${value}`;
}

export const createOrganization = mutation({
  args: {
    type: v.union(v.literal("client"), v.literal("supplier"), v.literal("admin")),
    name: v.string(),
    defaultLanguage: v.union(v.literal("ar"), v.literal("en"))
  },
  handler: async (ctx, args) => {
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
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("organizations").order("desc").collect();
  }
});
