import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { refreshPurchaseOrderAnalytics, refreshSupplierAnalyticsForOrder } from "./analytics";
import { createAuth } from "./auth";
import type { Id } from "./_generated/dataModel";

const portalLiteral = v.union(v.literal("admin"), v.literal("client"), v.literal("supplier"));
const roleLiteral = v.union(
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

const DEMO_PASSWORD = "Demo123!@#";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const DEMO_ACCOUNTS = [
  {
    portal: "admin" as const,
    orgName: "MWRD",
    email: "admin@mwrd.local",
    name: "MWRD Admin",
    roles: ["superAdmin"] as const
  },
  {
    portal: "client" as const,
    orgName: "Demo Client Co.",
    anonymousId: "CLIENT-DEMO-001",
    email: "client@mwrd.local",
    name: "Client Demo",
    roles: ["orgAdmin", "procurementManager"] as const
  },
  {
    portal: "supplier" as const,
    orgName: "Demo Supplier Co.",
    anonymousId: "SUPPLIER-DEMO-001",
    email: "supplier@mwrd.local",
    name: "Supplier Demo",
    roles: ["supplierAdmin", "quotationOfficer"] as const
  }
];

export const _ensureOrgAndUser = internalMutation({
  args: {
    portal: portalLiteral,
    orgName: v.string(),
    anonymousId: v.optional(v.string()),
    email: v.string(),
    name: v.string(),
    roles: v.array(roleLiteral)
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    let organization = existingUser ? await ctx.db.get(existingUser.organizationId) : null;
    if (!organization) {
      const organizations = await ctx.db
        .query("organizations")
        .withIndex("by_type", (q) => q.eq("type", args.portal))
        .collect();
      organization = organizations.find((entry) => entry.name === args.orgName) ?? null;
    }

    if (!organization) {
      const orgId = await ctx.db.insert("organizations", {
        type: args.portal,
        name: args.orgName,
        ...(args.portal === "client" ? { clientAnonymousId: args.anonymousId } : {}),
        ...(args.portal === "supplier" ? { supplierAnonymousId: args.anonymousId } : {}),
        status: "active",
        defaultLanguage: "ar",
        createdAt: now,
        updatedAt: now
      });
      organization = await ctx.db.get(orgId);
    }

    if (!organization) {
      throw new Error("Failed to create organization");
    }

    await ctx.db.patch(organization._id, {
      name: args.orgName,
      status: "active",
      defaultLanguage: "ar",
      ...(args.portal === "client" ? { clientAnonymousId: args.anonymousId } : {}),
      ...(args.portal === "supplier" ? { supplierAnonymousId: args.anonymousId } : {}),
      updatedAt: now
    });

    if (!existingUser) {
      await ctx.db.insert("users", {
        organizationId: organization._id,
        email: args.email,
        name: args.name,
        roles: [...args.roles],
        language: "ar",
        status: "active",
        createdAt: now,
        updatedAt: now
      });
    } else {
      await ctx.db.patch(existingUser._id, {
        organizationId: organization._id,
        name: args.name,
        roles: [...args.roles],
        language: "ar",
        status: "active",
        updatedAt: now
      });
    }

    return organization._id;
  }
});

type SeedRfqStatus = "submitted" | "assigned" | "adminReview" | "released" | "poGenerated";
type SeedAssignmentStatus = "assigned" | "accepted";
type SeedQuoteStatus = "submitted" | "released" | "selected";
type SeedPoStatus = "sentToSupplier";
type SeedOrderStatus = "receiptConfirmed";
type DemoSeedResult =
  | { skipped: true; reason: string }
  | { skipped: false; rfqsCreated: number; productsReady: number };
type SeedLineItem = {
  productId?: Id<"products">;
  descriptionAr?: string;
  descriptionEn?: string;
  quantity: number;
  unit: string;
};

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(Math.floor(value), max));
}

function loadId(prefix: string, index: number) {
  return `${prefix}-${String(index + 1).padStart(4, "0")}`;
}

