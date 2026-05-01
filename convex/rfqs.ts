import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { notifyOrganization } from "./notifications";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";

const rfqLineItemInput = v.object({
  productId: v.optional(v.id("products")),
  descriptionAr: v.optional(v.string()),
  descriptionEn: v.optional(v.string()),
  quantity: v.number(),
  unit: v.string()
});

function cleanOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

export const createRfq = mutation({
  args: {
    actorUserId: v.id("users"),
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
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:submit");
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
      .withIndex("by_client", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .order("desc")
      .collect();

    return await Promise.all(
      rfqs.map(async (rfq) => {
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
      })
    );
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

    const rfqs = await ctx.db.query("rfqs").order("desc").collect();
    const now = Date.now();
    const SLA_WINDOW_MS = 1000 * 60 * 60 * 48;

    const results = await Promise.all(
      rfqs.map(async (rfq) => {
        const summary = await summarizeLineItems(ctx, rfq._id);
        const clientOrg = await ctx.db.get(rfq.clientOrganizationId);
        const assignments = await ctx.db
          .query("supplierRfqAssignments")
          .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
          .collect();
        const quotes = await ctx.db
          .query("supplierQuotes")
          .withIndex("by_rfq", (q) => q.eq("rfqId", rfq._id))
          .collect();
        const acceptedAssignments = assignments.filter((entry) => entry.status === "accepted").length;
        const submittedQuotes = quotes.filter((quote) => quote.status === "submitted" || quote.status === "underReview").length;
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
          acceptedAssignments,
          submittedQuotes,
          quoteCount: quotes.length,
          slaBreached
        };
      })
    );

    return results.filter((rfq) => rfq.status !== "draft" && rfq.status !== "cancelled");
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
      .withIndex("by_type", (q) => q.eq("type", "supplier"))
      .collect();

    return suppliers
      .filter((supplier) => supplier.status === "active")
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
      .withIndex("by_client", (q) => q.eq("clientOrganizationId", args.clientOrganizationId))
      .order("desc")
      .collect();
  }
});
