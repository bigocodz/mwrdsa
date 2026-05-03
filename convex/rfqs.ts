import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { refreshSupplierAnalyticsForActivity } from "./analytics";
import { lookupIdempotentResult, recordIdempotentResult } from "./idempotency";
import { notifyOrganization } from "./notifications";
import { withMetrics } from "./observability";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";
import { assertWithinRateLimit, RATE_LIMIT_POLICIES } from "./rateLimits";

const CLIENT_RFQ_LIST_LIMIT = 100;
const OPERATIONS_RFQ_LIST_LIMIT = 150;
const SAVED_RFQ_CART_LIST_LIMIT = 50;
const SAVED_RFQ_CART_MAX_ITEMS = 100;
const SAVED_RFQ_CART_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const OPERATIONS_RFQ_STATUSES = [
  "submitted",
  "matching",
  "assigned",
  "quoting",
  "adminReview",
  "released",
  "selected",
  "poGenerated",
  "expired"
] as const;

const rfqLineItemInput = v.object({
  productId: v.optional(v.id("products")),
  descriptionAr: v.optional(v.string()),
  descriptionEn: v.optional(v.string()),
  quantity: v.number(),
  unit: v.string()
});

const savedRfqCartItemInput = v.object({
  productId: v.optional(v.id("products")),
  sku: v.optional(v.string()),
  nameAr: v.optional(v.string()),
  nameEn: v.optional(v.string()),
  specificationsAr: v.optional(v.string()),
  specificationsEn: v.optional(v.string()),
  descriptionAr: v.optional(v.string()),
  descriptionEn: v.optional(v.string()),
  quantity: v.number(),
  unit: v.string()
});

type SavedRfqCartItemInput = {
  productId?: Id<"products">;
  sku?: string;
  nameAr?: string;
  nameEn?: string;
  specificationsAr?: string;
  specificationsEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  quantity: number;
  unit: string;
};

function cleanOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function normalizeSavedRfqCartItems(ctx: QueryCtx | MutationCtx, items: SavedRfqCartItemInput[]) {
  if (items.length === 0) {
    throw new Error("Add at least one line item before saving the cart.");
  }
  if (items.length > SAVED_RFQ_CART_MAX_ITEMS) {
    throw new Error(`Saved carts can contain up to ${SAVED_RFQ_CART_MAX_ITEMS} line items.`);
  }

  const normalized = [];
  for (const item of items) {
    if (item.quantity <= 0) {
      throw new Error("Line item quantity must be greater than zero.");
    }

    const product = item.productId ? await ctx.db.get(item.productId) : null;
    if (item.productId && (!product || !product.isVisible)) {
      throw new Error("One or more catalog products are no longer available.");
    }

    const descriptionAr = cleanOptionalText(item.descriptionAr);
    const descriptionEn = cleanOptionalText(item.descriptionEn);
    const hasDescription = Boolean(descriptionAr || descriptionEn);
    if (!item.productId && !hasDescription) {
      throw new Error("Each saved cart line needs a catalog product or description.");
    }

    normalized.push({
      productId: item.productId,
      sku: cleanOptionalText(item.sku) ?? product?.sku,
      nameAr: cleanOptionalText(item.nameAr) ?? product?.nameAr,
      nameEn: cleanOptionalText(item.nameEn) ?? product?.nameEn,
      specificationsAr: cleanOptionalText(item.specificationsAr) ?? product?.specificationsAr,
      specificationsEn: cleanOptionalText(item.specificationsEn) ?? product?.specificationsEn,
      descriptionAr,
      descriptionEn,
      quantity: Math.max(1, Math.floor(item.quantity)),
      unit: item.unit.trim() || "unit"
    });
  }

  return normalized;
}

async function summarizeLineItems(ctx: QueryCtx, rfqId: Id<"rfqs">) {
  const lineItems = await ctx.db
    .query("rfqLineItems")
    .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
    .collect();

  let totalQuantity = 0;
  for (const item of lineItems) {
    totalQuantity += item.quantity;
  }

  return {
    count: lineItems.length,
    totalQuantity,
    items: lineItems
  };
}