export const _seedDemoWorkflowData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const atDays = (days: number) => now + days * DAY_MS;
    const dateAtDays = (days: number) => new Date(atDays(days)).toISOString().slice(0, 10);

    async function findUser(email: string) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (!user) {
        throw new Error(`Demo user missing: ${email}`);
      }
      return user;
    }

    const adminUser = await findUser("admin@mwrd.local");
    const clientUser = await findUser("client@mwrd.local");
    const supplierUser = await findUser("supplier@mwrd.local");
    const clientOrganizationId = clientUser.organizationId as Id<"organizations">;
    const supplierOrganizationId = supplierUser.organizationId as Id<"organizations">;

    const existingRfqs = await ctx.db
      .query("rfqs")
      .withIndex("by_client", (q) => q.eq("clientOrganizationId", clientOrganizationId))
      .collect();
    if (existingRfqs.some((rfq) => rfq.notes?.includes("DEMO_SEED_COMPLETED_ORDER"))) {
      return {
        skipped: true,
        reason: "Demo workflow data already exists."
      };
    }

    async function upsertCategory(input: { nameAr: string; nameEn: string }) {
      const existing = (await ctx.db.query("categories").collect()).find((category) => category.nameEn === input.nameEn);
      if (existing) {
        await ctx.db.patch(existing._id, {
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          isActive: true,
          updatedAt: now
        });
        return existing._id;
      }
      return await ctx.db.insert("categories", {
        parentCategoryId: undefined,
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        isActive: true,
        createdAt: now,
        updatedAt: now
      });
    }

    let demoProductCounter = (await ctx.db.query("products").collect()).length;
    async function upsertProduct(input: {
      categoryId: Id<"categories">;
      sku: string;
      nameAr: string;
      nameEn: string;
      descriptionAr: string;
      descriptionEn: string;
      specificationsAr: string;
      specificationsEn: string;
      packTypes: readonly string[];
      defaultUnit: string;
    }) {
      const { packTypes, defaultUnit, ...rest } = input;
      const existing = await ctx.db
        .query("products")
        .withIndex("by_sku", (q) => q.eq("sku", input.sku))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          categoryId: input.categoryId,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          descriptionAr: input.descriptionAr,
          descriptionEn: input.descriptionEn,
          specificationsAr: input.specificationsAr,
          specificationsEn: input.specificationsEn,
          packTypes: [...packTypes],
          defaultUnit,
          lifecycleStatus: existing.lifecycleStatus ?? "active",
          masterProductCode: existing.masterProductCode ?? `MWRD-PROD-${String(++demoProductCounter).padStart(5, "0")}`,
          isVisible: true,
          updatedAt: now
        });
        return existing._id;
      }
      demoProductCounter++;
      return await ctx.db.insert("products", {
        ...rest,
        packTypes: [...packTypes],
        defaultUnit,
        lifecycleStatus: "active",
        masterProductCode: `MWRD-PROD-${String(demoProductCounter).padStart(5, "0")}`,
        isVisible: true,
        createdAt: now,
        updatedAt: now
      });
    }

    async function insertRfq(input: {
      status: SeedRfqStatus;
      marker: string;
      requiredDeliveryDate: string;
      department: string;
      branch: string;
      costCenter: string;
      notes: string;
      createdAt: number;
      lineItems: SeedLineItem[];
    }) {
      const rfqId = await ctx.db.insert("rfqs", {
        clientOrganizationId,
        createdByUserId: clientUser._id,
        status: input.status,
        requiredDeliveryDate: input.requiredDeliveryDate,
        department: input.department,
        branch: input.branch,
        costCenter: input.costCenter,
        notes: `${input.marker} ${input.notes}`,
        isNonCatalog: false,
        createdAt: input.createdAt,
        updatedAt: input.createdAt + 2 * 60 * 60 * 1000
      });
      const lineItemIds: Id<"rfqLineItems">[] = [];
      for (const item of input.lineItems) {
        lineItemIds.push(
          await ctx.db.insert("rfqLineItems", {
            rfqId,
            ...item,
            createdAt: input.createdAt
          })
        );
      }
      await ctx.db.insert("auditLogs", {
        actorUserId: clientUser._id,
        organizationId: clientOrganizationId,
        action: "rfq.demo_seeded",
        entityType: "rfq",
        entityId: rfqId,
        summary: `Demo RFQ seeded: ${input.marker}`,
        createdAt: input.createdAt
      });
      return { rfqId, lineItemIds };
    }

    async function insertAssignment(input: { rfqId: Id<"rfqs">; status: SeedAssignmentStatus; createdAt: number; responseDeadline: number }) {
      return await ctx.db.insert("supplierRfqAssignments", {
        rfqId: input.rfqId,
        supplierOrganizationId,
        status: input.status,
        responseDeadline: input.responseDeadline,
        createdAt: input.createdAt,
        updatedAt: input.createdAt + 60 * 60 * 1000
      });
    }

    async function insertQuote(input: {
      rfqId: Id<"rfqs">;
      status: SeedQuoteStatus;
      leadTimeDays: number;
      validUntil: string;
      supportsPartialFulfillment: boolean;
      createdAt: number;
      marginPercent?: number;
      lineItems: Array<{ rfqLineItemId: Id<"rfqLineItems">; supplierUnitPrice: number; quantity: number }>;
    }) {
      const quoteId = await ctx.db.insert("supplierQuotes", {
        rfqId: input.rfqId,
        supplierOrganizationId,
        submittedByUserId: supplierUser._id,
        status: input.status,
        leadTimeDays: input.leadTimeDays,
        validUntil: input.validUntil,
        supportsPartialFulfillment: input.supportsPartialFulfillment,
        createdAt: input.createdAt,
        updatedAt: input.createdAt + 60 * 60 * 1000
      });
      const factor = typeof input.marginPercent === "number" ? 1 + input.marginPercent / 100 : undefined;
      for (const item of input.lineItems) {
        const supplierTotalPrice = item.supplierUnitPrice * item.quantity;
        await ctx.db.insert("supplierQuoteLineItems", {
          quoteId,
          rfqLineItemId: item.rfqLineItemId,
          supplierUnitPrice: item.supplierUnitPrice,
          supplierTotalPrice,
          clientFinalUnitPrice: factor ? item.supplierUnitPrice * factor : undefined,
          clientFinalTotalPrice: factor ? supplierTotalPrice * factor : undefined,
          createdAt: input.createdAt,
          updatedAt: input.createdAt + 60 * 60 * 1000
        });
      }
      if (typeof input.marginPercent === "number") {
        await ctx.db.insert("marginOverrides", {
          quoteId,
          adjustedByUserId: adminUser._id,
          previousMarginPercent: 0,
          newMarginPercent: input.marginPercent,
          reason: "Demo seed margin",
          createdAt: input.createdAt + 30 * 60 * 1000
        });
      }
      await ctx.db.insert("auditLogs", {
        actorUserId: supplierUser._id,
        organizationId: supplierOrganizationId,
        action: "quote.demo_seeded",
        entityType: "supplierQuote",
        entityId: quoteId,
        summary: `Demo quote seeded with status ${input.status}`,
        createdAt: input.createdAt
      });
      return quoteId;
    }

    const officeCategoryId = await upsertCategory({ nameAr: "تجهيزات مكتبية", nameEn: "Office Equipment" });
    const technologyCategoryId = await upsertCategory({ nameAr: "تقنية المعلومات", nameEn: "Information Technology" });
    const chairId = await upsertProduct({
      categoryId: officeCategoryId,
      sku: "MWRD-DEMO-CHAIR-001",
      nameAr: "كرسي عمل مريح",
      nameEn: "Ergonomic Task Chair",
      descriptionAr: "كرسي مكتبي شبكي قابل للتعديل للاختبار التجريبي.",
      descriptionEn: "Adjustable mesh office chair for demo procurement flows.",
      specificationsAr: "ظهر شبكي، دعم قطني، ضمان سنتين",
      specificationsEn: "Mesh back, lumbar support, two-year warranty",
      packTypes: ["Each", "Box of 2"],
      defaultUnit: "Each"
    });
    const laptopId = await upsertProduct({
      categoryId: technologyCategoryId,
      sku: "MWRD-DEMO-LAPTOP-001",
      nameAr: "حاسوب محمول للأعمال",
      nameEn: "Business Laptop",
      descriptionAr: "حاسوب محمول مخصص لفرق المشتريات وتقنية المعلومات.",
      descriptionEn: "Business laptop for procurement and IT teams.",
      specificationsAr: "ذاكرة 16GB، تخزين 512GB، شاشة 14 بوصة",
      specificationsEn: "16GB RAM, 512GB SSD, 14-inch display",
      packTypes: ["Each"],
      defaultUnit: "Each"
    });
    const printerId = await upsertProduct({
      categoryId: technologyCategoryId,
      sku: "MWRD-DEMO-PRINTER-001",
      nameAr: "طابعة مكتبية متعددة الوظائف",
      nameEn: "Multifunction Office Printer",
      descriptionAr: "طابعة مكتبية متعددة الوظائف للطلبات التجريبية.",
      descriptionEn: "Multifunction office printer for demo RFQs.",
      specificationsAr: "طباعة ومسح ضوئي وشبكة لاسلكية",
      specificationsEn: "Print, scan, copy, and wireless network",
      packTypes: ["Each"],
      defaultUnit: "Each"
    });

    async function upsertMarginRule(input: {
      name: string;
      categoryId?: Id<"categories">;
      clientOrganizationId?: Id<"organizations">;
      marginPercent: number;
    }) {
      const existing = (await ctx.db
        .query("marginRules")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .take(100))
        .find((rule) => rule.name === input.name);
      const payload = {
        categoryId: input.categoryId,
        clientOrganizationId: input.clientOrganizationId,
        marginPercent: input.marginPercent,
        isActive: true,
        updatedAt: now
      };
      if (existing) {
        await ctx.db.patch(existing._id, payload);
        return existing._id;
      }
      return await ctx.db.insert("marginRules", {
        name: input.name,
        createdAt: now,
        ...payload
      });
    }

    await upsertMarginRule({
      name: "Demo default marketplace margin",
      marginPercent: 12
    });
    await upsertMarginRule({
      name: "Demo IT client-category margin",
      categoryId: technologyCategoryId,
      clientOrganizationId,
      marginPercent: 15
    });

    async function upsertSupplierOffer(input: {
      productId: Id<"products">;
      supplierSku: string;
      packType: string;
      minOrderQuantity: number;
      unitCost: number;
      leadTimeDays: number;
      autoQuoteEnabled: boolean;
      status: "pendingApproval" | "approved";
    }) {
      const existing = await ctx.db
        .query("supplierOffers")
        .withIndex("by_product_supplier", (q) => q.eq("productId", input.productId).eq("supplierOrganizationId", supplierOrganizationId))
        .first();
      const payload = {
        supplierSku: input.supplierSku,
        packType: input.packType,
        minOrderQuantity: input.minOrderQuantity,
        unitCost: input.unitCost,
        leadTimeDays: input.leadTimeDays,
        autoQuoteEnabled: input.autoQuoteEnabled,
        reviewWindowMinutes: 30,
        status: input.status,
        submittedAt: atDays(-9),
        approvedAt: input.status === "approved" ? atDays(-8) : undefined,
        updatedAt: atDays(-8)
      };
      if (existing) {
        await ctx.db.patch(existing._id, payload);
        return existing._id;
      }
      return await ctx.db.insert("supplierOffers", {
        productId: input.productId,
        supplierOrganizationId,
        createdByUserId: supplierUser._id,
        createdAt: atDays(-10),
        ...payload
      });
    }

    await upsertSupplierOffer({
      productId: chairId,
      supplierSku: "SUP-CHAIR-MESH-01",
      packType: "each",
      minOrderQuantity: 5,
      unitCost: 390,
      leadTimeDays: 8,
      autoQuoteEnabled: true,
      status: "approved"
    });
    await upsertSupplierOffer({
      productId: laptopId,
      supplierSku: "SUP-LAPTOP-BIZ-14",
      packType: "each",
      minOrderQuantity: 2,
      unitCost: 3750,
      leadTimeDays: 12,
      autoQuoteEnabled: true,
      status: "pendingApproval"
    });

    const existingProductRequest = (await ctx.db
      .query("productAdditionRequests")
      .withIndex("by_supplier_updated_at", (q) => q.eq("supplierOrganizationId", supplierOrganizationId))
      .take(50))
      .find((request) => request.sku === "SUP-DEMO-DESK-001");
    if (!existingProductRequest) {
      await ctx.db.insert("productAdditionRequests", {
        supplierOrganizationId,
        requestedByUserId: supplierUser._id,
        categoryId: officeCategoryId,
        sku: "SUP-DEMO-DESK-001",
        nameAr: "مكتب عمل قابل للتعديل",
        nameEn: "Adjustable Work Desk",
        specificationsAr: "ارتفاع قابل للتعديل، سطح 140 سم",
        specificationsEn: "Adjustable height, 140cm worktop",
        packType: "each",
        status: "pending",
        createdAt: atDays(-6),
        updatedAt: atDays(-6)
      });
    }

    const completed = await insertRfq({
      status: "poGenerated",
      marker: "DEMO_SEED_COMPLETED_ORDER",
      requiredDeliveryDate: dateAtDays(-25),
      department: "IT",
      branch: "Riyadh HQ",
      costCenter: "CC-110",
      notes: "Approved order with receipt confirmation for report testing.",
      createdAt: atDays(-45),
      lineItems: [
        { productId: laptopId, quantity: 8, unit: "each" },
        { productId: chairId, quantity: 12, unit: "each" }
      ]
    });
    await insertAssignment({ rfqId: completed.rfqId, status: "accepted", createdAt: atDays(-44), responseDeadline: atDays(-42) });
    const completedQuoteId = await insertQuote({
      rfqId: completed.rfqId,
      status: "selected",
      leadTimeDays: 14,
      validUntil: dateAtDays(20),
      supportsPartialFulfillment: true,
      createdAt: atDays(-42),
      marginPercent: 15,
      lineItems: [
        { rfqLineItemId: completed.lineItemIds[0], supplierUnitPrice: 3800, quantity: 8 },
        { rfqLineItemId: completed.lineItemIds[1], supplierUnitPrice: 420, quantity: 12 }
      ]
    });
    const demoTransactionRef = `MWRD-TXN-DEMO-${Math.floor(atDays(-39))}`;
    const completedPoId = await ctx.db.insert("purchaseOrders", {
      rfqId: completed.rfqId,
      selectedQuoteId: completedQuoteId,
      clientOrganizationId,
      status: "sentToSupplier" as SeedPoStatus,
      type: "cpo",
      transactionRef: demoTransactionRef,
      termsTemplateId: "MWRD-DEMO-STANDARD",
      approvedAt: atDays(-38),
      createdAt: atDays(-39),
      updatedAt: atDays(-38)
    });
    const completedSpoId = await ctx.db.insert("purchaseOrders", {
      rfqId: completed.rfqId,
      selectedQuoteId: completedQuoteId,
      clientOrganizationId,
      status: "sentToSupplier" as SeedPoStatus,
      type: "spo",
      transactionRef: demoTransactionRef,
      linkedPurchaseOrderId: completedPoId,
      termsTemplateId: "MWRD-DEMO-STANDARD",
      approvedAt: atDays(-38),
      createdAt: atDays(-39),
      updatedAt: atDays(-38)
    });
    await ctx.db.patch(completedPoId, { linkedPurchaseOrderId: completedSpoId });
    await ctx.db.insert("approvalTasks", {
      purchaseOrderId: completedPoId,
      approverUserId: clientUser._id,
      orderInChain: 0,
      status: "approved",
      decidedAt: atDays(-38),
      createdAt: atDays(-39),
      updatedAt: atDays(-38)
    });
    const completedOrderId = await ctx.db.insert("orders", {
      purchaseOrderId: completedSpoId,
      clientOrganizationId,
      supplierOrganizationId,
      status: "receiptConfirmed" as SeedOrderStatus,
      createdAt: atDays(-38),
      updatedAt: atDays(-26)
    });
    await ctx.db.insert("orderStatusEvents", {
      orderId: completedOrderId,
      status: "delivered",
      actorUserId: supplierUser._id,
      notes: "Demo delivery completed before required date.",
      createdAt: atDays(-27)
    });
    await ctx.db.insert("orderStatusEvents", {
      orderId: completedOrderId,
      status: "receiptConfirmed",
      actorUserId: clientUser._id,
      notes: "Demo client confirmed receipt.",
      createdAt: atDays(-26)
    });

    // Demo DN/GRN/Invoice for the completed order so the three-way match
    // queue and downstream invoice screens have realistic data on first run.
    const demoDnId = await ctx.db.insert("deliveryNotes", {
      spoId: completedSpoId,
      cpoId: completedPoId,
      transactionRef: demoTransactionRef,
      dnNumber: `MWRD-DN-${Math.floor(atDays(-29))}`,
      courier: "Aramex",
      trackingNumber: "ARMX-DEMO-001",
      dispatchDate: dateAtDays(-29),
      expectedDeliveryDate: dateAtDays(-26),
      createdByUserId: supplierUser._id,
      createdAt: atDays(-29),
      updatedAt: atDays(-29)
    });
    for (const lineItemId of completed.lineItemIds) {
      await ctx.db.insert("deliveryNoteItems", {
        deliveryNoteId: demoDnId,
        rfqLineItemId: lineItemId,
        qtyDispatched: 8,
        createdAt: atDays(-29)
      });
    }
    const demoGrnId = await ctx.db.insert("goodsReceiptNotes", {
      cpoId: completedPoId,
      deliveryNoteId: demoDnId,
      transactionRef: demoTransactionRef,
      grnNumber: `MWRD-GRN-${Math.floor(atDays(-26))}`,
      receivedByUserId: clientUser._id,
      receivedAt: atDays(-26),
      createdAt: atDays(-26),
      updatedAt: atDays(-26)
    });
    for (const lineItemId of completed.lineItemIds) {
      await ctx.db.insert("goodsReceiptNoteItems", {
        grnId: demoGrnId,
        rfqLineItemId: lineItemId,
        qtyReceived: 8,
        condition: "ok",
        createdAt: atDays(-26)
      });
    }
    const demoInvoiceSubtotal = 35000;
    const demoInvoiceVat = Math.round(demoInvoiceSubtotal * 0.15 * 100) / 100;
    const demoInvoiceTotal = demoInvoiceSubtotal + demoInvoiceVat;
    const demoInvoiceId = await ctx.db.insert("invoices", {
      cpoId: completedPoId,
      grnId: demoGrnId,
      transactionRef: demoTransactionRef,
      invoiceNumber: `MWRD-INV-${Math.floor(atDays(-25))}`,
      subtotalSar: demoInvoiceSubtotal,
      vatAmountSar: demoInvoiceVat,
      totalSar: demoInvoiceTotal,
      status: "issued",
      issueDate: dateAtDays(-25),
      dueDate: dateAtDays(5),
      createdByUserId: adminUser._id,
      createdAt: atDays(-25),
      updatedAt: atDays(-25)
    });
    await ctx.db.insert("invoiceVarianceSummaries", {
      invoiceId: demoInvoiceId,
      cpoId: completedPoId,
      grnId: demoGrnId,
      poTotalSar: demoInvoiceTotal,
      grnTotalSar: demoInvoiceTotal,
      invoiceTotalSar: demoInvoiceTotal,
      variancePct: 0,
      withinTolerance: true,
      updatedAt: atDays(-25)
    });

    const released = await insertRfq({
      status: "released",
      marker: "DEMO_SEED_RELEASED_QUOTES",
      requiredDeliveryDate: dateAtDays(12),
      department: "Facilities",
      branch: "Jeddah Branch",
      costCenter: "CC-220",
      notes: "Released quote group ready for client comparison.",
      createdAt: atDays(-14),
      lineItems: [
        { productId: chairId, quantity: 25, unit: "each" },
        { productId: printerId, quantity: 2, unit: "each" }
      ]
    });
    await insertAssignment({ rfqId: released.rfqId, status: "accepted", createdAt: atDays(-13), responseDeadline: atDays(-11) });
    await insertQuote({
      rfqId: released.rfqId,
      status: "released",
      leadTimeDays: 9,
      validUntil: dateAtDays(18),
      supportsPartialFulfillment: false,
      createdAt: atDays(-11),
      marginPercent: 12,
      lineItems: [
        { rfqLineItemId: released.lineItemIds[0], supplierUnitPrice: 395, quantity: 25 },
        { rfqLineItemId: released.lineItemIds[1], supplierUnitPrice: 1450, quantity: 2 }
      ]
    });

    const adminReview = await insertRfq({
      status: "adminReview",
      marker: "DEMO_SEED_ADMIN_REVIEW",
      requiredDeliveryDate: dateAtDays(21),
      department: "Operations",
      branch: "Dammam Branch",
      costCenter: "CC-330",
      notes: "Submitted supplier quote awaiting admin pricing decision.",
      createdAt: atDays(-5),
      lineItems: [{ productId: printerId, quantity: 4, unit: "each" }]
    });
    await insertAssignment({ rfqId: adminReview.rfqId, status: "accepted", createdAt: atDays(-4), responseDeadline: atDays(3) });
    await insertQuote({
      rfqId: adminReview.rfqId,
      status: "submitted",
      leadTimeDays: 7,
      validUntil: dateAtDays(15),
      supportsPartialFulfillment: true,
      createdAt: atDays(-3),
      lineItems: [{ rfqLineItemId: adminReview.lineItemIds[0], supplierUnitPrice: 1325, quantity: 4 }]
    });

    const openAssignment = await insertRfq({
      status: "assigned",
      marker: "DEMO_SEED_OPEN_ASSIGNMENT",
      requiredDeliveryDate: dateAtDays(30),
      department: "Finance",
      branch: "Riyadh HQ",
      costCenter: "CC-140",
      notes: "Open supplier assignment for inbox testing.",
      createdAt: atDays(-2),
      lineItems: [{ productId: laptopId, quantity: 3, unit: "each" }]
    });
    await insertAssignment({ rfqId: openAssignment.rfqId, status: "assigned", createdAt: atDays(-1), responseDeadline: atDays(4) });

    await insertRfq({
      status: "submitted",
      marker: "DEMO_SEED_SUBMITTED_TRIAGE",
      requiredDeliveryDate: dateAtDays(25),
      department: "HR",
      branch: "Riyadh HQ",
      costCenter: "CC-170",
      notes: "Fresh submitted RFQ for admin matching workflow.",
      createdAt: atDays(-1),
      lineItems: [{ productId: chairId, quantity: 6, unit: "each" }]
    });

    await ctx.db.insert("notifications", {
      recipientUserId: adminUser._id,
      type: "demo.seed.ready",
      titleAr: "بيانات تجريبية جاهزة",
      titleEn: "Demo data ready",
      bodyAr: "تم إنشاء بيانات تجريبية لاختبار بوابات الإدارة والعميل والمورد.",
      bodyEn: "Demo workflow data is ready for admin, client, and supplier portal testing.",
      createdAt: now
    });

    return {
      skipped: false,
      rfqsCreated: 5,
      productsReady: 3
    };
  }
});

