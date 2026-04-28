import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createCategory = mutation({
  args: {
    parentCategoryId: v.optional(v.id("categories")),
    nameAr: v.string(),
    nameEn: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("categories", {
      ...args,
      isActive: true,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const createProduct = mutation({
  args: {
    categoryId: v.id("categories"),
    sku: v.string(),
    nameAr: v.string(),
    nameEn: v.string(),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("products", {
      ...args,
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