async function buildClientRfqRow(ctx: QueryCtx, rfq: Doc<"rfqs">) {
  const summary = await summarizeLineItems(ctx, rfq._id);
  const items = await Promise.all(
    summary.items.map(async (item) => {
      const product = item.productId ? await ctx.db.get(item.productId) : null;
      return {
        quantity: item.quantity,
        unit: item.unit,
        descriptionAr: item.descriptionAr,
        descriptionEn: item.descriptionEn,
        product: product
          ? {
              _id: product._id,
              sku: product.sku,
              nameAr: product.nameAr,
              nameEn: product.nameEn
            }
          : null
      };
    })
  );

  return {
    _id: rfq._id,
    status: rfq.status,
    requiredDeliveryDate: rfq.requiredDeliveryDate,
    department: rfq.department,
    branch: rfq.branch,
    costCenter: rfq.costCenter,
    notes: rfq.notes,
    isNonCatalog: rfq.isNonCatalog,
    createdAt: rfq.createdAt,
    updatedAt: rfq.updatedAt,
    lineItemCount: summary.count,
    totalQuantity: summary.totalQuantity,
    lineItems: items
  };
}

async function buildSavedRfqCartRow(ctx: QueryCtx, cart: Doc<"savedRfqCarts">) {
  const items = await Promise.all(
    cart.items.map(async (item) => {
      const product = item.productId ? await ctx.db.get(item.productId) : null;
      return {
        productId: item.productId,
        sku: item.sku ?? product?.sku,
        nameAr: item.nameAr ?? product?.nameAr,
        nameEn: item.nameEn ?? product?.nameEn,
        specificationsAr: item.specificationsAr ?? product?.specificationsAr,
        specificationsEn: item.specificationsEn ?? product?.specificationsEn,
        descriptionAr: item.descriptionAr,
        descriptionEn: item.descriptionEn,
        quantity: item.quantity,
        unit: item.unit
      };
    })
  );

  return {
    _id: cart._id,
    name: cart.name,
    requiredDeliveryDate: cart.requiredDeliveryDate,
    department: cart.department,
    branch: cart.branch,
    costCenter: cart.costCenter,
    notes: cart.notes,
    isNonCatalog: cart.isNonCatalog,
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    expiresAt: cart.expiresAt,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt
  };
}

async function buildOperationsRfqRow(ctx: QueryCtx, rfq: Doc<"rfqs">, now: number) {
  const summary = await summarizeLineItems(ctx, rfq._id);
  const clientOrg = await ctx.db.get(rfq.clientOrganizationId);
  const assignments = await ctx.db
    .query("supplierRfqAssignments")
    .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
    .collect();
  const acceptedAssignments = await ctx.db
    .query("supplierRfqAssignments")
    .withIndex("by_rfq_status", (q) => q.eq("rfqId", rfq._id).eq("status", "accepted"))
    .collect();
  const quotes = await ctx.db
    .query("supplierQuotes")
    .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
    .collect();
  const submittedQuotes = await Promise.all([
    ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq_status", (q) => q.eq("rfqId", rfq._id).eq("status", "submitted"))
      .collect(),
    ctx.db
      .query("supplierQuotes")
      .withIndex("by_rfq_status", (q) => q.eq("rfqId", rfq._id).eq("status", "underReview"))
      .collect()
  ]);
  const SLA_WINDOW_MS = 1000 * 60 * 60 * 48;
  const slaBreached = rfq.status !== "released" && rfq.status !== "selected" && rfq.status !== "poGenerated" && now - rfq.createdAt > SLA_WINDOW_MS && assignments.length === 0;

  return {
    _id: rfq._id,
    status: rfq.status,
    isNonCatalog: rfq.isNonCatalog,
    requiredDeliveryDate: rfq.requiredDeliveryDate,
    createdAt: rfq.createdAt,
    updatedAt: rfq.updatedAt,
    clientName: clientOrg?.name ?? "—",
    clientAnonymousId: clientOrg?.clientAnonymousId ?? "—",
    lineItemCount: summary.count,
    totalQuantity: summary.totalQuantity,
    assignmentCount: assignments.length,
    acceptedAssignments: acceptedAssignments.length,
    submittedQuotes: submittedQuotes[0].length + submittedQuotes[1].length,
    quoteCount: quotes.length,
    slaBreached
  };
}