export const _seedLoadTestBatch = internalMutation({
  args: {
    runLabel: v.string(),
    batchIndex: v.number(),
    batchSize: v.number(),
    clientCount: v.number(),
    supplierCount: v.number()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const batchSize = boundedInteger(args.batchSize, 25, 1, 50);
    const clientCount = boundedInteger(args.clientCount, 3, 1, 25);
    const supplierCount = boundedInteger(args.supplierCount, 5, 1, 50);
    const startIndex = Math.max(0, Math.floor(args.batchIndex)) * batchSize;
    const dateFromTimestamp = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

    async function findAdminUser() {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "admin@mwrd.local"))
        .unique();
      if (!user) {
        throw new Error("Run seedDevelopmentData before seeding load-test data.");
      }
      return user;
    }

    async function ensureLoadOrgAndUser(input: {
      type: "client" | "supplier";
      index: number;
    }) {
      const anonymousId = input.type === "client" ? loadId("LOAD-CLIENT", input.index) : loadId("LOAD-SUPPLIER", input.index);
      const existingOrg = input.type === "client"
        ? await ctx.db
          .query("organizations")
          .withIndex("by_client_anonymous_id", (q) => q.eq("clientAnonymousId", anonymousId))
          .first()
        : await ctx.db
          .query("organizations")
          .withIndex("by_supplier_anonymous_id", (q) => q.eq("supplierAnonymousId", anonymousId))
          .first();
      const orgId = existingOrg?._id ?? await ctx.db.insert("organizations", {
        type: input.type,
        name: input.type === "client" ? `Load Client ${input.index + 1}` : `Load Supplier ${input.index + 1}`,
        clientAnonymousId: input.type === "client" ? anonymousId : undefined,
        supplierAnonymousId: input.type === "supplier" ? anonymousId : undefined,
        status: "active",
        defaultLanguage: "en",
        createdAt: now,
        updatedAt: now
      });

      if (existingOrg) {
        await ctx.db.patch(existingOrg._id, {
          status: "active",
          updatedAt: now
        });
      }

      const email = `load-${input.type}-${String(input.index + 1).padStart(3, "0")}@mwrd.local`;
      const existingUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      const roles = input.type === "client" ? ["orgAdmin", "procurementManager"] as const : ["supplierAdmin", "quotationOfficer"] as const;
      const userId = existingUser?._id ?? await ctx.db.insert("users", {
        organizationId: orgId,
        email,
        name: input.type === "client" ? `Load Client User ${input.index + 1}` : `Load Supplier User ${input.index + 1}`,
        roles: [...roles],
        language: "en",
        status: "active",
        createdAt: now,
        updatedAt: now
      });

      if (existingUser) {
        await ctx.db.patch(existingUser._id, {
          organizationId: orgId,
          roles: [...roles],
          status: "active",
          updatedAt: now
        });
      }

      return { organizationId: orgId, userId };
    }

    async function ensureCategory() {
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_updated_at")
        .order("desc")
        .take(500);
      const found = existing.find((category) => category.nameEn === "Load Test Supplies");
      if (found) {
        await ctx.db.patch(found._id, {
          isActive: true,
          updatedAt: now
        });
        return found._id;
      }
      return await ctx.db.insert("categories", {
        parentCategoryId: undefined,
        nameAr: "مستلزمات اختبار الحمل",
        nameEn: "Load Test Supplies",
        isActive: true,
        createdAt: now,
        updatedAt: now
      });
    }

    async function ensureProduct(categoryId: Id<"categories">, index: number) {
      const sku = `MWRD-LOAD-${String(index + 1).padStart(3, "0")}`;
      const existing = await ctx.db
        .query("products")
        .withIndex("by_sku", (q) => q.eq("sku", sku))
        .first();
      const payload = {
        categoryId,
        sku,
        nameAr: `بند اختبار ${index + 1}`,
        nameEn: `Load Test Item ${index + 1}`,
        descriptionAr: "بند مخصص لاختبار قابلية التوسع.",
        descriptionEn: "Synthetic item for load testing procurement flows.",
        specificationsAr: "مواصفات قياسية لاختبار الحمل",
        specificationsEn: "Standard load-test specification",
        packTypes: ["Each"],
        defaultUnit: "Each",
        lifecycleStatus: "active" as const,
        masterProductCode: `MWRD-PROD-LOAD-${String(index + 1).padStart(5, "0")}`,
        isVisible: true,
        updatedAt: now
      };
      if (existing) {
        await ctx.db.patch(existing._id, payload);
        return existing._id;
      }
      return await ctx.db.insert("products", {
        ...payload,
        createdAt: now
      });
    }

    const adminUser = await findAdminUser();
    const clients = [];
    const suppliers = [];
    for (let index = 0; index < clientCount; index++) {
      clients.push(await ensureLoadOrgAndUser({ type: "client", index }));
    }
    for (let index = 0; index < supplierCount; index++) {
      suppliers.push(await ensureLoadOrgAndUser({ type: "supplier", index }));
    }

    const categoryId = await ensureCategory();
    const products = [];
    for (let index = 0; index < 8; index++) {
      products.push(await ensureProduct(categoryId, index));
    }

    const orderStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "receiptConfirmed", "completed", "delayed", "disputed"] as const;
    let createdRfqs = 0;
    let createdOrders = 0;

    for (let offset = 0; offset < batchSize; offset++) {
      const globalIndex = startIndex + offset;
      const client = clients[globalIndex % clients.length];
      const supplier = suppliers[globalIndex % suppliers.length];
      const createdAt = now - ((globalIndex % 180) + 1) * DAY_MS - (globalIndex % 9) * HOUR_MS;
      const approvedAt = createdAt + 2 * DAY_MS;
      const orderUpdatedAt = Math.min(now - HOUR_MS, approvedAt + ((globalIndex % 21) + 1) * DAY_MS);
      const requiredDeliveryDate = dateFromTimestamp(createdAt + ((globalIndex % 18) + 10) * DAY_MS);
      const lineItemCount = 1 + (globalIndex % 3);
      const marker = `LOAD_TEST:${args.runLabel}:${globalIndex}`;

      const rfqId = await ctx.db.insert("rfqs", {
        clientOrganizationId: client.organizationId,
        createdByUserId: client.userId,
        status: "poGenerated",
        requiredDeliveryDate,
        department: ["IT", "Finance", "Operations", "Facilities"][globalIndex % 4],
        branch: ["Riyadh HQ", "Jeddah", "Dammam", "Makkah"][globalIndex % 4],
        costCenter: `CC-${100 + (globalIndex % 20)}`,
        notes: marker,
        isNonCatalog: false,
        createdAt,
        updatedAt: approvedAt
      });
      createdRfqs++;

      const rfqLineItemIds: Array<{ id: Id<"rfqLineItems">; quantity: number; unitPrice: number }> = [];
      for (let lineIndex = 0; lineIndex < lineItemCount; lineIndex++) {
        const quantity = 1 + ((globalIndex + lineIndex) % 12);
        const unitPrice = 120 + ((globalIndex + lineIndex) % 30) * 17;
        const productId = products[(globalIndex + lineIndex) % products.length];
        const lineItemId = await ctx.db.insert("rfqLineItems", {
          rfqId,
          productId,
          quantity,
          unit: "each",
          createdAt
        });
        rfqLineItemIds.push({ id: lineItemId, quantity, unitPrice });
      }

      await ctx.db.insert("supplierRfqAssignments", {
        rfqId,
        supplierOrganizationId: supplier.organizationId,
        status: "accepted",
        responseDeadline: createdAt + 3 * DAY_MS,
        createdAt: createdAt + HOUR_MS,
        updatedAt: createdAt + 2 * HOUR_MS
      });

      const quoteId = await ctx.db.insert("supplierQuotes", {
        rfqId,
        supplierOrganizationId: supplier.organizationId,
        submittedByUserId: supplier.userId,
        status: "selected",
        leadTimeDays: 3 + (globalIndex % 15),
        validUntil: dateFromTimestamp(now + 30 * DAY_MS),
        supportsPartialFulfillment: globalIndex % 2 === 0,
        createdAt: createdAt + 2 * HOUR_MS,
        updatedAt: approvedAt - HOUR_MS
      });

      const marginPercent = 8 + (globalIndex % 10);
      for (const item of rfqLineItemIds) {
        const supplierTotalPrice = item.unitPrice * item.quantity;
        const clientFinalUnitPrice = item.unitPrice * (1 + marginPercent / 100);
        await ctx.db.insert("supplierQuoteLineItems", {
          quoteId,
          rfqLineItemId: item.id,
          supplierUnitPrice: item.unitPrice,
          supplierTotalPrice,
          clientFinalUnitPrice,
          clientFinalTotalPrice: clientFinalUnitPrice * item.quantity,
          createdAt: createdAt + 2 * HOUR_MS,
          updatedAt: approvedAt - HOUR_MS
        });
      }

      await ctx.db.insert("marginOverrides", {
        quoteId,
        adjustedByUserId: adminUser._id,
        previousMarginPercent: 0,
        newMarginPercent: marginPercent,
        reason: "Load-test generated margin",
        createdAt: approvedAt - 2 * HOUR_MS
      });

      const transactionRef = `MWRD-TXN-LOAD-${approvedAt}-${globalIndex}`;
      const purchaseOrderId = await ctx.db.insert("purchaseOrders", {
        rfqId,
        selectedQuoteId: quoteId,
        clientOrganizationId: client.organizationId,
        status: "sentToSupplier",
        type: "cpo",
        transactionRef,
        termsTemplateId: "MWRD-LOAD-STANDARD",
        approvedAt,
        createdAt: approvedAt - DAY_MS,
        updatedAt: approvedAt
      });
      const spoId = await ctx.db.insert("purchaseOrders", {
        rfqId,
        selectedQuoteId: quoteId,
        clientOrganizationId: client.organizationId,
        status: "sentToSupplier",
        type: "spo",
        transactionRef,
        linkedPurchaseOrderId: purchaseOrderId,
        termsTemplateId: "MWRD-LOAD-STANDARD",
        approvedAt,
        createdAt: approvedAt - DAY_MS,
        updatedAt: approvedAt
      });
      await ctx.db.patch(purchaseOrderId, { linkedPurchaseOrderId: spoId });

      await ctx.db.insert("approvalTasks", {
        purchaseOrderId,
        approverUserId: client.userId,
        orderInChain: 0,
        status: "approved",
        decidedAt: approvedAt,
        createdAt: approvedAt - DAY_MS,
        updatedAt: approvedAt
      });

      const status = orderStatuses[globalIndex % orderStatuses.length];
      const orderId = await ctx.db.insert("orders", {
        purchaseOrderId: spoId,
        clientOrganizationId: client.organizationId,
        supplierOrganizationId: supplier.organizationId,
        status,
        createdAt: approvedAt,
        updatedAt: orderUpdatedAt
      });
      createdOrders++;

      if (status === "delivered" || status === "receiptConfirmed" || status === "completed") {
        await ctx.db.insert("orderStatusEvents", {
          orderId,
          status: "delivered",
          actorUserId: supplier.userId,
          notes: "Load-test delivery event.",
          createdAt: Math.max(approvedAt + DAY_MS, orderUpdatedAt - DAY_MS)
        });
      }
      if (status === "receiptConfirmed" || status === "completed") {
        await ctx.db.insert("orderStatusEvents", {
          orderId,
          status: "receiptConfirmed",
          actorUserId: client.userId,
          notes: "Load-test receipt confirmation.",
          createdAt: orderUpdatedAt
        });
      }
      if (status === "completed") {
        await ctx.db.insert("orderStatusEvents", {
          orderId,
          status: "completed",
          actorUserId: client.userId,
          notes: "Load-test completion.",
          createdAt: orderUpdatedAt
        });
      }

      await refreshPurchaseOrderAnalytics(ctx, purchaseOrderId);
      await refreshSupplierAnalyticsForOrder(ctx, orderId);
    }

    return {
      batchIndex: args.batchIndex,
      createdRfqs,
      createdOrders,
      clientCount,
      supplierCount
    };
  }
});

