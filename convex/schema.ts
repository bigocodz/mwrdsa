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
const supplierOfferStatus = v.union(
  v.literal("draft"),
  v.literal("pendingApproval"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("suspended")
);
const productAdditionRequestStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected")
);
const savedRfqCartItem = v.object({
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
    .index("by_type_status", ["type", "status"])
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
  })
    .index("by_parent", ["parentCategoryId"])
    .index("by_active", ["isActive"])
    .index("by_updated_at", ["updatedAt"]),

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
    .index("by_sku", ["sku"])
    .index("by_visible", ["isVisible"])
    .index("by_visible_category", ["isVisible", "categoryId"])
    .index("by_updated_at", ["updatedAt"]),

  rfqs: defineTable({
    clientOrganizationId: v.id("organizations"),
    createdByUserId: v.id("users"),
    status: rfqStatus,
    requiredDeliveryDate: v.optional(v.string()),
    department: v.optional(v.string()),
    branch: v.optional(v.string()),
    costCenter: v.optional(v.string()),
    notes: v.optional(v.string()),
    isNonCatalog: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_client", ["clientOrganizationId"])
    .index("by_status", ["status"])
    .index("by_client_updated_at", ["clientOrganizationId", "updatedAt"])
    .index("by_client_status_updated_at", ["clientOrganizationId", "status", "updatedAt"])
    .index("by_status_updated_at", ["status", "updatedAt"])
    .index("by_updated_at", ["updatedAt"])
    .index("by_client_department", ["clientOrganizationId", "department"])
    .index("by_client_branch", ["clientOrganizationId", "branch"])
    .index("by_client_cost_center", ["clientOrganizationId", "costCenter"]),

  rfqLineItems: defineTable({
    rfqId: v.id("rfqs"),
    productId: v.optional(v.id("products")),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    quantity: v.number(),
    unit: v.string(),
    awardedQuoteId: v.optional(v.id("supplierQuotes")),
    createdAt: v.number()
  })
    .index("by_rfq", ["rfqId"])
    .index("by_awarded_quote", ["awardedQuoteId"]),

  rfqAttachments: defineTable({
    rfqId: v.id("rfqs"),
    storageId: v.id("_storage"),
    originalFilename: v.string(),
    sanitizationStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    createdAt: v.number()
  }).index("by_rfq", ["rfqId"]),

  savedRfqCarts: defineTable({
    clientOrganizationId: v.id("organizations"),
    createdByUserId: v.id("users"),
    name: v.string(),
    requiredDeliveryDate: v.optional(v.string()),
    department: v.optional(v.string()),
    branch: v.optional(v.string()),
    costCenter: v.optional(v.string()),
    notes: v.optional(v.string()),
    isNonCatalog: v.boolean(),
    items: v.array(savedRfqCartItem),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_client_updated_at", ["clientOrganizationId", "updatedAt"])
    .index("by_client_expires_at", ["clientOrganizationId", "expiresAt"]),

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
    .index("by_supplier", ["supplierOrganizationId"])
    .index("by_rfq_status", ["rfqId", "status"])
    .index("by_supplier_status", ["supplierOrganizationId", "status"])
    .index("by_supplier_updated_at", ["supplierOrganizationId", "updatedAt"]),

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
    .index("by_status", ["status"])
    .index("by_rfq_status", ["rfqId", "status"])
    .index("by_supplier_status", ["supplierOrganizationId", "status"])
    .index("by_supplier_updated_at", ["supplierOrganizationId", "updatedAt"])
    .index("by_status_updated_at", ["status", "updatedAt"]),

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
  })
    .index("by_active", ["isActive"])
    .index("by_client_active", ["clientOrganizationId", "isActive"])
    .index("by_category_active", ["categoryId", "isActive"]),

  marginOverrides: defineTable({
    quoteId: v.id("supplierQuotes"),
    adjustedByUserId: v.id("users"),
    previousMarginPercent: v.number(),
    newMarginPercent: v.number(),
    reason: v.string(),
    createdAt: v.number()
  })
    .index("by_quote", ["quoteId"])
    .index("by_quote_created_at", ["quoteId", "createdAt"]),

  supplierOffers: defineTable({
    productId: v.id("products"),
    supplierOrganizationId: v.id("organizations"),
    createdByUserId: v.id("users"),
    status: supplierOfferStatus,
    supplierSku: v.optional(v.string()),
    packType: v.string(),
    minOrderQuantity: v.number(),
    unitCost: v.number(),
    leadTimeDays: v.number(),
    availableQuantity: v.optional(v.number()),
    autoQuoteEnabled: v.boolean(),
    reviewWindowMinutes: v.number(),
    rejectionReason: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_supplier_updated_at", ["supplierOrganizationId", "updatedAt"])
    .index("by_supplier_status", ["supplierOrganizationId", "status"])
    .index("by_product_supplier", ["productId", "supplierOrganizationId"])
    .index("by_product_status", ["productId", "status"])
    .index("by_status_updated_at", ["status", "updatedAt"]),

  productAdditionRequests: defineTable({
    supplierOrganizationId: v.id("organizations"),
    requestedByUserId: v.id("users"),
    categoryId: v.optional(v.id("categories")),
    sku: v.optional(v.string()),
    nameAr: v.string(),
    nameEn: v.string(),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    specificationsAr: v.optional(v.string()),
    specificationsEn: v.optional(v.string()),
    packType: v.string(),
    status: productAdditionRequestStatus,
    adminProductId: v.optional(v.id("products")),
    decisionReason: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_supplier_updated_at", ["supplierOrganizationId", "updatedAt"])
    .index("by_status_updated_at", ["status", "updatedAt"])
    .index("by_category_status", ["categoryId", "status"]),

  purchaseOrders: defineTable({
    rfqId: v.id("rfqs"),
    selectedQuoteId: v.id("supplierQuotes"),
    clientOrganizationId: v.id("organizations"),
    status: poStatus,
    termsTemplateId: v.optional(v.string()),
    awardedRfqLineItemIds: v.optional(v.array(v.id("rfqLineItems"))),
    awardKind: v.optional(v.union(v.literal("full"), v.literal("split"))),
    approvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_client", ["clientOrganizationId"])
    .index("by_status", ["status"])
    .index("by_rfq", ["rfqId"])
    .index("by_client_updated_at", ["clientOrganizationId", "updatedAt"])
    .index("by_client_status_updated_at", ["clientOrganizationId", "status", "updatedAt"])
    .index("by_client_approved_at", ["clientOrganizationId", "approvedAt"])
    .index("by_approved_at", ["approvedAt"]),

  approvalInstances: defineTable({
    purchaseOrderId: v.id("purchaseOrders"),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("cancelled")),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_po", ["purchaseOrderId"])
    .index("by_po_status", ["purchaseOrderId", "status"]),

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
    .index("by_status", ["status"])
    .index("by_client_updated_at", ["clientOrganizationId", "updatedAt"])
    .index("by_supplier_updated_at", ["supplierOrganizationId", "updatedAt"])
    .index("by_client_status_updated_at", ["clientOrganizationId", "status", "updatedAt"])
    .index("by_supplier_status_updated_at", ["supplierOrganizationId", "status", "updatedAt"]),

  orderStatusEvents: defineTable({
    orderId: v.id("orders"),
    status: orderStatus,
    actorUserId: v.id("users"),
    notes: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_order", ["orderId"])
    .index("by_order_status_created_at", ["orderId", "status", "createdAt"]),

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
  })
    .index("by_recipient", ["recipientUserId"])
    .index("by_recipient_read_at", ["recipientUserId", "readAt"])
    .index("by_recipient_created_at", ["recipientUserId", "createdAt"]),

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
    .index("by_entity", ["entityType", "entityId"])
    .index("by_organization", ["organizationId"])
    .index("by_action", ["action"])
    .index("by_organization_action", ["organizationId", "action"]),

  analyticsEvents: defineTable({
    eventName: v.string(),
    userId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
    createdAt: v.number()
  })
    .index("by_event_name", ["eventName"])
    .index("by_event_created_at", ["eventName", "createdAt"])
    .index("by_organization_event", ["organizationId", "eventName"]),

  idempotencyKeys: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    key: v.string(),
    resultEntityType: v.optional(v.string()),
    resultEntityId: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number()
  })
    .index("by_actor_action_key", ["actorUserId", "action", "key"])
    .index("by_expires_at", ["expiresAt"]),

  rateLimits: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    windowStart: v.number(),
    count: v.number(),
    updatedAt: v.number()
  })
    .index("by_actor_action_window", ["actorUserId", "action", "windowStart"]),

  mutationMetrics: defineTable({
    mutation: v.string(),
    actorUserId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
    durationMs: v.number(),
    outcome: v.union(v.literal("success"), v.literal("error")),
    errorClass: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_mutation_created_at", ["mutation", "createdAt"])
    .index("by_outcome_created_at", ["outcome", "createdAt"])
    .index("by_created_at", ["createdAt"]),

  adminRevenueDailySummaries: defineTable({
    day: v.string(),
    clientOrganizationId: v.id("organizations"),
    supplierOrganizationId: v.id("organizations"),
    revenue: v.number(),
    supplierCost: v.number(),
    grossMargin: v.number(),
    purchaseOrderCount: v.number(),
    lineItemCount: v.number(),
    overrideCount: v.number(),
    marginPercentSum: v.number(),
    marginPercentSamples: v.number(),
    updatedAt: v.number()
  })
    .index("by_day", ["day"])
    .index("by_client_day", ["clientOrganizationId", "day"])
    .index("by_supplier_day", ["supplierOrganizationId", "day"])
    .index("by_day_client_supplier", ["day", "clientOrganizationId", "supplierOrganizationId"]),

  clientSpendDailySummaries: defineTable({
    day: v.string(),
    clientOrganizationId: v.id("organizations"),
    department: v.optional(v.string()),
    branch: v.optional(v.string()),
    costCenter: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    totalSpend: v.number(),
    purchaseOrderCount: v.number(),
    lineItemCount: v.number(),
    updatedAt: v.number()
  })
    .index("by_client_day", ["clientOrganizationId", "day"])
    .index("by_client_department_day", ["clientOrganizationId", "department", "day"])
    .index("by_client_branch_day", ["clientOrganizationId", "branch", "day"])
    .index("by_client_cost_center_day", ["clientOrganizationId", "costCenter", "day"])
    .index("by_client_category_day", ["clientOrganizationId", "categoryId", "day"]),

  supplierPerformanceDailySummaries: defineTable({
    day: v.string(),
    supplierOrganizationId: v.id("organizations"),
    assignmentCount: v.number(),
    respondedAssignments: v.number(),
    quoteCount: v.number(),
    selectedQuoteCount: v.number(),
    decidedQuoteCount: v.number(),
    orderCount: v.number(),
    completedOrders: v.number(),
    delayedOrders: v.number(),
    onTimeDeliveries: v.number(),
    lateDeliveries: v.number(),
    requestedQuantity: v.number(),
    coveredQuantity: v.number(),
    clientRevenue: v.number(),
    updatedAt: v.number()
  })
    .index("by_supplier_day", ["supplierOrganizationId", "day"])
    .index("by_day", ["day"])
});
