import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import type { GenericDataModel } from "convex/server";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

const authBasePath = "/api/auth";
type BetterAuthComponentApi = Parameters<typeof createClient<GenericDataModel>>[0];

// The local checkout is not linked to Convex yet, so _generated/api.ts uses the generic component reference.
const betterAuthComponent = components.betterAuth as unknown as BetterAuthComponentApi;
export const authComponent = createClient<GenericDataModel>(betterAuthComponent);

export const createAuth = (ctx: GenericCtx<GenericDataModel>) =>
  betterAuth({
    basePath: authBasePath,
    baseURL: process.env.CONVEX_SITE_URL ?? process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [process.env.SITE_URL ?? "http://localhost:5173"],
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
      convex({
        authConfig,
        jwks: process.env.JWKS,
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
