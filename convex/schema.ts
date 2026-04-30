import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const organizationType = v.union(v.literal("client"), v.literal("supplier"), v.literal("admin"));
const organizationStatus = v.union(v.literal("active"), v.literal("suspended"), v.literal("pending"), v.literal("closed"));
const language = v.union(v.literal("ar"), v.literal("en"));
const role = v.union(
  v.literal("superAdmin"),
  v.literal("operationsManager"),
  v.literal("pricingAnalyst"),
  v.literal("accountManager"),
  v.literal("catalogManager"),
  v.literal("reportingAnalyst"),
  v.literal("orgAdmin"),
  v.literal("procurementManager"),
  v.literal("procurementOfficer"),
  v.literal("requester"),
  v.literal("financeApprover"),
  v.literal("departmentHead"),
  v.literal("supplierAdmin"),
  v.literal("quotationOfficer"),
  v.literal("operationsOfficer"),
  v.literal("viewer")
);
const rfqStatus = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("matching"),
  v.literal("assigned"),
  v.literal("quoting"),
  v.literal("adminReview"),
  v.literal("released"),
  v.literal("selected"),
  v.literal("poGenerated"),
  v.literal("cancelled"),
  v.literal("expired")
);
const quoteStatus = v.union(
  v.literal("submitted"),
  v.literal("underReview"),
  v.literal("approvedForRelease"),
  v.literal("released"),
  v.literal("selected"),
  v.literal("rejected"),
  v.literal("held"),
  v.literal("expired"),
  v.literal("lost")
);
const poStatus = v.union(v.literal("draft"), v.literal("pendingApproval"), v.literal("approved"), v.literal("sentToSupplier"), v.literal("rejected"), v.literal("returnedForChanges"));
const orderStatus = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("processing"),
  v.literal("shipped"),
  v.literal("delivered"),
  v.literal("receiptConfirmed"),
  v.literal("completed"),
  v.literal("disputed"),
  v.literal("delayed")
);