async function loadRecentOperationsRfqs(ctx: QueryCtx, limit: number) {
  const groups = await Promise.all(
    OPERATIONS_RFQ_STATUSES.map((status) =>
      ctx.db
        .query("rfqs")
        .withIndex("by_status_updated_at", (q) => q.eq("status", status))
        .order("desc")
        .take(limit)
    )
  );

  return groups
    .flat()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export const createRfq = mutation({
  args: {
    actorUserId: v.id("users"),
    source: v.optional(v.union(v.literal("catalog"), v.literal("nonCatalog"), v.literal("companyCatalog"), v.literal("bundle"), v.literal("repeat"))),
    deliveryAddressId: v.optional(v.id("addresses")),
    requiredDeliveryDate: v.optional(v.string()),
    department: v.optional(v.string()),
    branch: v.optional(v.string()),
    costCenter: v.optional(v.string()),
    notes: v.optional(v.string()),
    isNonCatalog: v.boolean(),
    lineItems: v.array(rfqLineItemInput)
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    if (args.lineItems.length === 0) {
      throw new Error("Add at least one line item before saving the RFQ.");
    }

    const clientOrganizationId = actor.organizationId as Id<"organizations">;
    const organization = await ctx.db.get(clientOrganizationId);
    if (!organization || organization.type !== "client") {
      throw new Error("Only client organizations can create RFQs.");
    }

    const now = Date.now();
    const rfqId = await ctx.db.insert("rfqs", {
      clientOrganizationId,
      createdByUserId: args.actorUserId,
      status: "draft",
      source: args.source,
      deliveryAddressId: args.deliveryAddressId,
      requiredDeliveryDate: cleanOptionalText(args.requiredDeliveryDate),
      department: cleanOptionalText(args.department),
      branch: cleanOptionalText(args.branch),
      costCenter: cleanOptionalText(args.costCenter),
      notes: cleanOptionalText(args.notes),
      isNonCatalog: args.isNonCatalog,
      createdAt: now,
      updatedAt: now
    });

    for (const item of args.lineItems) {
      if (item.quantity <= 0) {
        throw new Error("Line item quantity must be greater than zero.");
      }

      await ctx.db.insert("rfqLineItems", {
        rfqId,
        productId: item.productId,
        descriptionAr: cleanOptionalText(item.descriptionAr),
        descriptionEn: cleanOptionalText(item.descriptionEn),
        quantity: item.quantity,
        unit: item.unit.trim() || "unit",
        createdAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: clientOrganizationId,
      action: "rfq.created",
      entityType: "rfq",
      entityId: rfqId,
      summary: `RFQ saved as draft with ${args.lineItems.length} line item(s)`,
      createdAt: now
    });

    return rfqId;
  }
});

export const submitRfq = mutation({
  args: {
    rfqId: v.id("rfqs"),
    actorUserId: v.id("users"),
    idempotencyKey: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    return await withMetrics(ctx, "rfqs.submitRfq", async (recordMetric) => {
      const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
      assertHasPermission(actor, "rfq:submit");

      if (args.idempotencyKey) {
        const cached = await lookupIdempotentResult(ctx, args.actorUserId, "rfq.submit", args.idempotencyKey);
        if (cached !== undefined) {
          await recordMetric({
            outcome: "success",
            durationMs: 0,
            actorUserId: args.actorUserId,
            organizationId: actor.organizationId as Id<"organizations">
          });
          return args.rfqId;
        }
      }

      await assertWithinRateLimit(ctx, args.actorUserId, RATE_LIMIT_POLICIES.rfqSubmit);

      const rfq = await ctx.db.get(args.rfqId);
      if (!rfq) {
        throw new Error("RFQ not found.");
      }
      assertSameOrganization(actor, rfq.clientOrganizationId);

      if (rfq.status !== "draft") {
        throw new Error("Only draft RFQs can be submitted.");
      }

      const lineItems = await ctx.db
        .query("rfqLineItems")
        .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
        .collect();
      if (lineItems.length === 0) {
        throw new Error("Add at least one line item before submitting the RFQ.");
      }

      const now = Date.now();
      await ctx.db.patch(args.rfqId, {
        status: "submitted",
        updatedAt: now
      });

      if (args.idempotencyKey) {
        await recordIdempotentResult(ctx, {
          actorUserId: args.actorUserId,
          action: "rfq.submit",
          key: args.idempotencyKey,
          resultEntityType: "rfq",
          resultEntityId: args.rfqId
        });
      }

      await ctx.db.insert("auditLogs", {
        actorUserId: args.actorUserId,
        organizationId: rfq.clientOrganizationId,
        action: "rfq.submitted",
        entityType: "rfq",
        entityId: args.rfqId,
        summary: "RFQ submitted for admin triage",
        createdAt: now
      });

      const adminOrgs = await ctx.db.query("organizations").withIndex("by_type", (q) => q.eq("type", "admin")).collect();
      for (const adminOrg of adminOrgs) {
        await notifyOrganization(ctx, adminOrg._id, {
          type: "rfq.submitted",
          titleAr: "طلب تسعير جديد",
          titleEn: "New RFQ submitted",
          bodyAr: `تم استلام طلب تسعير جديد رقم ${args.rfqId.slice(-6).toUpperCase()}.`,
          bodyEn: `New RFQ ${args.rfqId.slice(-6).toUpperCase()} is awaiting triage.`
        });
      }

      await recordMetric({
        outcome: "success",
        durationMs: Date.now() - now,
        actorUserId: args.actorUserId,
        organizationId: rfq.clientOrganizationId
      });

      return args.rfqId;
    });
  }
});

export const listRfqsForActor = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const clientOrganizationId = actor.organizationId as Id<"organizations">;
    const rfqs = await ctx.db
      .query("rfqs")
      .withIndex("by_client_updated_at", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .order("desc")
      .take(CLIENT_RFQ_LIST_LIMIT);

    return await Promise.all(rfqs.map((rfq) => buildClientRfqRow(ctx, rfq)));
  }
});

