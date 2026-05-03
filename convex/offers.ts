import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";
import { assertWithinRateLimit, RATE_LIMIT_POLICIES } from "./rateLimits";

type ReadCtx = QueryCtx | MutationCtx;

const supplierOfferStatusValidator = v.union(
  v.literal("draft"),
  v.literal("pendingApproval"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("suspended")
);
const productAdditionRequestDecisionValidator = v.union(v.literal("approved"), v.literal("rejected"));

function cleanOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return value;
}

function nonNegativeOptionalNumber(value: number | undefined, label: string) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} cannot be negative.`);
  }
  return value;
}

async function loadProductSummary(ctx: ReadCtx, productId: Id<"products">) {
  const product = await ctx.db.get(productId);
  if (!product) return null;
  const category = await ctx.db.get(product.categoryId);
  return {
    _id: product._id,
    sku: product.sku,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    specificationsAr: product.specificationsAr,
    specificationsEn: product.specificationsEn,
    isVisible: product.isVisible,
    category: category
      ? {
          _id: category._id,
          nameAr: category.nameAr,
          nameEn: category.nameEn,
          isActive: category.isActive
        }
      : null
  };
}

async function buildSupplierCatalogProductRow(ctx: ReadCtx, product: Doc<"products">, supplierOrganizationId: Id<"organizations">) {
  const category = await ctx.db.get(product.categoryId);
  const existingOffer = await ctx.db
    .query("supplierOffers")
    .withIndex("by_product_supplier", (q) => q.eq("productId", product._id).eq("supplierOrganizationId", supplierOrganizationId))
    .first();

  return {
    _id: product._id,
    sku: product.sku,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    specificationsAr: product.specificationsAr,
    specificationsEn: product.specificationsEn,
    category: category
      ? {
          _id: category._id,
          nameAr: category.nameAr,
          nameEn: category.nameEn
        }
      : null,
    existingOffer: existingOffer
      ? {
          _id: existingOffer._id,
          status: existingOffer.status,
          unitCost: existingOffer.unitCost,
          packType: existingOffer.packType,
          minOrderQuantity: existingOffer.minOrderQuantity,
          leadTimeDays: existingOffer.leadTimeDays,
          availableQuantity: existingOffer.availableQuantity,
          autoQuoteEnabled: existingOffer.autoQuoteEnabled,
          reviewWindowMinutes: existingOffer.reviewWindowMinutes,
          rejectionReason: existingOffer.rejectionReason,
          updatedAt: existingOffer.updatedAt
        }
      : null
  };
}

async function buildSupplierOfferRow(ctx: ReadCtx, offer: Doc<"supplierOffers">) {
  return {
    _id: offer._id,
    status: offer.status,
    supplierSku: offer.supplierSku,
    packType: offer.packType,
    minOrderQuantity: offer.minOrderQuantity,
    unitCost: offer.unitCost,
    leadTimeDays: offer.leadTimeDays,
    availableQuantity: offer.availableQuantity,
    autoQuoteEnabled: offer.autoQuoteEnabled,
    reviewWindowMinutes: offer.reviewWindowMinutes,
    rejectionReason: offer.rejectionReason,
    submittedAt: offer.submittedAt,
    approvedAt: offer.approvedAt,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
    product: await loadProductSummary(ctx, offer.productId)
  };
}

async function buildAdminOfferApprovalRow(ctx: ReadCtx, offer: Doc<"supplierOffers">) {
  const supplier = await ctx.db.get(offer.supplierOrganizationId);
  return {
    ...(await buildSupplierOfferRow(ctx, offer)),
    supplierName: supplier?.name ?? "—",
    supplierAnonymousId: supplier?.supplierAnonymousId ?? "—"
  };
}

async function buildProductAdditionRequestRow(ctx: ReadCtx, request: Doc<"productAdditionRequests">) {
  const supplier = await ctx.db.get(request.supplierOrganizationId);
  const category = request.categoryId ? await ctx.db.get(request.categoryId) : null;
  return {
    _id: request._id,
    status: request.status,
    sku: request.sku,
    nameAr: request.nameAr,
    nameEn: request.nameEn,
    descriptionAr: request.descriptionAr,
    descriptionEn: request.descriptionEn,
    specificationsAr: request.specificationsAr,
    specificationsEn: request.specificationsEn,
    packType: request.packType,
    adminProductId: request.adminProductId,
    decisionReason: request.decisionReason,
    decidedAt: request.decidedAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    supplierName: supplier?.name ?? "—",
    supplierAnonymousId: supplier?.supplierAnonymousId ?? "—",
    category: category
      ? {
          _id: category._id,
          nameAr: category.nameAr,
          nameEn: category.nameEn
        }
      : null
  };
}

async function assertSupplierActor(ctx: ReadCtx, actorUserId: Id<"users">) {
  const actor = assertActiveUser(await ctx.db.get(actorUserId));
  assertHasPermission(actor, "quote:submit");
  const supplierOrganizationId = actor.organizationId as Id<"organizations">;
  const supplier = await ctx.db.get(supplierOrganizationId);
  if (!supplier || supplier.type !== "supplier") {
    throw new Error("Only supplier organizations can manage supplier offers.");
  }
  return { actor, supplierOrganizationId };
}

export const listProductsForSupplierOffersPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const { supplierOrganizationId } = await assertSupplierActor(ctx, args.actorUserId);
    const result = await ctx.db
      .query("products")
      .withIndex("by_visible", (q) => q.eq("isVisible", true))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((product) => buildSupplierCatalogProductRow(ctx, product, supplierOrganizationId)))
    };
  }
});

export const listActiveCategoriesForSupplier = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    await assertSupplierActor(ctx, args.actorUserId);
    return await ctx.db
      .query("categories")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(500);
  }
});

export const listSupplierOffersForActorPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const { supplierOrganizationId } = await assertSupplierActor(ctx, args.actorUserId);
    const result = await ctx.db
      .query("supplierOffers")
      .withIndex("by_supplier_updated_at", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((offer) => buildSupplierOfferRow(ctx, offer)))
    };
  }
});

export const listProductAdditionRequestsForSupplierPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const { supplierOrganizationId } = await assertSupplierActor(ctx, args.actorUserId);
    const result = await ctx.db
      .query("productAdditionRequests")
      .withIndex("by_supplier_updated_at", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((request) => buildProductAdditionRequestRow(ctx, request)))
    };
  }
});

export const upsertSupplierOffer = mutation({
  args: {
    actorUserId: v.id("users"),
    productId: v.id("products"),
    supplierSku: v.optional(v.string()),
    packType: v.string(),
    minOrderQuantity: v.number(),
    unitCost: v.number(),
    leadTimeDays: v.number(),
    availableQuantity: v.optional(v.number()),
    autoQuoteEnabled: v.boolean(),
    reviewWindowMinutes: v.number()
  },
  handler: async (ctx, args) => {
    const { actor, supplierOrganizationId } = await assertSupplierActor(ctx, args.actorUserId);
    await assertWithinRateLimit(ctx, args.actorUserId, RATE_LIMIT_POLICIES.supplierOfferUpsert);
    const product = await ctx.db.get(args.productId);
    if (!product || !product.isVisible) {
      throw new Error("Active master catalog product is required.");
    }

    const packType = args.packType.trim();
    if (!packType) {
      throw new Error("Pack type is required.");
    }
    const now = Date.now();
    const payload = {
      supplierSku: cleanOptionalText(args.supplierSku),
      packType,
      minOrderQuantity: positiveNumber(args.minOrderQuantity, "Minimum order quantity"),
      unitCost: positiveNumber(args.unitCost, "Unit cost"),
      leadTimeDays: positiveNumber(args.leadTimeDays, "Lead time"),
      availableQuantity: nonNegativeOptionalNumber(args.availableQuantity, "Available quantity"),
      autoQuoteEnabled: args.autoQuoteEnabled,
      reviewWindowMinutes: positiveNumber(args.reviewWindowMinutes, "Review window"),
      status: "pendingApproval" as const,
      rejectionReason: undefined,
      submittedAt: now,
      approvedAt: undefined,
      updatedAt: now
    };

    const existing = await ctx.db
      .query("supplierOffers")
      .withIndex("by_product_supplier", (q) => q.eq("productId", args.productId).eq("supplierOrganizationId", supplierOrganizationId))
      .first();

    if (existing) {
      assertSameOrganization(actor, existing.supplierOrganizationId);
      await ctx.db.patch(existing._id, payload);
      await ctx.db.insert("auditLogs", {
        actorUserId: args.actorUserId,
        organizationId: supplierOrganizationId,
        action: "supplier_offer.submitted_update",
        entityType: "supplierOffer",
        entityId: existing._id,
        summary: `Supplier submitted offer update for ${product.sku}`,
        createdAt: now
      });
      return existing._id;
    }

    const offerId = await ctx.db.insert("supplierOffers", {
      productId: args.productId,
      supplierOrganizationId,
      createdByUserId: args.actorUserId,
      createdAt: now,
      ...payload
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: supplierOrganizationId,
      action: "supplier_offer.submitted",
      entityType: "supplierOffer",
      entityId: offerId,
      summary: `Supplier submitted offer for ${product.sku}`,
      createdAt: now
    });
    return offerId;
  }
});

export const submitProductAdditionRequest = mutation({
  args: {
    actorUserId: v.id("users"),
    categoryId: v.optional(v.id("categories")),
    sku: v.optional(v.string()),
    nameAr: v.string(),
    nameEn: v.string(),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    specificationsAr: v.optional(v.string()),
    specificationsEn: v.optional(v.string()),
    packType: v.string()
  },
  handler: async (ctx, args) => {
    const { supplierOrganizationId } = await assertSupplierActor(ctx, args.actorUserId);
    await assertWithinRateLimit(ctx, args.actorUserId, RATE_LIMIT_POLICIES.productAdditionRequest);
    if (args.categoryId) {
      const category = await ctx.db.get(args.categoryId);
      if (!category || !category.isActive) {
        throw new Error("Active category is required.");
      }
    }
    const nameAr = args.nameAr.trim();
    const nameEn = args.nameEn.trim();
    const packType = args.packType.trim();
    if (!nameAr || !nameEn || !packType) {
      throw new Error("Product name and pack type are required.");
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("productAdditionRequests", {
      supplierOrganizationId,
      requestedByUserId: args.actorUserId,
      categoryId: args.categoryId,
      sku: cleanOptionalText(args.sku),
      nameAr,
      nameEn,
      descriptionAr: cleanOptionalText(args.descriptionAr),
      descriptionEn: cleanOptionalText(args.descriptionEn),
      specificationsAr: cleanOptionalText(args.specificationsAr),
      specificationsEn: cleanOptionalText(args.specificationsEn),
      packType,
      status: "pending",
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: supplierOrganizationId,
      action: "product_addition.requested",
      entityType: "productAdditionRequest",
      entityId: requestId,
      summary: `Supplier requested product ${nameEn}`,
      createdAt: now
    });
    return requestId;
  }
});

export const listPendingOfferApprovalsPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    const result = await ctx.db
      .query("supplierOffers")
      .withIndex("by_status_updated_at", (q) => q.eq("status", "pendingApproval"))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((offer) => buildAdminOfferApprovalRow(ctx, offer)))
    };
  }
});

export const decideSupplierOffer = mutation({
  args: {
    actorUserId: v.id("users"),
    offerId: v.id("supplierOffers"),
    status: supplierOfferStatusValidator,
    reason: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    if (args.status !== "approved" && args.status !== "rejected" && args.status !== "suspended") {
      throw new Error("Offer decision must approve, reject, or suspend.");
    }
    const offer = await ctx.db.get(args.offerId);
    if (!offer) {
      throw new Error("Supplier offer was not found.");
    }

    const reason = cleanOptionalText(args.reason);
    if ((args.status === "rejected" || args.status === "suspended") && !reason) {
      throw new Error("A reason is required when rejecting or suspending an offer.");
    }

    const now = Date.now();
    await ctx.db.patch(args.offerId, {
      status: args.status,
      rejectionReason: args.status === "approved" ? undefined : reason,
      approvedAt: args.status === "approved" ? now : offer.approvedAt,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: offer.supplierOrganizationId,
      action: `supplier_offer.${args.status}`,
      entityType: "supplierOffer",
      entityId: args.offerId,
      summary: `Admin set supplier offer to ${args.status}${reason ? `: ${reason}` : ""}`,
      createdAt: now
    });
  }
});

export const listProductAdditionRequestsForAdminPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    const result = await ctx.db
      .query("productAdditionRequests")
      .withIndex("by_status_updated_at", (q) => q.eq("status", "pending"))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((request) => buildProductAdditionRequestRow(ctx, request)))
    };
  }
});

export const decideProductAdditionRequest = mutation({
  args: {
    actorUserId: v.id("users"),
    requestId: v.id("productAdditionRequests"),
    decision: productAdditionRequestDecisionValidator,
    reason: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "catalog:manage");

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Product addition request was not found.");
    }
    const now = Date.now();
    const reason = cleanOptionalText(args.reason);

    if (args.decision === "rejected") {
      if (!reason) {
        throw new Error("A reason is required when rejecting a product request.");
      }
      await ctx.db.patch(args.requestId, {
        status: "rejected",
        decisionReason: reason,
        decidedAt: now,
        updatedAt: now
      });
    } else {
      if (!request.categoryId) {
        throw new Error("Choose a category before approving this product request.");
      }
      const category = await ctx.db.get(request.categoryId);
      if (!category || !category.isActive) {
        throw new Error("Active category is required.");
      }
      const sku = request.sku ?? `REQ-${request._id.slice(-6).toUpperCase()}`;
      const duplicate = await ctx.db.query("products").withIndex("by_sku", (q) => q.eq("sku", sku)).first();
      if (duplicate && duplicate._id !== request.adminProductId) {
        throw new Error("Product SKU already exists.");
      }
      let adminProductId = request.adminProductId;
      if (!adminProductId) {
        adminProductId = await ctx.db.insert("products", {
          categoryId: request.categoryId,
          sku,
          nameAr: request.nameAr,
          nameEn: request.nameEn,
          descriptionAr: request.descriptionAr,
          descriptionEn: request.descriptionEn,
          specificationsAr: request.specificationsAr,
          specificationsEn: request.specificationsEn,
          isVisible: true,
          createdAt: now,
          updatedAt: now
        });
      }
      await ctx.db.patch(args.requestId, {
        status: "approved",
        adminProductId,
        decisionReason: reason,
        decidedAt: now,
        updatedAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: request.supplierOrganizationId,
      action: `product_addition.${args.decision}`,
      entityType: "productAdditionRequest",
      entityId: args.requestId,
      summary: `Admin ${args.decision} product addition request${reason ? `: ${reason}` : ""}`,
      createdAt: now
    });
  }
});
