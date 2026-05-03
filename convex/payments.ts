import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { lookupIdempotentResult, recordIdempotentResult } from "./idempotency";
import { assertWithinRateLimit, RATE_LIMIT_POLICIES } from "./rateLimits";
import { assertActiveUser, assertHasPermission } from "./rbac";

const PAYMENT_PROVIDER = "moyasar";

const paymentStatus = v.union(
  v.literal("pending"),
  v.literal("authorized"),
  v.literal("captured"),
  v.literal("refunded"),
  v.literal("failed")
);

function mockChargeId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `${PAYMENT_PROVIDER}_charge_${Date.now()}_${random}`;
}

export const createPaymentIntent = mutation({
  args: {
    actorUserId: v.id("users"),
    invoiceEntityType: v.string(),
    invoiceEntityId: v.string(),
    amountSar: v.number(),
    description: v.optional(v.string()),
    idempotencyKey: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "po:approve");

    if (args.amountSar <= 0) {
      throw new Error("Payment amount must be greater than zero.");
    }

    if (args.idempotencyKey) {
      const cached = await lookupIdempotentResult(
        ctx,
        args.actorUserId,
        "payment.intent_create",
        args.idempotencyKey
      );
      if (cached !== undefined) {
        return {
          provider: PAYMENT_PROVIDER,
          chargeId: cached?.entityId ?? mockChargeId(),
          status: "pending" as const,
          amountSar: args.amountSar,
          replayed: true
        };
      }
    }

    await assertWithinRateLimit(ctx, args.actorUserId, RATE_LIMIT_POLICIES.paymentIntentCreate);

    const chargeId = mockChargeId();
    const now = Date.now();

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: actor.organizationId as Id<"organizations">,
      action: "payment.intent_created",
      entityType: args.invoiceEntityType,
      entityId: args.invoiceEntityId,
      summary: `Created Moyasar payment intent ${chargeId} for ${args.amountSar.toFixed(2)} SAR`,
      createdAt: now
    });

    if (args.idempotencyKey) {
      await recordIdempotentResult(ctx, {
        actorUserId: args.actorUserId,
        action: "payment.intent_create",
        key: args.idempotencyKey,
        resultEntityType: "moyasarCharge",
        resultEntityId: chargeId
      });
    }

    return {
      provider: PAYMENT_PROVIDER,
      chargeId,
      status: "pending" as const,
      amountSar: args.amountSar,
      replayed: false
    };
  }
});

export const capturePayment = mutation({
  args: {
    actorUserId: v.id("users"),
    chargeId: v.string(),
    invoiceEntityType: v.string(),
    invoiceEntityId: v.string()
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "po:approve");

    if (!args.chargeId.startsWith(`${PAYMENT_PROVIDER}_charge_`)) {
      throw new Error("Charge id is not a recognized Moyasar charge.");
    }

    const now = Date.now();
    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: actor.organizationId as Id<"organizations">,
      action: "payment.captured",
      entityType: args.invoiceEntityType,
      entityId: args.invoiceEntityId,
      summary: `Captured Moyasar charge ${args.chargeId}`,
      createdAt: now
    });

    return {
      provider: PAYMENT_PROVIDER,
      chargeId: args.chargeId,
      status: "captured" as const,
      capturedAt: now
    };
  }
});

export const refundPayment = mutation({
  args: {
    actorUserId: v.id("users"),
    chargeId: v.string(),
    invoiceEntityType: v.string(),
    invoiceEntityId: v.string(),
    amountSar: v.optional(v.number()),
    reason: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "po:approve");

    if (!args.chargeId.startsWith(`${PAYMENT_PROVIDER}_charge_`)) {
      throw new Error("Charge id is not a recognized Moyasar charge.");
    }
    if (args.amountSar !== undefined && args.amountSar <= 0) {
      throw new Error("Refund amount must be greater than zero.");
    }

    const now = Date.now();
    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: actor.organizationId as Id<"organizations">,
      action: "payment.refunded",
      entityType: args.invoiceEntityType,
      entityId: args.invoiceEntityId,
      summary: args.reason
        ? `Refunded Moyasar charge ${args.chargeId}: ${args.reason}`
        : `Refunded Moyasar charge ${args.chargeId}`,
      createdAt: now
    });

    return {
      provider: PAYMENT_PROVIDER,
      chargeId: args.chargeId,
      status: "refunded" as const,
      amountSar: args.amountSar,
      refundedAt: now
    };
  }
});

// Re-export the validator so future invoice tables can use the shared union.
export { paymentStatus };