export const listRfqsForActorPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const clientOrganizationId = actor.organizationId as Id<"organizations">;
    const result = await ctx.db
      .query("rfqs")
      .withIndex("by_client_updated_at", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((rfq) => buildClientRfqRow(ctx, rfq)))
    };
  }
});

export const listSavedRfqCartsForActor = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const clientOrganizationId = actor.organizationId as Id<"organizations">;
    const organization = await ctx.db.get(clientOrganizationId);
    if (!organization || organization.type !== "client") {
      throw new Error("Only client organizations can manage saved RFQ carts.");
    }

    const now = Date.now();
    const carts = await ctx.db
      .query("savedRfqCarts")
      .withIndex("by_client_expires_at", (q) => q.eq("clientOrganizationId", clientOrganizationId).gt("expiresAt", now))
      .order("desc")
      .take(SAVED_RFQ_CART_LIST_LIMIT);

    carts.sort((a, b) => b.updatedAt - a.updatedAt);
    return await Promise.all(carts.map((cart) => buildSavedRfqCartRow(ctx, cart)));
  }
});

export const saveSavedRfqCartForActor = mutation({
  args: {
    actorUserId: v.id("users"),
    name: v.optional(v.string()),
    requiredDeliveryDate: v.optional(v.string()),
    department: v.optional(v.string()),
    branch: v.optional(v.string()),
    costCenter: v.optional(v.string()),
    notes: v.optional(v.string()),
    isNonCatalog: v.boolean(),
    items: v.array(savedRfqCartItemInput)
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const clientOrganizationId = actor.organizationId as Id<"organizations">;
    const organization = await ctx.db.get(clientOrganizationId);
    if (!organization || organization.type !== "client") {
      throw new Error("Only client organizations can manage saved RFQ carts.");
    }

    const items = await normalizeSavedRfqCartItems(ctx, args.items);
    const now = Date.now();
    const savedCartId = await ctx.db.insert("savedRfqCarts", {
      clientOrganizationId,
      createdByUserId: args.actorUserId,
      name: cleanOptionalText(args.name) ?? `RFQ cart ${new Date(now).toISOString().slice(0, 10)}`,
      requiredDeliveryDate: cleanOptionalText(args.requiredDeliveryDate),
      department: cleanOptionalText(args.department),
      branch: cleanOptionalText(args.branch),
      costCenter: cleanOptionalText(args.costCenter),
      notes: cleanOptionalText(args.notes),
      isNonCatalog: args.isNonCatalog,
      items,
      expiresAt: now + SAVED_RFQ_CART_TTL_MS,
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: clientOrganizationId,
      action: "rfq_cart.saved",
      entityType: "savedRfqCart",
      entityId: savedCartId,
      summary: `Saved RFQ cart with ${items.length} line item(s)`,
      createdAt: now
    });

    return savedCartId;
  }
});

export const deleteSavedRfqCartForActor = mutation({
  args: {
    actorUserId: v.id("users"),
    savedCartId: v.id("savedRfqCarts")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const savedCart = await ctx.db.get(args.savedCartId);
    if (!savedCart) {
      return;
    }
    assertSameOrganization(actor, savedCart.clientOrganizationId);

    await ctx.db.delete(args.savedCartId);
    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: savedCart.clientOrganizationId,
      action: "rfq_cart.deleted",
      entityType: "savedRfqCart",
      entityId: args.savedCartId,
      summary: `Deleted saved RFQ cart: ${savedCart.name}`,
      createdAt: Date.now()
    });
  }
});

