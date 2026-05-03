// Slice 25: Internal admin user management
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertActiveUser, assertHasPermission } from "./rbac";

const ADMIN_PORTAL_ORG_NAME = "MWRD";

/** List all internal (backoffice) users */
export const listAdminUsers = query({
  args: { actorUserId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "superAdmin:manage");

    // Find the internal MWRD org
    const internalOrg = await ctx.db
      .query("organizations")
      .collect()
      .then((orgs) => orgs.find((o) => o.name === ADMIN_PORTAL_ORG_NAME && o.type === "admin"));

    if (!internalOrg) return [];

    const users = await ctx.db
      .query("users")
      .collect()
      .then((all) =>
        all
          .filter((u) => u.organizationId === internalOrg._id)
          .sort((a, b) => a.createdAt - b.createdAt)
      );

    // Return anonymised-safe view (no cross-tenant leakage — these are internal)
    return users.map((u) => ({
      _id: u._id,
      email: u.email,
      name: u.name,
      roles: u.roles,
      status: u.status,
      createdAt: u.createdAt
    }));
  }
});

/** Invite a new internal admin user */
export const inviteAdminUser = mutation({
  args: {
    actorUserId: v.id("users"),
    email: v.string(),
    name: v.string(),
    role: v.string()
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "superAdmin:manage");

    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Invalid email address.");

    const ALLOWED_ROLES = ["superAdmin", "operationsManager", "pricingAnalyst", "accountManager", "catalogManager", "reportingAnalyst"] as const;
    type AllowedRole = typeof ALLOWED_ROLES[number];
    if (!ALLOWED_ROLES.includes(args.role as AllowedRole)) {
      throw new Error(`Role "${args.role}" is not a valid admin role.`);
    }

    // Check duplicate
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new Error("A user with this email already exists.");

    // Find internal org
    const internalOrg = await ctx.db
      .query("organizations")
      .collect()
      .then((orgs) => orgs.find((o) => o.name === ADMIN_PORTAL_ORG_NAME && o.type === "admin"));
    if (!internalOrg) throw new Error("Internal admin organisation not found. Run seed first.");

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      organizationId: internalOrg._id,
      email,
      name: args.name.trim(),
      roles: [args.role as AllowedRole],
      language: "en",
      status: "invited",
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: internalOrg._id,
      action: "admin_user.invited",
      entityType: "user",
      entityId: userId,
      summary: `Internal user "${email}" invited with role "${args.role}"`,
      createdAt: now
    });

    return userId;
  }
});

/** Update roles for an internal admin user */
export const updateAdminUserRoles = mutation({
  args: {
    actorUserId: v.id("users"),
    targetUserId: v.id("users"),
    roles: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "superAdmin:manage");

    if (args.actorUserId === args.targetUserId) {
      throw new Error("You cannot modify your own roles.");
    }

    const now = Date.now();
    await ctx.db.patch(args.targetUserId, {
      roles: args.roles as any,
      updatedAt: now
    });

    const target = await ctx.db.get(args.targetUserId);
    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: actor.organizationId as Id<"organizations">,
      action: "admin_user.roles_updated",
      entityType: "user",
      entityId: args.targetUserId,
      summary: `Roles for "${target?.email}" updated to: ${args.roles.join(", ")}`,
      createdAt: now
    });
  }
});

/** Deactivate an internal admin user */
export const deactivateAdminUser = mutation({
  args: {
    actorUserId: v.id("users"),
    targetUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "superAdmin:manage");

    if (args.actorUserId === args.targetUserId) {
      throw new Error("You cannot deactivate your own account.");
    }

    const target = await ctx.db.get(args.targetUserId);
    if (!target) throw new Error("User not found.");

    const now = Date.now();
    await ctx.db.patch(args.targetUserId, { status: "suspended", updatedAt: now });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: actor.organizationId as Id<"organizations">,
      action: "admin_user.deactivated",
      entityType: "user",
      entityId: args.targetUserId,
      summary: `Internal user "${target.email}" deactivated`,
      createdAt: now
    });
  }
});