export default defineSchema({
  organizations: defineTable({
    type: organizationType,
    name: v.string(),
    clientAnonymousId: v.optional(v.string()),
    supplierAnonymousId: v.optional(v.string()),
    status: organizationStatus,
    defaultLanguage: language,
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_type", ["type"])
    .index("by_client_anonymous_id", ["clientAnonymousId"])
    .index("by_supplier_anonymous_id", ["supplierAnonymousId"]),

  users: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    name: v.string(),
    roles: v.array(role),
    language,
    status: v.union(v.literal("active"), v.literal("invited"), v.literal("suspended")),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_email", ["email"])
    .index("by_organization", ["organizationId"]),

  categories: defineTable({
    parentCategoryId: v.optional(v.id("categories")),
    nameAr: v.string(),
    nameEn: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_parent", ["parentCategoryId"]),

  products: defineTable({
    categoryId: v.id("categories"),
    sku: v.string(),
    nameAr: v.string(),
    nameEn: v.string(),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    specificationsAr: v.optional(v.string()),
    specificationsEn: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    isVisible: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_category", ["categoryId"])
    .index("by_sku", ["sku"]),

  rfqs: defineTable({
    clientOrganizationId: v.id("organizations"),
    createdByUserId: v.id("users"),
    status: rfqStatus,
    requiredDeliveryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    isNonCatalog: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_client", ["clientOrganizationId"])
    .index("by_status", ["status"]),

  rfqLineItems: defineTable({
    rfqId: v.id("rfqs"),
    productId: v.optional(v.id("products")),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    quantity: v.number(),
    unit: v.string(),
    createdAt: v.number()
  }).index("by_rfq", ["rfqId"]),

  rfqAttachments: defineTable({
    rfqId: v.id("rfqs"),
    storageId: v.id("_storage"),
    originalFilename: v.string(),
    sanitizationStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    createdAt: v.number()
  }).index("by_rfq", ["rfqId"]),

  supplierRfqAssignments: defineTable({
    rfqId: v.id("rfqs"),
    supplierOrganizationId: v.id("organizations"),
    status: v.union(v.literal("assigned"), v.literal("accepted"), v.literal("declined"), v.literal("expired")),
    declineReason: v.optional(v.string()),
    responseDeadline: v.number(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_rfq", ["rfqId"])
    .index("by_supplier", ["supplierOrganizationId"]),

  supplierQuotes: defineTable({
    rfqId: v.id("rfqs"),
    supplierOrganizationId: v.id("organizations"),
    submittedByUserId: v.id("users"),
    status: quoteStatus,
    leadTimeDays: v.number(),
    validUntil: v.string(),
    supportsPartialFulfillment: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_rfq", ["rfqId"])
    .index("by_supplier", ["supplierOrganizationId"])
    .index("by_status", ["status"]),

  supplierQuoteLineItems: defineTable({
    quoteId: v.id("supplierQuotes"),
    rfqLineItemId: v.id("rfqLineItems"),
    supplierUnitPrice: v.number(),
    supplierTotalPrice: v.number(),
    clientFinalUnitPrice: v.optional(v.number()),
    clientFinalTotalPrice: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_quote", ["quoteId"]),

  marginRules: defineTable({
    name: v.string(),
    categoryId: v.optional(v.id("categories")),
    clientOrganizationId: v.optional(v.id("organizations")),
    marginPercent: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_active", ["isActive"]),

  marginOverrides: defineTable({
    quoteId: v.id("supplierQuotes"),
    adjustedByUserId: v.id("users"),
    previousMarginPercent: v.number(),
    newMarginPercent: v.number(),
    reason: v.string(),
    createdAt: v.number()
  }).index("by_quote", ["quoteId"]),

  purchaseOrders: defineTable({
    rfqId: v.id("rfqs"),
    selectedQuoteId: v.id("supplierQuotes"),
    clientOrganizationId: v.id("organizations"),
    status: poStatus,
    termsTemplateId: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_client", ["clientOrganizationId"])
    .index("by_status", ["status"]),

  approvalInstances: defineTable({
    purchaseOrderId: v.id("purchaseOrders"),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("cancelled")),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_po", ["purchaseOrderId"]),

  orders: defineTable({
    purchaseOrderId: v.id("purchaseOrders"),
    clientOrganizationId: v.id("organizations"),
    supplierOrganizationId: v.id("organizations"),
    status: orderStatus,
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_client", ["clientOrganizationId"])
    .index("by_supplier", ["supplierOrganizationId"])
    .index("by_status", ["status"]),

  orderStatusEvents: defineTable({
    orderId: v.id("orders"),
    status: orderStatus,
    actorUserId: v.id("users"),
    notes: v.optional(v.string()),
    createdAt: v.number()
  }).index("by_order", ["orderId"]),

  disputes: defineTable({
    orderId: v.id("orders"),
    openedByUserId: v.id("users"),
    organizationId: v.id("organizations"),
    subject: v.string(),
    description: v.string(),
    status: v.union(v.literal("open"), v.literal("acknowledged"), v.literal("resolved"), v.literal("closed")),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_order", ["orderId"])
    .index("by_status", ["status"]),

  notifications: defineTable({
    recipientUserId: v.id("users"),
    type: v.string(),
    titleAr: v.string(),
    titleEn: v.string(),
    bodyAr: v.string(),
    bodyEn: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number()
  }).index("by_recipient", ["recipientUserId"]),

  auditLogs: defineTable({
    actorUserId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    summary: v.string(),
    createdAt: v.number()
  })
    .index("by_actor", ["actorUserId"])
    .index("by_entity", ["entityType", "entityId"]),

  analyticsEvents: defineTable({
    eventName: v.string(),
    userId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
    createdAt: v.number()
  }).index("by_event_name", ["eventName"])
});
