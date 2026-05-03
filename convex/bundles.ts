// Slice 21: Bundles / Essentials Packs
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";

const BUNDLE_LIST_LIMIT = 100;

const bundleItemInput = v.object({
  productId: v.id("products"),
  quantity: v.number(),
  unit: v.string(),
  notes: v.optional(v.string())
});

export const listBundles = query({
  args: { actorUserId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const bundles = await ctx.db
      .query("bundles")
      .withIndex("by_organization_updated_at", (q) =>
        q.eq("organizationId", actor.organizationId as Id<"organizations">)
      )
      .order("desc")
      .take(BUNDLE_LIST_LIMIT);

    return await Promise.all(
      bundles.map(async (bundle) => {
        const items = await ctx.db
          .query("bundleItems")
          .withIndex("by_bundle", (q) => q.eq("bundleId", bundle._id))
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
                    nameEn: product.nameEn
                  }
                : null,
              quantity: item.quantity,
              unit: item.unit,
              notes: item.notes
            };
          })
        );

        return {
          _id: bundle._id,
          nameAr: bundle.nameAr,
          nameEn: bundle.nameEn,
          descriptionAr: bundle.descriptionAr,
          descriptionEn: bundle.descriptionEn,
          isActive: bundle.isActive,
          itemCount: items.length,
          items: enrichedItems,
          createdAt: bundle.createdAt,
          updatedAt: bundle.updatedAt
        };
      })
    );
  }
});

export const createBundle = mutation({
  args: {
    actorUserId: v.id("users"),
    nameAr: v.string(),
    nameEn: v.string(),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    items: v.array(bundleItemInput)
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    if (args.items.length === 0) {
      throw new Error("A bundle must have at least one item.");
    }

    const orgId = actor.organizationId as Id<"organizations">;
    const now = Date.now();

    const bundleId = await ctx.db.insert("bundles", {
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

    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Bundle item quantity must be greater than zero.");
      const product = await ctx.db.get(item.productId);
      if (!product || !product.isVisible) throw new Error("One or more bundle products are no longer available.");

      await ctx.db.insert("bundleItems", {
        bundleId,
        productId: item.productId,
        quantity: Math.max(1, Math.floor(item.quantity)),
        unit: item.unit.trim() || "unit",
        notes: item.notes?.trim() || undefined,
        createdAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: orgId,
      action: "bundle.created",
      entityType: "bundle",
      entityId: bundleId,
      summary: `Bundle "${args.nameEn}" created with ${args.items.length} item(s)`,
      createdAt: now
    });

    return bundleId;
  }
});

export const updateBundle = mutation({
  args: {
    actorUserId: v.id("users"),
    bundleId: v.id("bundles"),
    nameAr: v.string(),
    nameEn: v.string(),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    isActive: v.boolean(),
    items: v.array(bundleItemInput)
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle) throw new Error("Bundle not found.");
    assertSameOrganization(actor, bundle.organizationId);

    if (args.items.length === 0) {
      throw new Error("A bundle must have at least one item.");
    }

    const now = Date.now();

    // Replace all items
    const existingItems = await ctx.db
      .query("bundleItems")
      .withIndex("by_bundle", (q) => q.eq("bundleId", args.bundleId))
      .collect();
    for (const item of existingItems) {
      await ctx.db.delete(item._id);
    }

    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Bundle item quantity must be greater than zero.");
      await ctx.db.insert("bundleItems", {
        bundleId: args.bundleId,
        productId: item.productId,
        quantity: Math.max(1, Math.floor(item.quantity)),
        unit: item.unit.trim() || "unit",
        notes: item.notes?.trim() || undefined,
        createdAt: now
      });
    }

    await ctx.db.patch(args.bundleId, {
      nameAr: args.nameAr.trim(),
      nameEn: args.nameEn.trim(),
      descriptionAr: args.descriptionAr?.trim() || undefined,
      descriptionEn: args.descriptionEn?.trim() || undefined,
      isActive: args.isActive,
      updatedAt: now
    });
  }
});

export const deleteBundle = mutation({
  args: {
    actorUserId: v.id("users"),
    bundleId: v.id("bundles")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle) return;
    assertSameOrganization(actor, bundle.organizationId);

    const items = await ctx.db
      .query("bundleItems")
      .withIndex("by_bundle", (q) => q.eq("bundleId", args.bundleId))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.bundleId);

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: bundle.organizationId,
      action: "bundle.deleted",
      entityType: "bundle",
      entityId: args.bundleId,
      summary: `Bundle "${bundle.nameEn}" deleted`,
      createdAt: Date.now()
    });
  }
});
