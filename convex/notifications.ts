import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createNotification = mutation({
  args: {
    recipientUserId: v.id("users"),
    type: v.string(),
    titleAr: v.string(),
    titleEn: v.string(),
    bodyAr: v.string(),
    bodyEn: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      ...args,
      createdAt: Date.now()
    });
  }
});

export const listNotificationsByUser = query({
  args: {
    recipientUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_recipient", (q) => q.eq("recipientUserId", args.recipientUserId))
      .order("desc")
      .take(50);
  }
});
