import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertActiveUser, assertHasPermission } from "./rbac";

export const createCategory = mutation({
  args: {
    actorUserId: v.id("users"),
    parentCategoryId: v.optional(v.id("categories")),
    nameAr: v.string(),
    nameEn: v.string()
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    const now = Date.now();
    return await ctx.db.insert("categories", {
      parentCategoryId: args.parentCategoryId,
      nameAr: args.nameAr,
      nameEn: args.nameEn,
      isActive: true,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const createProduct = mutation({
  args: {
    actorUserId: v.id("users"),
    categoryId: v.id("categories"),
    sku: v.string(),
    nameAr: v.string(),
    nameEn: v.string(),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    const now = Date.now();
    return await ctx.db.insert("products", {
      categoryId: args.categoryId,
      sku: args.sku,
      nameAr: args.nameAr,
      nameEn: args.nameEn,
      descriptionAr: args.descriptionAr,
      descriptionEn: args.descriptionEn,
      isVisible: true,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const listVisibleProducts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("products").filter((q) => q.eq(q.field("isVisible"), true)).collect();
  }
});
