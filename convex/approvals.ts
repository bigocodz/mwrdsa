import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";

const MAX_CHAIN_LENGTH = 12;
type ReadCtx = QueryCtx | MutationCtx;

async function getApprovalNode(ctx: ReadCtx, organizationId: Id<"organizations">, memberUserId: Id<"users">) {
  return await ctx.db
    .query("approvalNodes")
    .withIndex("by_organization_member", (q) =>
      q.eq("organizationId", organizationId).eq("memberUserId", memberUserId)
    )
    .unique();
}

export async function computeApprovalChain(
  ctx: ReadCtx,
  organizationId: Id<"organizations">,
  memberUserId: Id<"users">
): Promise<Id<"users">[]> {
  const chain: Id<"users">[] = [];
  const visited = new Set<string>([memberUserId]);
  let current: Id<"users"> | undefined = memberUserId;

  while (current) {
    const node = await getApprovalNode(ctx, organizationId, current);
    const next = node?.directApproverUserId;
    if (!next) break;
    if (visited.has(next)) {
      // Defensive: a cycle would already have been rejected by setDirectApprover,
      // but we stop walking instead of looping forever.
      break;
    }
    chain.push(next);
    visited.add(next);
    current = next;
    if (chain.length >= MAX_CHAIN_LENGTH) break;
  }

  return chain;
}

export const setDirectApprover = mutation({
  args: {
    actorUserId: v.id("users"),
    memberUserId: v.id("users"),
    approverUserId: v.optional(v.id("users"))
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "user:invite");

    const member = await ctx.db.get(args.memberUserId);
    if (!member) {
      throw new Error("Member not found.");
    }
    assertSameOrganization(actor, member.organizationId);

    if (args.approverUserId) {
      if (args.approverUserId === args.memberUserId) {
        throw new Error("A user cannot approve themselves.");
      }
      const approver = await ctx.db.get(args.approverUserId);
      if (!approver) {
        throw new Error("Approver not found.");
      }
      if (approver.organizationId !== member.organizationId) {
        throw new Error("Approver must belong to the same organization.");
      }

      // Cycle detection: walk upward from the proposed approver. If we
      // reach the member, the assignment would create a cycle.
      let cursor: Id<"users"> | undefined = args.approverUserId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === args.memberUserId) {
          throw new Error("Approver chain would create a cycle.");
        }
        if (seen.has(cursor)) {
          throw new Error("Existing approver chain already contains a cycle.");
        }
        seen.add(cursor);
        const upstream = await getApprovalNode(ctx, member.organizationId, cursor);
        cursor = upstream?.directApproverUserId;
      }
    }

    const now = Date.now();
    const existing = await getApprovalNode(ctx, member.organizationId, args.memberUserId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        directApproverUserId: args.approverUserId,
        updatedAt: now
      });
    } else {
      await ctx.db.insert("approvalNodes", {
        organizationId: member.organizationId,
        memberUserId: args.memberUserId,
        directApproverUserId: args.approverUserId,
        createdAt: now,
        updatedAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: member.organizationId,
      action: args.approverUserId ? "approval_node.set" : "approval_node.cleared",
      entityType: "approvalNode",
      entityId: args.memberUserId,
      summary: args.approverUserId
        ? `Direct approver updated for ${member.email}`
        : `Direct approver cleared for ${member.email}`,
      createdAt: now
    });

    return { ok: true };
  }
});

export const listApprovalTreeForActor = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "user:invite");

    const organizationId = actor.organizationId as Id<"organizations">;
    const members = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();

    return await Promise.all(
      members.map(async (member) => {
        const chain = await computeApprovalChain(ctx, organizationId, member._id);
        const node = await getApprovalNode(ctx, organizationId, member._id);
        const approverNames = await Promise.all(
          chain.map(async (id) => {
            const u = await ctx.db.get(id);
            return { _id: id, name: u?.name ?? "—", email: u?.email ?? "—" };
          })
        );
        return {
          _id: member._id,
          name: member.name,
          email: member.email,
          roles: member.roles,
          status: member.status,
          directApproverUserId: node?.directApproverUserId ?? null,
          chain: approverNames,
          chainLength: chain.length
        };
      })
    );
  }
});

export const listApprovalTasksForPurchaseOrder = query({
  args: {
    actorUserId: v.id("users"),
    purchaseOrderId: v.id("purchaseOrders")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const purchaseOrder = await ctx.db.get(args.purchaseOrderId);
    if (!purchaseOrder) return [];
    assertSameOrganization(actor, purchaseOrder.clientOrganizationId);

    const tasks = await ctx.db
      .query("approvalTasks")
      .withIndex("by_po_order", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();
    tasks.sort((a, b) => a.orderInChain - b.orderInChain);

    return await Promise.all(
      tasks.map(async (task) => {
        const approver = await ctx.db.get(task.approverUserId);
        return {
          _id: task._id,
          orderInChain: task.orderInChain,
          status: task.status,
          decidedAt: task.decidedAt ?? null,
          note: task.note ?? null,
          approverUserId: task.approverUserId,
          approverName: approver?.name ?? "—",
          approverEmail: approver?.email ?? "—"
        };
      })
    );
  }
});