export const seedDevelopmentData = action({
  args: {},
  handler: async (ctx): Promise<{ accounts: { portal: string; email: string; password: string }[]; demoData: DemoSeedResult }> => {
    const created: { portal: string; email: string; password: string }[] = [];

    for (const account of DEMO_ACCOUNTS) {
      await ctx.runMutation(internal.seed._ensureOrgAndUser, {
        portal: account.portal,
        orgName: account.orgName,
        anonymousId: "anonymousId" in account ? account.anonymousId : undefined,
        email: account.email,
        name: account.name,
        roles: [...account.roles]
      });

      const auth = createAuth(ctx);
      const authCtx = await auth.$context;
      const existing = await authCtx.internalAdapter.findUserByEmail(account.email, { includeAccounts: true });

      const authUser =
        existing?.user ??
        (await authCtx.internalAdapter.createUser({
          email: account.email,
          name: account.name,
          emailVerified: true
        }));
      const hashed = await authCtx.password.hash(DEMO_PASSWORD);
      const credentialAccount = existing?.accounts?.find((entry) => entry.providerId === "credential");
      if (credentialAccount?.id) {
        await authCtx.internalAdapter.updateAccount(credentialAccount.id, { password: hashed });
      } else {
        await authCtx.internalAdapter.linkAccount({
          userId: authUser.id,
          providerId: "credential",
          accountId: authUser.id,
          password: hashed
        });
      }

      created.push({
        portal: account.portal,
        email: account.email,
        password: DEMO_PASSWORD
      });
    }

    const demoData = await ctx.runMutation(internal.seed._seedDemoWorkflowData, {}) as DemoSeedResult;

    return { accounts: created, demoData };
  }
});

