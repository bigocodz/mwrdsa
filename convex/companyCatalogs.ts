// Slice 22: Company Catalogs
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";

const CATALOG_LIST_LIMIT = 100;
const CATALOG_ITEM_LIMIT = 500;

const companyCatalogItemInput = v.object({
  productId: v.id("products"),
  preferredUnit: v.optional(v.string()),
  notes: v.optional(v.string())
});

export const listCompanyCatalogs = query({
  args: { actorUserId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const catalogs = await ctx.db
      .query("companyCatalogs")
      .withIndex("by_organization_updated_at", (q) =>
        q.eq("organizationId", actor.organizationId as Id<"organizations">)
      )
      .order("desc")
      .take(CATALOG_LIST_LIMIT);

    return await Promise.all(
      catalogs.map(async (catalog) => {
        const items = await ctx.db
          .query("companyCatalogItems")
          .withIndex("by_catalog", (q) => q.eq("companyCatalogId", catalog._id))
          .collect();

        return {
          _id: catalog._id,
          nameAr: catalog.nameAr,
          nameEn: catalog.nameEn,
          descriptionAr: catalog.descriptionAr,
          descriptionEn: catalog.descriptionEn,
          isActive: catalog.isActive,
          itemCount: items.length,
          createdAt: catalog.createdAt,
          updatedAt: catalog.updatedAt
        };
      })
    );
  }
});

export const getCompanyCatalogDetail = query({
  args: {
    actorUserId: v.id("users"),
    companyCatalogId: v.id("companyCatalogs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const catalog = await ctx.db.get(args.companyCatalogId);
    if (!catalog) return null;
    assertSameOrganization(actor, catalog.organizationId);

    const items = await ctx.db
      .query("companyCatalogItems")
      .withIndex("by_catalog", (q) => q.eq("companyCatalogId", args.companyCatalogId))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        return {
          _id: item._id,
          productId: item.productId,
          product: product
            ? {
                _id: product._id,
                sku: product.sku,
                nameAr: product.nameAr,
                nameEn: product.nameEn,
                defaultUnit: product.defaultUnit,
                packTypes: product.packTypes
              }
            : null,
          preferredUnit: item.preferredUnit,
          notes: item.notes,
          createdAt: item.createdAt
        };
      })
    );

    return {
      _id: catalog._id,
      nameAr: catalog.nameAr,
      nameEn: catalog.nameEn,
      descriptionAr: catalog.descriptionAr,
      descriptionEn: catalog.descriptionEn,
      isActive: catalog.isActive,
      items: enrichedItems,
      createdAt: catalog.createdAt,
      updatedAt: catalog.updatedAt
    };
  }
});

export const createCompanyCatalog = mutation({
  args: {
    actorUserId: v.id("users"),
    nameAr: v.string(),
    nameEn: v.string(),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const orgId = actor.organizationId as Id<"organizations">;
    const now = Date.now();

    const catalogId = await ctx.db.insert("companyCatalogs", {
      organizationId: orgId,
      createdByUserId: args.actorUserId,
      nameAr: args.nameAr.trim(),
      nameEn: args.nameEn.trim(),
      descriptionAr: args.descriptionAr?.trim() || undefined,
      descriptionEn: args.descriptionEn?.trim() || undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: orgId,
      action: "company_catalog.created",
      entityType: "companyCatalog",
      entityId: catalogId,
      summary: `Company catalog "${args.nameEn}" created`,
      createdAt: now
    });

    return catalogId;
  }
});

export const updateCompanyCatalog = mutation({
  args: {
    actorUserId: v.id("users"),
    companyCatalogId: v.id("companyCatalogs"),
    nameAr: v.string(),
    nameEn: v.string(),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    isActive: v.boolean()
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const catalog = await ctx.db.get(args.companyCatalogId);
    if (!catalog) throw new Error("Company catalog not found.");
    assertSameOrganization(actor, catalog.organizationId);

    await ctx.db.patch(args.companyCatalogId, {
      nameAr: args.nameAr.trim(),
      nameEn: args.nameEn.trim(),
      descriptionAr: args.descriptionAr?.trim() || undefined,
      descriptionEn: args.descriptionEn?.trim() || undefined,
      isActive: args.isActive,
      updatedAt: Date.now()
    });
  }
});

export const addCompanyCatalogItem = mutation({
  args: {
    actorUserId: v.id("users"),
    companyCatalogId: v.id("companyCatalogs"),
    item: companyCatalogItemInput
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const catalog = await ctx.db.get(args.companyCatalogId);
    if (!catalog) throw new Error("Company catalog not found.");
    assertSameOrganization(actor, catalog.organizationId);

    const existingCount = await ctx.db
      .query("companyCatalogItems")
      .withIndex("by_catalog", (q) => q.eq("companyCatalogId", args.companyCatalogId))
      .collect();
    if (existingCount.length >= CATALOG_ITEM_LIMIT) {
      throw new Error(`A company catalog can contain up to ${CATALOG_ITEM_LIMIT} products.`);
    }

    // Check for duplicate
    const duplicate = existingCount.find((i) => i.productId === args.item.productId);
    if (duplicate) throw new Error("This product is already in the catalog.");

    const product = await ctx.db.get(args.item.productId);
    if (!product || !product.isVisible) throw new Error("Product is not available.");

    const now = Date.now();
    const itemId = await ctx.db.insert("companyCatalogItems", {
      companyCatalogId: args.companyCatalogId,
      productId: args.item.productId,
      preferredUnit: args.item.preferredUnit?.trim() || undefined,
      notes: args.item.notes?.trim() || undefined,
      createdAt: now
    });

    await ctx.db.patch(args.companyCatalogId, { updatedAt: now });
    return itemId;
  }
});

export const removeCompanyCatalogItem = mutation({
  args: {
    actorUserId: v.id("users"),
    companyCatalogItemId: v.id("companyCatalogItems")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const item = await ctx.db.get(args.companyCatalogItemId);
    if (!item) return;

    const catalog = await ctx.db.get(item.companyCatalogId);
    if (!catalog) return;
    assertSameOrganization(actor, catalog.organizationId);

    await ctx.db.delete(args.companyCatalogItemId);
    await ctx.db.patch(item.companyCatalogId, { updatedAt: Date.now() });
  }
});

export const deleteCompanyCatalog = mutation({
  args: {
    actorUserId: v.id("users"),
    companyCatalogId: v.id("companyCatalogs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const catalog = await ctx.db.get(args.companyCatalogId);
    if (!catalog) return;
    assertSameOrganization(actor, catalog.organizationId);

    const items = await ctx.db
      .query("companyCatalogItems")
      .withIndex("by_catalog", (q) => q.eq("companyCatalogId", args.companyCatalogId))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.companyCatalogId);

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: catalog.organizationId,
      action: "company_catalog.deleted",
      entityType: "companyCatalog",
      entityId: args.companyCatalogId,
      summary: `Company catalog "${catalog.nameEn}" deleted`,
      createdAt: Date.now()
    });
  }
});
