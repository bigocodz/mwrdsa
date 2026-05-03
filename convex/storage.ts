import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertActiveUser, assertHasAnyPermission } from "./rbac";

const STORAGE_PROVIDER = "mwrd-mock-storage";
const SIGNED_URL_TTL_MS = 5 * 60 * 1000;

const documentEntityType = v.union(
  v.literal("clientPurchaseOrder"),
  v.literal("supplierPurchaseOrder"),
  v.literal("deliveryNote"),
  v.literal("goodsReceiptNote"),
  v.literal("invoice"),
  v.literal("kycDocument"),
  v.literal("offerImage"),
  v.literal("masterProductImage")
);

function buildMockUrl(entityType: string, entityId: string, expiresAt: number) {
  const token = Math.random().toString(36).slice(2, 14);
  return `https://${STORAGE_PROVIDER}/documents/${entityType}/${entityId}?token=${token}&expires=${expiresAt}`;
}

const ENTITY_PERMISSION_MAP = {
  clientPurchaseOrder: ["rfq:create", "po:approve"],
  supplierPurchaseOrder: ["quote:submit", "order:update_status"],
  deliveryNote: ["quote:submit", "order:update_status", "delivery:confirm"],
  goodsReceiptNote: ["delivery:confirm", "po:approve"],
  invoice: ["po:approve"],
  kycDocument: ["audit:view"],
  offerImage: ["quote:submit", "rfq:create", "catalog:manage"],
  masterProductImage: ["rfq:create", "quote:submit", "catalog:manage"]
} as const;

export const getDocumentDownloadUrl = query({
  args: {
    actorUserId: v.id("users"),
    entityType: documentEntityType,
    entityId: v.string()
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasAnyPermission(actor, ENTITY_PERMISSION_MAP[args.entityType]);

    const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
    return {
      provider: STORAGE_PROVIDER,
      url: buildMockUrl(args.entityType, args.entityId, expiresAt),
      expiresAt
    };
  }
});

export { documentEntityType };