export const seedLoadTestData = action({
  args: {
    rfqCount: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    clientCount: v.optional(v.number()),
    supplierCount: v.optional(v.number()),
    runLabel: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    for (const account of DEMO_ACCOUNTS) {
      await ctx.runMutation(internal.seed._ensureOrgAndUser, {
        portal: account.portal,
        orgName: account.orgName,
        anonymousId: "anonymousId" in account ? account.anonymousId : undefined,
        email: account.email,
        name: account.name,
        roles: [...account.roles]
      });
    }

    const rfqCount = boundedInteger(args.rfqCount, 250, 1, 5000);
    const batchSize = boundedInteger(args.batchSize, 25, 1, 50);
    const clientCount = boundedInteger(args.clientCount, 3, 1, 25);
    const supplierCount = boundedInteger(args.supplierCount, 5, 1, 50);
    const runLabel = args.runLabel?.trim() || `load-${Date.now()}`;
    const batches = Math.ceil(rfqCount / batchSize);
    let createdRfqs = 0;
    let createdOrders = 0;

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const remaining = rfqCount - batchIndex * batchSize;
      const currentBatchSize = Math.min(batchSize, remaining);
      const result: { createdRfqs: number; createdOrders: number } = await ctx.runMutation(internal.seed._seedLoadTestBatch, {
        runLabel,
        batchIndex,
        batchSize: currentBatchSize,
        clientCount,
        supplierCount
      });
      createdRfqs += result.createdRfqs;
      createdOrders += result.createdOrders;
    }

    return {
      runLabel,
      batches,
      createdRfqs,
      createdOrders,
      clientCount,
      supplierCount,
      batchSize
    };
  }
});

