import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertActiveUser } from "./rbac";

const NOTIFICATION_LIST_LIMIT = 100;
const UNREAD_BADGE_LIMIT = 100;

export async function notifyOrganization(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  payload: { type: string; titleAr: string; titleEn: string; bodyAr: string; bodyEn: string }
) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const now = Date.now();
  for (const user of users) {
    if (user.status !== "active") continue;
    await ctx.db.insert("notifications", {
      recipientUserId: user._id,
      type: payload.type,
      titleAr: payload.titleAr,
      titleEn: payload.titleEn,
      bodyAr: payload.bodyAr,
      bodyEn: payload.bodyEn,
      createdAt: now
    });
  }
}

export const createNotification = internalMutation({
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

export const listNotificationsForActor = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    assertActiveUser(await ctx.db.get(args.actorUserId));
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_created_at", (q) => q.eq("recipientUserId", args.actorUserId))
      .order("desc")
      .take(NOTIFICATION_LIST_LIMIT);
    return notifications.map((entry) => ({
      _id: entry._id,
      type: entry.type,
      titleAr: entry.titleAr,
      titleEn: entry.titleEn,
      bodyAr: entry.bodyAr,
      bodyEn: entry.bodyEn,
      readAt: entry.readAt,
      createdAt: entry.createdAt
    }));
  }
});

export const countUnreadNotificationsForActor = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    assertActiveUser(await ctx.db.get(args.actorUserId));
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_read_at", (q) => q.eq("recipientUserId", args.actorUserId).eq("readAt", undefined))
      .take(UNREAD_BADGE_LIMIT);
    return notifications.length;
  }
});

export const markNotificationRead = mutation({
  args: {
    actorUserId: v.id("users"),
    notificationId: v.id("notifications")
  },
  handler: async (ctx, args) => {
    assertActiveUser(await ctx.db.get(args.actorUserId));
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error("Notification not found.");
    }
    if (notification.recipientUserId !== args.actorUserId) {
      throw new Error("Cross-recipient access is not allowed.");
    }
    if (!notification.readAt) {
      await ctx.db.patch(args.notificationId, { readAt: Date.now() });
    }
  }
});

export const markAllNotificationsRead = mutation({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    assertActiveUser(await ctx.db.get(args.actorUserId));
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_read_at", (q) => q.eq("recipientUserId", args.actorUserId).eq("readAt", undefined))
      .collect();
    const now = Date.now();
    for (const entry of notifications) {
      await ctx.db.patch(entry._id, { readAt: now });
    }
  }
});

export const listNotificationsByUser = query({
  args: {
    recipientUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_recipient_created_at", (q) => q.eq("recipientUserId", args.recipientUserId))
      .order("desc")
      .take(50);
  }
});