export const getRfqDetailForActor = query({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      return null;
    }
    assertSameOrganization(actor, rfq.clientOrganizationId);

    const lineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();

    const enrichedLineItems = await Promise.all(
      lineItems.map(async (item) => {
        const product = item.productId ? await ctx.db.get(item.productId) : null;
        return {
          _id: item._id,
          quantity: item.quantity,
          unit: item.unit,
          descriptionAr: item.descriptionAr,
          descriptionEn: item.descriptionEn,
          product: product
            ? {
                _id: product._id,
                sku: product.sku,
                nameAr: product.nameAr,
                nameEn: product.nameEn
              }
            : null
        };
      })
    );

    const auditEvents = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) => q.eq("entityType", "rfq").eq("entityId", args.rfqId))
      .collect();
    auditEvents.sort((a, b) => b.createdAt - a.createdAt);

    return {
      _id: rfq._id,
      status: rfq.status,
      requiredDeliveryDate: rfq.requiredDeliveryDate,
      department: rfq.department,
      branch: rfq.branch,
      costCenter: rfq.costCenter,
      notes: rfq.notes,
      isNonCatalog: rfq.isNonCatalog,
      createdAt: rfq.createdAt,
      updatedAt: rfq.updatedAt,
      lineItems: enrichedLineItems,
      timeline: auditEvents.map((event) => ({
        _id: event._id,
        action: event.action,
        summary: event.summary,
        createdAt: event.createdAt
      }))
    };
  }
});

export const generateAttachmentUploadUrl = mutation({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");
    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      throw new Error("RFQ not found.");
    }
    assertSameOrganization(actor, rfq.clientOrganizationId);
    return await ctx.storage.generateUploadUrl();
  }
});

export const attachRfqFile = mutation({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs"),
    storageId: v.id("_storage"),
    originalFilename: v.string()
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");
    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      throw new Error("RFQ not found.");
    }
    assertSameOrganization(actor, rfq.clientOrganizationId);

    const filename = args.originalFilename.trim() || "attachment";
    const now = Date.now();
    const attachmentId = await ctx.db.insert("rfqAttachments", {
      rfqId: args.rfqId,
      storageId: args.storageId,
      originalFilename: filename,
      sanitizationStatus: "pending",
      createdAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: rfq.clientOrganizationId,
      action: "rfq.attachment.uploaded",
      entityType: "rfq",
      entityId: args.rfqId,
      summary: `Attachment uploaded for review: ${filename}`,
      createdAt: now
    });

    return attachmentId;
  }
});

export const removeRfqAttachment = mutation({
  args: {
    actorUserId: v.id("users"),
    attachmentId: v.id("rfqAttachments")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }
    const rfq = await ctx.db.get(attachment.rfqId);
    if (!rfq) {
      throw new Error("RFQ not found.");
    }
    assertSameOrganization(actor, rfq.clientOrganizationId);
    if (rfq.status !== "draft") {
      throw new Error("Attachments can only be removed while the RFQ is a draft.");
    }

    await ctx.storage.delete(attachment.storageId);
    await ctx.db.delete(args.attachmentId);

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: rfq.clientOrganizationId,
      action: "rfq.attachment.removed",
      entityType: "rfq",
      entityId: attachment.rfqId,
      summary: `Attachment removed: ${attachment.originalFilename}`,
      createdAt: Date.now()
    });
  }
});

export const listRfqAttachments = query({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");
    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      return [];
    }
    assertSameOrganization(actor, rfq.clientOrganizationId);

    const attachments = await ctx.db
      .query("rfqAttachments")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();

    return attachments
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((attachment) => ({
        _id: attachment._id,
        originalFilename: attachment.originalFilename,
        sanitizationStatus: attachment.sanitizationStatus,
        createdAt: attachment.createdAt
      }));
  }
});

export const listOperationsRfqs = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:operations");

    const rfqs = await loadRecentOperationsRfqs(ctx, OPERATIONS_RFQ_LIST_LIMIT);
    const now = Date.now();

    return await Promise.all(rfqs.map((rfq) => buildOperationsRfqRow(ctx, rfq, now)));
  }
});

