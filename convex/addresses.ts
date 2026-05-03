// Slice 20: Address Book
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertActiveUser, assertHasPermission, assertSameOrganization } from "./rbac";

const ADDRESS_LIST_LIMIT = 100;

const addressInput = v.object({
  label: v.string(),
  recipientName: v.string(),
  phone: v.optional(v.string()),
  addressLine1: v.string(),
  addressLine2: v.optional(v.string()),
  city: v.string(),
  region: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  country: v.string(),
  isDefault: v.boolean()
});

export const listAddresses = query({
  args: { actorUserId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_organization_updated_at", (q) =>
        q.eq("organizationId", actor.organizationId as Id<"organizations">)
      )
      .order("desc")
      .take(ADDRESS_LIST_LIMIT);

    return addresses;
  }
});

export const createAddress = mutation({
  args: {
    actorUserId: v.id("users"),
    ...addressInput.fields
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const orgId = actor.organizationId as Id<"organizations">;
    const now = Date.now();

    // If this is marked as default, unset existing default
    if (args.isDefault) {
      const existing = await ctx.db
        .query("addresses")
        .withIndex("by_organization_default", (q) =>
          q.eq("organizationId", orgId).eq("isDefault", true)
        )
        .collect();
      for (const addr of existing) {
        await ctx.db.patch(addr._id, { isDefault: false, updatedAt: now });
      }
    }

    const addressId = await ctx.db.insert("addresses", {
      organizationId: orgId,
      createdByUserId: args.actorUserId,
      label: args.label.trim(),
      recipientName: args.recipientName.trim(),
      phone: args.phone?.trim() || undefined,
      addressLine1: args.addressLine1.trim(),
      addressLine2: args.addressLine2?.trim() || undefined,
      city: args.city.trim(),
      region: args.region?.trim() || undefined,
      postalCode: args.postalCode?.trim() || undefined,
      country: args.country.trim(),
      isDefault: args.isDefault,
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: orgId,
      action: "address.created",
      entityType: "address",
      entityId: addressId,
      summary: `Address "${args.label}" created`,
      createdAt: now
    });

    return addressId;
  }
});

export const updateAddress = mutation({
  args: {
    actorUserId: v.id("users"),
    addressId: v.id("addresses"),
    ...addressInput.fields
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const address = await ctx.db.get(args.addressId);
    if (!address) throw new Error("Address not found.");
    assertSameOrganization(actor, address.organizationId);

    const now = Date.now();

    // If being set as default, unset other defaults
    if (args.isDefault && !address.isDefault) {
      const existing = await ctx.db
        .query("addresses")
        .withIndex("by_organization_default", (q) =>
          q.eq("organizationId", address.organizationId).eq("isDefault", true)
        )
        .collect();
      for (const addr of existing) {
        if (addr._id !== args.addressId) {
          await ctx.db.patch(addr._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    await ctx.db.patch(args.addressId, {
      label: args.label.trim(),
      recipientName: args.recipientName.trim(),
      phone: args.phone?.trim() || undefined,
      addressLine1: args.addressLine1.trim(),
      addressLine2: args.addressLine2?.trim() || undefined,
      city: args.city.trim(),
      region: args.region?.trim() || undefined,
      postalCode: args.postalCode?.trim() || undefined,
      country: args.country.trim(),
      isDefault: args.isDefault,
      updatedAt: now
    });
  }
});

export const deleteAddress = mutation({
  args: {
    actorUserId: v.id("users"),
    addressId: v.id("addresses")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const address = await ctx.db.get(args.addressId);
    if (!address) return;
    assertSameOrganization(actor, address.organizationId);

    await ctx.db.delete(args.addressId);

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: address.organizationId,
      action: "address.deleted",
      entityType: "address",
      entityId: args.addressId,
      summary: `Address "${address.label}" deleted`,
      createdAt: Date.now()
    });
  }
});

export const setDefaultAddress = mutation({
  args: {
    actorUserId: v.id("users"),
    addressId: v.id("addresses")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "rfq:create");

    const address = await ctx.db.get(args.addressId);
    if (!address) throw new Error("Address not found.");
    assertSameOrganization(actor, address.organizationId);

    const now = Date.now();

    const existing = await ctx.db
      .query("addresses")
      .withIndex("by_organization_default", (q) =>
        q.eq("organizationId", address.organizationId).eq("isDefault", true)
      )
      .collect();
    for (const addr of existing) {
      await ctx.db.patch(addr._id, { isDefault: false, updatedAt: now });
    }

    await ctx.db.patch(args.addressId, { isDefault: true, updatedAt: now });
  }
});
