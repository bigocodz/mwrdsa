import { internalMutation } from "./_generated/server";

const SWEEP_BATCH = 200;

export const sweepExpiredSavedRfqCarts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("savedRfqCarts")
      .withIndex("by_client_expires_at")
      .order("asc")
      .take(SWEEP_BATCH);
    let deleted = 0;
    for (const cart of expired) {
      if (cart.expiresAt <= now) {
        await ctx.db.delete(cart._id);
        deleted++;
      }
    }
    return { deleted };
  }
});

export const sweepExpiredIdempotencyKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("idempotencyKeys")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(SWEEP_BATCH);
    for (const row of expired) {
      await ctx.db.delete(row._id);
    }
    return { deleted: expired.length };
  }
});

export const sweepStaleRateLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const staleCutoff = now - 24 * 60 * 60 * 1000;
    const rows = await ctx.db.query("rateLimits").take(SWEEP_BATCH);
    let deleted = 0;
    for (const row of rows) {
      if (row.windowStart < staleCutoff) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    return { deleted };
  }
});

export const sweepOldMutationMetrics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query("mutationMetrics")
      .withIndex("by_created_at", (q) => q.lt("createdAt", cutoff))
      .take(SWEEP_BATCH);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { deleted: rows.length };
  }
});