export const listOperationsRfqsPaginated = query({
  args: {
    actorUserId: v.id("users"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:operations");

    const result = await ctx.db
      .query("rfqs")
      .withIndex("by_updated_at")
      .order("desc")
      .paginate(args.paginationOpts);
    const activeRfqs = result.page.filter((rfq) => rfq.status !== "draft" && rfq.status !== "cancelled");
    const now = Date.now();

    return {
      ...result,
      page: await Promise.all(activeRfqs.map((rfq) => buildOperationsRfqRow(ctx, rfq, now)))
    };
  }
});

export const listSupplierOrgsForMatching = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:operations");

    const suppliers = await ctx.db
      .query("organizations")
      .withIndex("by_type_status", (q) => q.eq("type", "supplier").eq("status", "active"))
      .take(500);

    return suppliers
      .map((supplier) => ({
        _id: supplier._id,
        name: supplier.name,
        supplierAnonymousId: supplier.supplierAnonymousId ?? "—"
      }));
  }
});

export const listAssignmentsForRfq = query({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:operations");

    const assignments = await ctx.db
      .query("supplierRfqAssignments")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();

    return await Promise.all(
      assignments.map(async (assignment) => {
        const supplier = await ctx.db.get(assignment.supplierOrganizationId);
        return {
          _id: assignment._id,
          status: assignment.status,
          declineReason: assignment.declineReason,
          responseDeadline: assignment.responseDeadline,
          supplierName: supplier?.name ?? "—",
          supplierAnonymousId: supplier?.supplierAnonymousId ?? "—"
        };
      })
    );
  }
});

export const assignSupplierToRfq = mutation({
  args: {
    actorUserId: v.id("users"),
    rfqId: v.id("rfqs"),
    supplierOrganizationId: v.id("organizations"),
    responseDeadline: v.number()
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:operations");

    const rfq = await ctx.db.get(args.rfqId);
    if (!rfq) {
      throw new Error("RFQ not found.");
    }
    if (rfq.status === "draft" || rfq.status === "cancelled" || rfq.status === "expired") {
      throw new Error("RFQ is not in an assignable state.");
    }

    const supplier = await ctx.db.get(args.supplierOrganizationId);
    if (!supplier || supplier.type !== "supplier" || supplier.status !== "active") {
      throw new Error("Active supplier organization is required.");
    }

    const existing = await ctx.db
      .query("supplierRfqAssignments")
      .withIndex("by_rfq", (q) => q.eq("rfqId", args.rfqId))
      .collect();
    const duplicate = existing.find((entry) => entry.supplierOrganizationId === args.supplierOrganizationId);
    if (duplicate) {
      throw new Error("Supplier is already assigned to this RFQ.");
    }

    const now = Date.now();
    if (args.responseDeadline <= now) {
      throw new Error("Response deadline must be in the future.");
    }

    const assignmentId = await ctx.db.insert("supplierRfqAssignments", {
      rfqId: args.rfqId,
      supplierOrganizationId: args.supplierOrganizationId,
      status: "assigned",
      responseDeadline: args.responseDeadline,
      createdAt: now,
      updatedAt: now
    });

    if (rfq.status === "submitted" || rfq.status === "matching") {
      await ctx.db.patch(args.rfqId, {
        status: "assigned",
        updatedAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: rfq.clientOrganizationId,
      action: "rfq.supplier_assigned",
      entityType: "rfq",
      entityId: args.rfqId,
      summary: `Supplier ${supplier.name} (${supplier.supplierAnonymousId ?? "—"}) assigned to RFQ`,
      createdAt: now
    });

    await notifyOrganization(ctx, args.supplierOrganizationId, {
      type: "rfq.assignment.created",
      titleAr: "طلب تسعير مسند",
      titleEn: "New RFQ assignment",
      bodyAr: "تم إسناد طلب تسعير مجهول إليكم. يرجى المراجعة قبل الموعد النهائي.",
      bodyEn: "An anonymous RFQ has been assigned to you. Please review before the deadline."
    });
    await refreshSupplierAnalyticsForActivity(ctx, args.supplierOrganizationId, now);

    return assignmentId;
  }
});

export const listRfqsByClient = query({
  args: {
    clientOrganizationId: v.id("organizations")
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rfqs")
      .withIndex("by_client_updated_at", (q) => q.eq("clientOrganizationId", args.clientOrganizationId))
      .order("desc")
      .take(200);
  }
});