// Slice 23: 200+ realistic master products seed
const MASTER_PRODUCT_GROUPS = [
  { catAr: "تجهيزات مكتبية", catEn: "Office Equipment", items: [
    ["OFF-001","كرسي مكتبي مريح","Ergonomic Chair","Adjustable mesh office chair","Mesh back, lumbar support, 2yr warranty",["Each"],"Each"],
    ["OFF-002","مكتب قابل للتعديل","Height-Adjustable Desk","Electric sit-stand desk","140×70cm, electric, memory presets",["Each"],"Each"],
    ["OFF-003","خزانة ملفات","Filing Cabinet","4-drawer steel filing cabinet","A4 lateral, lockable, grey",["Each"],"Each"],
    ["OFF-004","رف مكتبي","Office Bookshelf","5-shelf bookcase","Steel frame, 180×90×35cm",["Each"],"Each"],
    ["OFF-005","لوحة بيضاء","Magnetic Whiteboard","Porcelain magnetic whiteboard","120×90cm, aluminium frame",["Each"],"Each"],
    ["OFF-006","حامل شاشة","Dual Monitor Arm","VESA monitor arm mount","VESA 75/100, 6kg per arm",["Each"],"Each"],
    ["OFF-007","مصباح مكتبي LED","LED Desk Lamp","Dimmable LED desk lamp","10W, 3000–6500K, USB charging",["Each"],"Each"],
    ["OFF-008","سلة مهملات","Waste Bin 30L","30L office waste bin","Polypropylene, pedal-operated",["Each","Box of 5"],"Each"],
    ["OFF-009","حاجز خصوصية","Desk Privacy Screen","Acrylic desk divider","60×40cm, clear acrylic",["Each"],"Each"],
    ["OFF-010","لوحة عروض قلاّبة","Flipchart Easel","Adjustable presentation easel","Aluminium, folds flat",["Each"],"Each"],
    ["OFF-011","حامل وثائق","Document Stand","Adjustable document holder","A4/A3, anti-glare",["Each"],"Each"],
    ["OFF-012","صندوق بريد داخلي","Desktop Inbox Tray","3-tier wire desk tray","Steel wire, black, A4",["Each"],"Each"],
    ["OFF-013","حاوية أقلام","Pen Holder","Desktop pen & pencil holder","Mesh steel, black",["Each","Box of 6"],"Each"],
    ["OFF-014","آلة تدمير ورق","Paper Shredder P4","Cross-cut paper shredder","P4 security, 12 sheets, 22L bin",["Each"],"Each"],
    ["OFF-015","آلة ختم","Electric Stapler","Heavy-duty electric stapler","120 sheets, jam-free, 5000 staples",["Each"],"Each"]
  ]},
  { catAr: "تقنية المعلومات", catEn: "Information Technology", items: [
    ["IT-001","حاسوب محمول للأعمال","Business Laptop 14\"","Enterprise laptop","i7, 16GB, 512GB NVMe, FHD",["Each"],"Each"],
    ["IT-002","شاشة QHD 27\"","27\" QHD Monitor","IPS QHD display","2560×1440, 75Hz, HDMI/DP",["Each"],"Each"],
    ["IT-003","طابعة ليزرية","Laser MFP Printer","Mono multifunction laser","35ppm, duplex, network",["Each"],"Each"],
    ["IT-004","نقطة وصول Wi-Fi 6","Wi-Fi 6 Access Point","Enterprise wireless AP","802.11ax, PoE, dual-band",["Each"],"Each"],
    ["IT-005","محوّل 24 منفذ","24-Port Managed Switch","Layer 2 managed switch","24×GbE, 4×SFP, rack-mount",["Each"],"Each"],
    ["IT-006","خادم برج","Tower Server","Entry-level tower server","Xeon E-2300, 32GB ECC, 2×2TB",["Each"],"Each"],
    ["IT-007","جهاز NAS","NAS Storage Appliance","4-bay network storage","2×GbE, RAID 0/1/5/6",["Each"],"Each"],
    ["IT-008","كاميرا مؤتمرات","Video Conference Camera","4K PTZ conferencing camera","4K, 12× optical zoom, USB/HDMI",["Each"],"Each"],
    ["IT-009","هاتف IP مكتبي","IP Desk Phone","VoIP office telephone","6 SIP, PoE, colour display",["Each"],"Each"],
    ["IT-010","ذاكرة خادم 32GB","Server RAM 32GB DDR5","ECC registered DIMM","DDR5-4800 ECC RDIMM",["Each","Box of 4"],"Each"],
    ["IT-011","كابل شبكة Cat6 2m","Cat6 Patch Cable 2m","Cat6 ethernet patch cable","2m, RJ45, 10Gbps, LSZH",["Each","Box of 50"],"Each"],
    ["IT-012","محرك USB 128GB","USB Flash Drive 128GB","USB 3.2 flash drive","128GB, USB 3.2 Gen 1, metal",["Each","Box of 10"],"Each"],
    ["IT-013","لوحة مفاتيح لاسلكية","Wireless Keyboard & Mouse","Wireless keyboard and mouse combo","2.4GHz, quiet keys, 12m range",["Each"],"Each"],
    ["IT-014","رأس طباعة حرارية","Thermal Label Printer","Desktop label printer","203dpi, USB, up to 108mm wide",["Each"],"Each"],
    ["IT-015","وحدة KVM 8 منافذ","8-Port KVM Switch","8-port KVM switch","USB, HDMI, hotkey switching",["Each"],"Each"],
    ["IT-016","شاشة 32\" 4K","32\" 4K UHD Monitor","IPS 4K display","3840×2160, 60Hz, USB-C 65W",["Each"],"Each"],
    ["IT-017","محوّل DisplayPort","DisplayPort to HDMI Adapter","DP to HDMI adapter","4K@60Hz, passive, gold-plated",["Each","Box of 10"],"Each"],
    ["IT-018","هاتف ذكي عمل","Enterprise Smartphone","Android business smartphone","6.1\", 5G, 128GB, MDM-ready",["Each"],"Each"]
  ]},
  { catAr: "قرطاسية ومستلزمات", catEn: "Stationery & Supplies", items: [
    ["STA-001","ورق طباعة A4 80gsm","A4 Copy Paper 80gsm","Premium white copy paper","80gsm, 500 sheets/ream",["Ream","Box of 5"],"Ream"],
    ["STA-002","أقلام جافة زرقاء","Blue Ballpoint Pens","Medium-tip ballpoint pens","0.7mm, box of 50",["Box of 12","Box of 50"],"Box of 50"],
    ["STA-003","دفاتر A5","A5 Notebooks","Lined softcover notebooks","80 pages, 5mm ruling",["Each","Box of 10"],"Each"],
    ["STA-004","أقلام سبورة","Whiteboard Markers","Dry-erase markers","Assorted 12 colours, chisel",["Box of 12"],"Box of 12"],
    ["STA-005","مشابك ورق 25mm","Binder Clips 25mm","Medium binder clips","Box of 100",["Box of 100"],"Box of 100"],
    ["STA-006","دبابيس تدبيس","Staples 26/6","Standard staples","1000/strip, 5000/box",["Box of 5000"],"Box of 5000"],
    ["STA-007","ملفات ورقية","Manila File Folders","A4 manila folders","Buff, box of 100",["Box of 100"],"Box of 100"],
    ["STA-008","ملاحظات لاصقة 76mm","Sticky Notes 76×76mm","Repositionable notes","100 sheets, 12 pads, yellow",["Pack of 12"],"Pack of 12"],
    ["STA-009","أقلام تظليل","Highlighters Assorted","Fluorescent highlighters","5 colours, box of 10 sets",["Box of 10"],"Box of 10"],
    ["STA-010","أظرف A4","A4 Envelopes","Plain white envelopes","Self-seal, box of 250",["Box of 250"],"Box of 250"],
    ["STA-011","مقصات مكتبية","Office Scissors 21cm","Stainless steel scissors","21cm, soft-grip",["Each","Box of 12"],"Each"],
    ["STA-012","غراء دهاني","Glue Stick 40g","Washable glue stick","40g, acid-free, box of 24",["Each","Box of 24"],"Each"],
    ["STA-013","ورق ملوّن A4","Coloured Copy Paper A4","80gsm coloured copy paper","Assorted 5 colours, 500 sheets",["Ream"],"Ream"],
    ["STA-014","شرائط لاصقة","Clear Adhesive Tape 19mm","Transparent adhesive tape","19mm×33m, 12 rolls/pack",["Pack of 12"],"Pack of 12"],
    ["STA-015","مثقاب ورق","2-Hole Punch","Heavy-duty paper punch","2-hole, 30 sheets, metal",["Each"],"Each"]
  ]},
  { catAr: "نظافة وتعقيم", catEn: "Cleaning & Hygiene", items: [
    ["CLN-001","منظف متعدد الأسطح 5L","Multi-Surface Cleaner 5L","Professional cleaner refill","Antibacterial, fragrance-free",["Each","Case of 4"],"Each"],
    ["CLN-002","معقم يدين 500ml","Hand Sanitiser 500ml","70% alcohol sanitiser","500ml pump, WHO formula",["Each","Case of 12"],"Each"],
    ["CLN-003","مناشف ورقية","Paper Hand Towels","Interleaved paper towels","2-ply, 150/pack, 20/case",["Pack","Case of 20"],"Pack"],
    ["CLN-004","ورق تواليت","Toilet Paper 2-Ply","Premium toilet paper","400 sheets, 48 rolls/case",["Case of 48"],"Case of 48"],
    ["CLN-005","أكياس قمامة 80L","Bin Liners 80L","Heavy-duty bin liners","80L, black HDPE, 50/roll",["Roll of 50","Box of 10 rolls"],"Roll of 50"],
    ["CLN-006","مبيد جراثيم 1L","Surface Disinfectant 1L","Ready-to-use disinfectant","Kills 99.9%, trigger spray",["Each","Case of 6"],"Each"],
    ["CLN-007","قفازات فحص لاتكس M","Latex Gloves Medium","Disposable latex gloves","Powder-free, 100/box",["Box of 100","Case of 10"],"Box of 100"],
    ["CLN-008","منظف زجاج","Glass Cleaner 750ml","Streak-free glass cleaner","750ml trigger spray",["Each","Case of 12"],"Each"],
    ["CLN-009","مسحوق غسيل 10kg","Laundry Powder 10kg","Commercial laundry powder","Low-foam, 10kg",["Each"],"Each"],
    ["CLN-010","معطر هواء","Air Freshener Spray 300ml","Room air freshener","300ml aerosol",["Each","Case of 12"],"Each"]
  ]},
  { catAr: "السلامة والصحة المهنية", catEn: "Safety & PPE", items: [
    ["PPE-001","خوذة سلامة","Safety Helmet Class A","Construction hard hat","ANSI Z89.1, Class A, yellow",["Each"],"Each"],
    ["PPE-002","حذاء سلامة","Safety Boots S3","Steel toe-cap safety boots","S3 SRC, steel toe",["Pair"],"Pair"],
    ["PPE-003","نظارات واقية","Safety Glasses Clear","Anti-scratch safety specs","EN166, clear polycarbonate",["Each","Box of 10"],"Each"],
    ["PPE-004","سترة عاكسة","Hi-Vis Vest Class 2","High-visibility safety vest","Class 2, EN ISO 20471, yellow",["Each"],"Each"],
    ["PPE-005","قفازات مقاومة للقطع","Cut-Resistant Gloves L","Level 5 cut-resistant gloves","EN388:2016 level 5",["Pair","Box of 12 pairs"],"Pair"],
    ["PPE-006","قناع N95","N95 Respirator Mask","Disposable N95 respirator","NIOSH N95, box of 20",["Box of 20"],"Box of 20"],
    ["PPE-007","حذاء علوي عاكس","Hi-Vis Rain Jacket","High-visibility rain jacket","Class 3, EN471, XS–4XL",["Each"],"Each"],
    ["PPE-008","خرطوم أوكسجين","Emergency Eye Wash","Portable eye wash station","ANSI Z358.1, 18L",["Each"],"Each"]
  ]},
  { catAr: "الأثاث", catEn: "Furniture", items: [
    ["FRN-001","طاولة اجتماعات 240cm","Conference Table 240cm","Oval conference table","240×110cm, seats 10",["Each"],"Each"],
    ["FRN-002","كرسي زوار","Visitor Chair","Upholstered visitor chair","Fabric, chrome legs, stackable",["Each","Set of 4"],"Each"],
    ["FRN-003","خزانة شخصية","Steel Storage Locker","6-door personal locker","Individual locks, 180×90×45cm",["Each"],"Each"],
    ["FRN-004","حاجز مكتبي","Office Partition 120cm","Acoustic office partition","120×150cm, fabric panel",["Each"],"Each"],
    ["FRN-005","رف صناعي ثقيل","Industrial Storage Rack","Heavy-duty shelving","5 shelves, 300kg/shelf",["Each"],"Each"],
    ["FRN-006","أريكة استقبال","Reception Sofa 3-Seater","Modern reception sofa","3-seater, PU leather",["Each"],"Each"],
    ["FRN-007","خزانة معدات","Equipment Trolley","Mobile AV/equipment cart","3 shelves, lockable, castors",["Each"],"Each"],
    ["FRN-008","طاولة نبيذية","Side Table","End table for lounge area","Powder-coated steel, 50cm round",["Each"],"Each"]
  ]},
  { catAr: "الكهرباء والإضاءة", catEn: "Electrical & Lighting", items: [
    ["ELC-001","لمبة LED E27 10W","LED Bulb E27 10W","Energy-saving LED","4000K, 1000lm, 25,000h",["Each","Box of 10"],"Each"],
    ["ELC-002","أنبوب LED T8 18W","LED Tube T8 18W","Replacement fluorescent LED","18W, 4000K, 1800lm, 30,000h",["Each","Box of 25"],"Each"],
    ["ELC-003","وصلة 6 مآخذ","6-Way Power Strip 2m","Surge-protected power strip","6 outlets, 2m, 2500W",["Each"],"Each"],
    ["ELC-004","UPS 1000VA","UPS 1000VA/600W","Uninterruptible power supply","8 outlets, LCD, USB",["Each"],"Each"],
    ["ELC-005","كاميرا IP 4MP","4MP IP Security Camera","Outdoor PoE IP camera","4MP, IR 30m, IP67, PoE",["Each"],"Each"],
    ["ELC-006","لوحة شمسية 200W","Solar Panel 200W","Monocrystalline solar panel","200W, IP68, 25yr warranty",["Each"],"Each"],
    ["ELC-007","بطارية UPS 12V 7Ah","UPS Replacement Battery","Sealed lead-acid battery","12V 7Ah, maintenance-free",["Each","Box of 4"],"Each"]
  ]},
  { catAr: "مستلزمات الطباعة", catEn: "Print Consumables", items: [
    ["PRT-001","خرطوشة حبر سوداء HY","Toner Cartridge Black HY","High-yield black toner","10,000 pages",["Each"],"Each"],
    ["PRT-002","خرطوشة حبر سيان HY","Toner Cartridge Cyan HY","High-yield cyan toner","5,000 pages, ISO 19798",["Each"],"Each"],
    ["PRT-003","خرطوشة حبر أصفر HY","Toner Cartridge Yellow HY","High-yield yellow toner","5,000 pages, ISO 19798",["Each"],"Each"],
    ["PRT-004","خرطوشة حبر أرجواني HY","Toner Cartridge Magenta HY","High-yield magenta toner","5,000 pages, ISO 19798",["Each"],"Each"],
    ["PRT-005","ورق صور لامع A4","Glossy Photo Paper A4","High-gloss inkjet paper","200gsm, 50 sheets",["Pack of 50"],"Pack of 50"],
    ["PRT-006","وحدة تصوير","Drum Imaging Unit","Replacement drum unit","30,000 pages yield",["Each"],"Each"],
    ["PRT-007","ملصقات A4","A4 Label Sheets","Self-adhesive label sheets","White, 21/sheet, 100 sheets",["Pack of 100"],"Pack of 100"],
    ["PRT-008","حبر طابعة ألوان","Ink Cartridge Colour Tri-Pack","Colour inkjet cartridge pack","Cyan/magenta/yellow, ISO 24711",["Pack of 3"],"Pack of 3"]
  ]},
  { catAr: "مناولة المواد", catEn: "Materials Handling", items: [
    ["MHE-001","عربة نقل يدوية","Hand Truck 300kg","Steel folding hand truck","300kg, rubber wheels",["Each"],"Each"],
    ["MHE-002","رافعة يدوية 2T","Manual Pallet Jack 2T","Hydraulic pallet jack","2,000kg, forks 1150×550mm",["Each"],"Each"],
    ["MHE-003","شريط تغليف","Packing Tape 48mm×50m","Strong brown packing tape","Acrylic adhesive, 36/case",["Roll","Case of 36"],"Roll"],
    ["MHE-004","ورق فقاعي 500mm","Bubble Wrap 500mm×50m","Small-bubble protective wrap","500mm wide, 10mm bubbles",["Roll"],"Roll"],
    ["MHE-005","صندوق تخزين 50L","Plastic Storage Box 50L","Stackable storage crate","50L, HDPE, 60×40×33cm",["Each","Pallet of 48"],"Each"],
    ["MHE-006","تسمية رف باركود","Barcode Shelf Label","Adhesive shelf label","50×25mm, thermal, 500/roll",["Roll of 500"],"Roll of 500"]
  ]},
  { catAr: "ضيافة ومقاصف", catEn: "Catering & Hospitality", items: [
    ["CAT-001","ماكينة قهوة مكتبية","Office Coffee Machine","Bean-to-cup coffee maker","15-bar, 1.8L tank, 1450W",["Each"],"Each"],
    ["CAT-002","كبسولات قهوة","Coffee Capsules Espresso","Compatible espresso pods","10/sleeve, medium roast",["Sleeve of 10","Box of 100"],"Box of 100"],
    ["CAT-003","برّاد مياه","Water Dispenser Hot/Cold","Bottleless water dispenser","Hot/cold/ambient, plumbed-in",["Each"],"Each"],
    ["CAT-004","أكواب ورقية 8oz","Paper Cups 8oz","Hot-drink paper cups","8oz, 1000/case",["Sleeve of 50","Case of 1000"],"Case of 1000"],
    ["CAT-005","ثلاجة مكتب 60L","Compact Office Fridge 60L","Under-counter mini fridge","60L, A+, reversible door",["Each"],"Each"],
    ["CAT-006","مغسلة صحون كهربائية","Commercial Dishwasher","Undercounter dishwasher","40 cycles/hr, 230V, 2.9kW",["Each"],"Each"],
    ["CAT-007","غلاية كهربائية 1.7L","Electric Kettle 1.7L","Stainless steel kettle","1.7L, 3kW, auto cut-off",["Each"],"Each"]
  ]}
];

