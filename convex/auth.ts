import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

const authBasePath = "/api/auth";
const trustedOrigins = [
  process.env.SITE_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5175"
].filter((origin): origin is string => Boolean(origin));
const siteUrl = process.env.SITE_URL ?? "http://localhost:5173";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    basePath: authBasePath,
    baseURL: process.env.CONVEX_SITE_URL ?? process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false
    },
    rateLimit: {
      storage: "database"
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({
        authConfig,
        options: { basePath: authBasePath }
      })
    ]
  });

export const { getAuthUser } = authComponent.clientApi();

export const getCurrentSession = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx);
    if (!authUser?.email) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", authUser.email))
      .unique();

    if (!user || user.status !== "active") {
      return null;
    }

    const organization = await ctx.db.get(user.organizationId);
    if (!organization || organization.status !== "active") {
      return null;
    }

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      portal: organization.type,
      roles: user.roles,
      organizationId: user.organizationId,
      language: user.language
    };
  }
});
