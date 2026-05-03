import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertActiveUser, assertHasAnyPermission, assertHasPermission } from "./rbac";

const ADMIN_CATALOG_LIST_LIMIT = 500;
const CLIENT_CATALOG_LIST_LIMIT = 250;
type CategorySummary = {
  _id: Id<"categories">;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
} | null;

function cleanOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function getCategoryForProduct(
  ctx: QueryCtx,
  categoryId: Id<"categories">,
  cache?: Map<Id<"categories">, CategorySummary>
) {
  const cached = cache?.get(categoryId);
  if (cached !== undefined) {
    return cached;
  }

  const category = await ctx.db.get(categoryId);

  if (!category) {
    cache?.set(categoryId, null);
    return null;
  }

  const result = {
    _id: category._id,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    isActive: category.isActive
  };
  cache?.set(categoryId, result);
  return result;
}

async function enrichAdminProduct(ctx: QueryCtx, product: Doc<"products">, categoryCache: Map<Id<"categories">, CategorySummary>) {
  return {
    ...product,
    category: await getCategoryForProduct(ctx, product.categoryId, categoryCache)
  };
}

async function enrichVisibleProduct(ctx: QueryCtx, product: Doc<"products">, categoryCache: Map<Id<"categories">, CategorySummary>) {
  const category = await getCategoryForProduct(ctx, product.categoryId, categoryCache);
  if (!category?.isActive) {
    return null;
  }

  return {
    _id: product._id,
    sku: product.sku,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    descriptionAr: product.descriptionAr,
    descriptionEn: product.descriptionEn,
    specificationsAr: product.specificationsAr,
    specificationsEn: product.specificationsEn,
    category
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

    return await ctx.db
      .query("categories")
      .withIndex("by_updated_at")
      .order("desc")
      .take(ADMIN_CATALOG_LIST_LIMIT);
  }
});

export const listProductsForAdmin = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    const products = await ctx.db
      .query("products")
      .withIndex("by_updated_at")
      .order("desc")
      .take(ADMIN_CATALOG_LIST_LIMIT);
    const categoryCache = new Map<Id<"categories">, CategorySummary>();

    return await Promise.all(products.map((product) => enrichAdminProduct(ctx, product, categoryCache)));
  }
});

export const listVisibleProducts = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasAnyPermission(actor, ["rfq:create", "catalog:manage"]);

    const products = await ctx.db
      .query("products")
      .withIndex("by_visible", (q) => q.eq("isVisible", true))
      .order("desc")
      .take(CLIENT_CATALOG_LIST_LIMIT);
    const categoryCache = new Map<Id<"categories">, CategorySummary>();
    const visibleProducts = [];

    for (const product of products) {
      const visibleProduct = await enrichVisibleProduct(ctx, product, categoryCache);
      if (visibleProduct) visibleProducts.push(visibleProduct);
    }

    return visibleProducts;
  }
});

export const listProductsForAdminPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    const result = await ctx.db
      .query("products")
      .withIndex("by_updated_at")
      .order("desc")
      .paginate(args.paginationOpts);
    const categoryCache = new Map<Id<"categories">, CategorySummary>();

    return {
      ...result,
      page: await Promise.all(result.page.map((product) => enrichAdminProduct(ctx, product, categoryCache)))
    };
  }
});

export const listVisibleProductsPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasAnyPermission(actor, ["rfq:create", "catalog:manage"]);

    const result = await ctx.db
      .query("products")
      .withIndex("by_visible", (q) => q.eq("isVisible", true))
      .order("desc")
      .paginate(args.paginationOpts);
    const categoryCache = new Map<Id<"categories">, CategorySummary>();
    const page = [];

    for (const product of result.page) {
      const visibleProduct = await enrichVisibleProduct(ctx, product, categoryCache);
      if (visibleProduct) page.push(visibleProduct);
    }

    return {
      ...result,
      page
    };
  }
});
