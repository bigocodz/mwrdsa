import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

type StoredResult = { entityType: string; entityId: string } | null;

export async function lookupIdempotentResult(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  action: string,
  key: string
): Promise<StoredResult | undefined> {
  if (!key) return undefined;
  const now = Date.now();
  const existing = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_actor_action_key", (q) =>
      q.eq("actorUserId", actorUserId).eq("action", action).eq("key", key)
    )
    .first();
  if (!existing) return undefined;
  if (existing.expiresAt < now) {
    await ctx.db.delete(existing._id);
    return undefined;
  }
  if (existing.resultEntityType && existing.resultEntityId) {
    return { entityType: existing.resultEntityType, entityId: existing.resultEntityId };
  }
  return null;
}

export async function recordIdempotentResult(
  ctx: MutationCtx,
  args: {
    actorUserId: Id<"users">;
    action: string;
    key: string;
    resultEntityType?: string;
    resultEntityId?: string;
    ttlMs?: number;
  }
) {
  if (!args.key) return;
  const now = Date.now();
  await ctx.db.insert("idempotencyKeys", {
    actorUserId: args.actorUserId,
    action: args.action,
    key: args.key,
    resultEntityType: args.resultEntityType,
    resultEntityId: args.resultEntityId,
    expiresAt: now + (args.ttlMs ?? DEFAULT_TTL_MS),
    createdAt: now
  });
}
