import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const recordAnalyticsEvent = mutation({
  args: {
    eventName: v.string(),
    userId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations"))
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("analyticsEvents", {
      ...args,
      createdAt: Date.now()
    });
  }
});
