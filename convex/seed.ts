import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createAuth } from "./auth";

const portalLiteral = v.union(v.literal("admin"), v.literal("client"), v.literal("supplier"));
const roleLiteral = v.union(
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

const DEMO_PASSWORD = "Demo123!@#";

const DEMO_ACCOUNTS = [
  {
    portal: "admin" as const,
    orgName: "MWRD",
    email: "admin@mwrd.local",
    name: "MWRD Admin",
    roles: ["superAdmin"] as const
  },
  {
    portal: "client" as const,
    orgName: "Demo Client Co.",
    email: "client@mwrd.local",
    name: "Client Demo",
    roles: ["orgAdmin", "procurementManager"] as const
  },
  {
    portal: "supplier" as const,
    orgName: "Demo Supplier Co.",
    email: "supplier@mwrd.local",
    name: "Supplier Demo",
    roles: ["supplierAdmin", "quotationOfficer"] as const
  }
];

export const _ensureOrgAndUser = internalMutation({
  args: {
    portal: portalLiteral,
    orgName: v.string(),
    email: v.string(),
    name: v.string(),
    roles: v.array(roleLiteral)
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    let organization = await ctx.db
      .query("organizations")
      .withIndex("by_type", (q) => q.eq("type", args.portal))
      .first();

    if (!organization) {
      const orgId = await ctx.db.insert("organizations", {
        type: args.portal,
        name: args.orgName,
        status: "active",
        defaultLanguage: "ar",
        createdAt: now,
        updatedAt: now
      });
      organization = await ctx.db.get(orgId);
    }

    if (!organization) {
      throw new Error("Failed to create organization");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (!existingUser) {
      await ctx.db.insert("users", {
        organizationId: organization._id,
        email: args.email,
        name: args.name,
        roles: [...args.roles],
        language: "ar",
        status: "active",
        createdAt: now,
        updatedAt: now
      });
    } else if (existingUser.status !== "active") {
      await ctx.db.patch(existingUser._id, { status: "active", updatedAt: now });
    }

    return organization._id;
  }
});

export const seedDevelopmentData = action({
  args: {},
  handler: async (ctx) => {
    const created: { portal: string; email: string; password: string }[] = [];

    for (const account of DEMO_ACCOUNTS) {
      await ctx.runMutation(internal.seed._ensureOrgAndUser, {
        portal: account.portal,
        orgName: account.orgName,
        email: account.email,
        name: account.name,
        roles: [...account.roles]
      });

      const auth = createAuth(ctx);
      const authCtx = await auth.$context;
      const existing = await authCtx.internalAdapter.findUserByEmail(account.email, { includeAccounts: true });

      const authUser =
        existing?.user ??
        (await authCtx.internalAdapter.createUser({
          email: account.email,
          name: account.name,
          emailVerified: true
        }));
      const hashed = await authCtx.password.hash(DEMO_PASSWORD);
      const credentialAccount = existing?.accounts?.find((entry) => entry.providerId === "credential");
      if (credentialAccount?.id) {
        await authCtx.internalAdapter.updateAccount(credentialAccount.id, { password: hashed });
      } else {
        await authCtx.internalAdapter.linkAccount({
          userId: authUser.id,
          providerId: "credential",
          accountId: authUser.id,
          password: hashed
        });
      }

      created.push({
        portal: account.portal,
        email: account.email,
        password: DEMO_PASSWORD
      });
    }

    return { accounts: created };
  }
});
