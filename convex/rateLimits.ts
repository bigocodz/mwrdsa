import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export type RateLimitPolicy = {
  action: string;
  limit: number;
  windowMs: number;
};

export const RATE_LIMIT_POLICIES = {
  publicRegister: { action: "auth.public_register", limit: 5, windowMs: 60 * 60 * 1000 },
  rfqSubmit: { action: "rfq.submit", limit: 30, windowMs: 60 * 60 * 1000 },
  supplierOfferUpsert: { action: "offer.upsert", limit: 200, windowMs: 60 * 60 * 1000 },
  paymentIntentCreate: { action: "payment.intent_create", limit: 30, windowMs: 60 * 60 * 1000 },
  productAdditionRequest: { action: "product.addition_request", limit: 25, windowMs: 60 * 60 * 1000 }
} as const satisfies Record<string, RateLimitPolicy>;

export async function assertWithinRateLimit(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  policy: RateLimitPolicy
) {
  const now = Date.now();
  const windowStart = now - (now % policy.windowMs);
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_actor_action_window", (q) =>
      q.eq("actorUserId", actorUserId).eq("action", policy.action).eq("windowStart", windowStart)
    )
    .first();
  if (existing) {
    if (existing.count >= policy.limit) {
      throw new Error(`Rate limit exceeded for ${policy.action}. Try again later.`);
    }
    await ctx.db.patch(existing._id, { count: existing.count + 1, updatedAt: now });
    return;
  }
  await ctx.db.insert("rateLimits", {
    actorUserId,
    action: policy.action,
    windowStart,
    count: 1,
    updatedAt: now
  });
}