export const _seedMasterProductCatalog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let categoryCount = 0;
    let productCount = 0;
    let skippedCount = 0;
    let productCounter = (await ctx.db.query("products").collect()).length;

    for (const group of MASTER_PRODUCT_GROUPS) {
      const allCategories = await ctx.db.query("categories").collect();
      const existingCat = allCategories.find((c) => c.nameEn === group.catEn);
      const categoryId = existingCat
        ? existingCat._id
        : await ctx.db.insert("categories", {
            parentCategoryId: undefined,
            nameAr: group.catAr,
            nameEn: group.catEn,
            isActive: true,
            createdAt: now,
            updatedAt: now
          });
      if (!existingCat) categoryCount++;

      for (const item of group.items) {
        const [sku, nameAr, nameEn, descriptionEn, specificationsEn, packTypes, defaultUnit] = item as [string, string, string, string, string, string[], string];
        const existing = await ctx.db
          .query("products")
          .withIndex("by_sku", (q) => q.eq("sku", sku))
          .first();
        if (existing) { skippedCount++; continue; }
        productCounter++;
        await ctx.db.insert("products", {
          categoryId,
          sku,
          masterProductCode: `MWRD-PROD-${String(productCounter).padStart(5, "0")}`,
          nameAr,
          nameEn,
          descriptionAr: nameAr,
          descriptionEn,
          specificationsAr: specificationsEn,
          specificationsEn,
          packTypes,
          defaultUnit,
          lifecycleStatus: "active",
          isVisible: true,
          createdAt: now,
          updatedAt: now
        });
        productCount++;
      }
    }

    return { categoryCount, productCount, skippedCount, totalProducts: productCounter };
  }
});

export const seedMasterProducts = action({
  args: {},
  handler: async (ctx) => {
    return await ctx.runMutation(internal.seed._seedMasterProductCatalog, {});
  }
});
