import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertActiveUser, assertHasAnyPermission, assertHasPermission } from "./rbac";

function cleanOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function getCategoryForProduct(ctx: QueryCtx, categoryId: Id<"categories">) {
  const category = await ctx.db.get(categoryId);

  if (!category) {
    return null;
  }

  return {
    _id: category._id,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    isActive: category.isActive
  };
}

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

    const parentCategoryId = args.parentCategoryId;
    if (parentCategoryId) {
      const parentCategory = await ctx.db.get(parentCategoryId);
      if (!parentCategory) {
        throw new Error("Parent category was not found.");
      }
    }

    const now = Date.now();
    const categoryId = await ctx.db.insert("categories", {
      parentCategoryId,
      nameAr: args.nameAr.trim(),
      nameEn: args.nameEn.trim(),
      isActive: true,
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      action: "catalog.category.created",
      entityType: "category",
      entityId: categoryId,
      summary: `Created catalog category ${args.nameEn.trim()}`,
      createdAt: now
    });

    return categoryId;
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
    descriptionEn: v.optional(v.string()),
    specificationsAr: v.optional(v.string()),
    specificationsEn: v.optional(v.string()),
    isVisible: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    const sku = args.sku.trim();
    const existingProduct = await ctx.db.query("products").withIndex("by_sku", (q) => q.eq("sku", sku)).first();
    if (existingProduct) {
      throw new Error("Product SKU already exists.");
    }

    const category = await ctx.db.get(args.categoryId);
    if (!category || !category.isActive) {
      throw new Error("Active category is required.");
    }

    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      categoryId: args.categoryId,
      sku,
      nameAr: args.nameAr.trim(),
      nameEn: args.nameEn.trim(),
      descriptionAr: cleanOptionalText(args.descriptionAr),
      descriptionEn: cleanOptionalText(args.descriptionEn),
      specificationsAr: cleanOptionalText(args.specificationsAr),
      specificationsEn: cleanOptionalText(args.specificationsEn),
      isVisible: args.isVisible ?? true,
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      action: "catalog.product.created",
      entityType: "product",
      entityId: productId,
      summary: `Created catalog product ${sku}`,
      createdAt: now
    });

    return productId;
  }
});

export const updateProductVisibility = mutation({
  args: {
    actorUserId: v.id("users"),
    productId: v.id("products"),
    isVisible: v.boolean()
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product was not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.productId, {
      isVisible: args.isVisible,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      action: args.isVisible ? "catalog.product.visible" : "catalog.product.hidden",
      entityType: "product",
      entityId: args.productId,
      summary: `${args.isVisible ? "Made visible" : "Hid"} catalog product ${product.sku}`,
      createdAt: now
    });
  }
});

export const listCategoriesForAdmin = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    return await ctx.db.query("categories").order("desc").collect();
  }
});

export const listProductsForAdmin = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    const products = await ctx.db.query("products").order("desc").collect();

    return await Promise.all(
      products.map(async (product) => ({
        ...product,
        category: await getCategoryForProduct(ctx, product.categoryId)
      }))
    );
  }
});

export const listVisibleProducts = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasAnyPermission(actor, ["rfq:create", "catalog:manage"]);

    const products = await ctx.db.query("products").filter((q) => q.eq(q.field("isVisible"), true)).collect();
    const visibleProducts = [];

    for (const product of products) {
      const category = await getCategoryForProduct(ctx, product.categoryId);
      if (!category?.isActive) {
        continue;
      }

      visibleProducts.push({
        _id: product._id,
        sku: product.sku,
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        descriptionAr: product.descriptionAr,
        descriptionEn: product.descriptionEn,
        specificationsAr: product.specificationsAr,
        specificationsEn: product.specificationsEn,
        category
      });
    }

    return visibleProducts;
  }
});
