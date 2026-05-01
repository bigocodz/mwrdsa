import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
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

    async function upsertProduct(input: {
      categoryId: Id<"categories">;
      sku: string;
      nameAr: string;
      nameEn: string;
      descriptionAr: string;
      descriptionEn: string;
      specificationsAr: string;
      specificationsEn: string;
    }) {
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
          isVisible: true,
          updatedAt: now
        });
        return existing._id;
      }
      return await ctx.db.insert("products", {
        ...input,
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
      specificationsEn: "Mesh back, lumbar support, two-year warranty"
    });
    const laptopId = await upsertProduct({
      categoryId: technologyCategoryId,
      sku: "MWRD-DEMO-LAPTOP-001",
      nameAr: "حاسوب محمول للأعمال",
      nameEn: "Business Laptop",
      descriptionAr: "حاسوب محمول مخصص لفرق المشتريات وتقنية المعلومات.",
      descriptionEn: "Business laptop for procurement and IT teams.",
      specificationsAr: "ذاكرة 16GB، تخزين 512GB، شاشة 14 بوصة",
      specificationsEn: "16GB RAM, 512GB SSD, 14-inch display"
    });
    const printerId = await upsertProduct({
      categoryId: technologyCategoryId,
      sku: "MWRD-DEMO-PRINTER-001",
      nameAr: "طابعة مكتبية متعددة الوظائف",
      nameEn: "Multifunction Office Printer",
      descriptionAr: "طابعة مكتبية متعددة الوظائف للطلبات التجريبية.",
      descriptionEn: "Multifunction office printer for demo RFQs.",
      specificationsAr: "طباعة ومسح ضوئي وشبكة لاسلكية",
      specificationsEn: "Print, scan, copy, and wireless network"
    });

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
    const completedPoId = await ctx.db.insert("purchaseOrders", {
      rfqId: completed.rfqId,
      selectedQuoteId: completedQuoteId,
      clientOrganizationId,
      status: "sentToSupplier" as SeedPoStatus,
      termsTemplateId: "MWRD-DEMO-STANDARD",
      approvedAt: atDays(-38),
      createdAt: atDays(-39),
      updatedAt: atDays(-38)
    });
    await ctx.db.insert("approvalInstances", {
      purchaseOrderId: completedPoId,
      status: "approved",
      createdAt: atDays(-39),
      updatedAt: atDays(-38)
    });
    const completedOrderId = await ctx.db.insert("orders", {
      purchaseOrderId: completedPoId,
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
