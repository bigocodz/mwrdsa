import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { lookupIdempotentResult, recordIdempotentResult } from "./idempotency";
import { assertActiveUser, assertHasPermission } from "./rbac";
import { assertWithinRateLimit, RATE_LIMIT_POLICIES } from "./rateLimits";

const ACTIVATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const accountType = v.union(v.literal("client"), v.literal("supplier"));

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function generateToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export const publicRegisterRequest = mutation({
  args: {
    accountType,
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    companyName: v.string(),
    language: v.optional(v.union(v.literal("ar"), v.literal("en"))),
    signupIntent: v.optional(v.string()),
    expectedMonthlyVolumeSar: v.optional(v.number()),
    idempotencyKey: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const fullName = args.fullName.trim();
    const email = normalizeEmail(args.email);
    const phone = args.phone.trim();
    const companyName = args.companyName.trim();

    if (!fullName) throw new Error("Full name is required.");
    if (!EMAIL_PATTERN.test(email)) throw new Error("A valid email is required.");
    if (!phone) throw new Error("Phone is required.");
    if (!companyName) throw new Error("Company name is required.");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) {
      throw new Error("An account with that email already exists.");
    }

    const now = Date.now();
    const language = args.language ?? "ar";
    const signupSource = args.accountType === "client" ? "clientForm" : "supplierForm";

    const organizationId = await ctx.db.insert("organizations", {
      type: args.accountType,
      name: companyName,
      status: "pendingCallback",
      defaultLanguage: language,
      signupSource,
      signupIntent: args.signupIntent?.trim() ? args.signupIntent.trim() : undefined,
      expectedMonthlyVolumeSar: args.expectedMonthlyVolumeSar,
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now
    });

    const role = args.accountType === "client" ? "orgAdmin" : "supplierAdmin";
    const userId = await ctx.db.insert("users", {
      organizationId,
      email,
      name: fullName,
      roles: [role],
      language,
      status: "pendingCallback",
      activationStatus: "awaitingCallback",
      phone,
      signupSource,
      createdAt: now,
      updatedAt: now
    });

    if (args.idempotencyKey) {
      const cached = await lookupIdempotentResult(ctx, userId, "auth.public_register", args.idempotencyKey);
      if (cached !== undefined && cached?.entityId) {
        return { userId: cached.entityId as Id<"users">, replayed: true };
      }
    }

    await assertWithinRateLimit(ctx, userId, RATE_LIMIT_POLICIES.publicRegister);

    if (args.idempotencyKey) {
      await recordIdempotentResult(ctx, {
        actorUserId: userId,
        action: "auth.public_register",
        key: args.idempotencyKey,
        resultEntityType: "user",
        resultEntityId: userId
      });
    }

    await ctx.db.insert("auditLogs", {
      organizationId,
      action: "auth.public_register_request",
      entityType: "user",
      entityId: userId,
      summary: `Public ${args.accountType} signup awaiting callback for ${companyName}`,
      createdAt: now
    });

    return { userId, replayed: false };
  }
});

export const markCallbackComplete = mutation({
  args: {
    actorUserId: v.id("users"),
    pendingUserId: v.id("users"),
    notes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "audit:view");

    const pending = await ctx.db.get(args.pendingUserId);
    if (!pending) {
      throw new Error("Pending user not found.");
    }
    if (pending.status !== "pendingCallback") {
      throw new Error("User is not awaiting callback.");
    }

    const now = Date.now();
    const token = generateToken();
    await ctx.db.patch(pending._id, {
      status: "callbackCompleted",
      activationStatus: "callbackCompleted",
      activationToken: token,
      activationTokenExpiresAt: now + ACTIVATION_TOKEN_TTL_MS,
      callbackNotes: args.notes?.trim() ? args.notes.trim() : undefined,
      updatedAt: now
    });

    await ctx.db.patch(pending.organizationId, {
      status: "pendingKyc",
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: pending.organizationId,
      action: "auth.callback_completed",
      entityType: "user",
      entityId: pending._id,
      summary: args.notes?.trim()
        ? `Callback completed for ${pending.email}: ${args.notes.trim()}`
        : `Callback completed for ${pending.email}`,
      createdAt: now
    });

    return { activationToken: token, expiresAt: now + ACTIVATION_TOKEN_TTL_MS };
  }
});

export const lookupActivationToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const trimmed = args.token.trim();
    if (!trimmed) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_activation_token", (q) => q.eq("activationToken", trimmed))
      .unique();
    if (!user) return null;
    if (user.activationStatus !== "callbackCompleted") return null;
    if (!user.activationTokenExpiresAt || user.activationTokenExpiresAt < Date.now()) {
      return null;
    }
    const organization = await ctx.db.get(user.organizationId);
    return {
      email: user.email,
      name: user.name,
      portal: organization?.type ?? null
    };
  }
});

export const completeActivation = mutation({
  args: {
    token: v.string()
  },
  handler: async (ctx, args) => {
    const trimmed = args.token.trim();
    if (!trimmed) throw new Error("Activation token is required.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_activation_token", (q) => q.eq("activationToken", trimmed))
      .unique();
    if (!user) throw new Error("Activation token is not valid.");
    if (user.activationStatus !== "callbackCompleted") {
      throw new Error("Activation is not pending.");
    }
    if (!user.activationTokenExpiresAt || user.activationTokenExpiresAt < Date.now()) {
      throw new Error("Activation token has expired.");
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      status: "pendingKyc",
      activationStatus: "activated",
      activationToken: undefined,
      activationTokenExpiresAt: undefined,
      kycSubmittedAt: now,
      updatedAt: now
    });
    await ctx.db.patch(user.organizationId, {
      status: "pendingKyc",
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      organizationId: user.organizationId,
      action: "auth.activated",
      entityType: "user",
      entityId: user._id,
      summary: `Account activated for ${user.email}`,
      createdAt: now
    });

    return { userId: user._id, email: user.email };
  }
});

export const completeOnboarding = mutation({
  args: {
    actorUserId: v.id("users"),
    crNumber: v.optional(v.string()),
    vatNumber: v.optional(v.string()),
    expectedMonthlyVolumeSar: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));

    const crNumber = args.crNumber?.trim();
    const vatNumber = args.vatNumber?.trim();
    if (!crNumber) throw new Error("Commercial registration number is required.");
    if (!vatNumber) throw new Error("VAT number is required.");

    const organizationId = actor.organizationId as Id<"organizations">;
    const now = Date.now();
    await ctx.db.patch(organizationId, {
      crNumber,
      vatNumber,
      expectedMonthlyVolumeSar: args.expectedMonthlyVolumeSar,
      onboardingCompleted: true,
      updatedAt: now
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId,
      action: "auth.onboarding_completed",
      entityType: "organization",
      entityId: organizationId,
      summary: "First-login onboarding completed",
      createdAt: now
    });

    return organizationId;
  }
});

export const listPendingLeads = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "audit:view");

    const groups = await Promise.all(
      ["pendingCallback" as const, "callbackCompleted" as const].map((status) =>
        ctx.db
          .query("users")
          .withIndex("by_status_updated_at", (q) => q.eq("status", status))
          .order("desc")
          .take(100)
      )
    );
    const merged = groups
      .flat()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 200);

    return await Promise.all(
      merged.map(async (user) => {
        const organization = await ctx.db.get(user.organizationId);
        return {
          _id: user._id,
          email: user.email,
          name: user.name,
          phone: user.phone ?? "",
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          companyName: organization?.name ?? "",
          accountType: organization?.type ?? "client",
          signupSource: user.signupSource ?? null,
          signupIntent: organization?.signupIntent ?? null,
          callbackNotes: user.callbackNotes ?? null
        };
      })
    );
  }
});

export const listPendingKycReviews = query({
  args: {
    actorUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "audit:view");

    const pending = await ctx.db
      .query("users")
      .withIndex("by_status_updated_at", (q) => q.eq("status", "pendingKyc"))
      .order("desc")
      .take(100);

    return await Promise.all(
      pending.map(async (user) => {
        const organization = await ctx.db.get(user.organizationId);
        return {
          _id: user._id,
          email: user.email,
          name: user.name,
          phone: user.phone ?? "",
          updatedAt: user.updatedAt,
          companyName: organization?.name ?? "",
          accountType: organization?.type ?? "client",
          crNumber: organization?.crNumber ?? null,
          vatNumber: organization?.vatNumber ?? null,
          kycSubmittedAt: user.kycSubmittedAt ?? null,
          kycDecision: user.kycDecision ?? null,
          kycDecisionNote: user.kycDecisionNote ?? null,
          kycDocuments:
            user.kycDocuments?.map((doc) => ({
              documentType: doc.documentType,
              status: doc.status,
              submittedAt: doc.submittedAt
            })) ?? []
        };
      })
    );
  }
});

export const decideKycReview = mutation({
  args: {
    actorUserId: v.id("users"),
    pendingUserId: v.id("users"),
    decision: v.union(v.literal("approved"), v.literal("rejected"), v.literal("requestedMore")),
    note: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const actor = assertActiveUser(await ctx.db.get(args.actorUserId));
    assertHasPermission(actor, "audit:view");

    const pending = await ctx.db.get(args.pendingUserId);
    if (!pending) {
      throw new Error("Pending user not found.");
    }
    if (pending.status !== "pendingKyc") {
      throw new Error("User is not awaiting KYC review.");
    }

    const trimmedNote = args.note?.trim();
    if (args.decision !== "approved" && !trimmedNote) {
      throw new Error("A note is required when rejecting or requesting more documents.");
    }

    const now = Date.now();

    if (args.decision === "approved") {
      await ctx.db.patch(pending._id, {
        status: "active",
        kycDecision: "approved",
        kycDecisionNote: trimmedNote,
        kycDecidedAt: now,
        updatedAt: now
      });
      await ctx.db.patch(pending.organizationId, {
        status: "active",
        updatedAt: now
      });
    } else if (args.decision === "rejected") {
      await ctx.db.patch(pending._id, {
        status: "suspended",
        kycDecision: "rejected",
        kycDecisionNote: trimmedNote,
        kycDecidedAt: now,
        updatedAt: now
      });
      await ctx.db.patch(pending.organizationId, {
        status: "suspended",
        updatedAt: now
      });
    } else {
      // requestedMore: keep status pendingKyc, attach reviewer note
      await ctx.db.patch(pending._id, {
        kycDecision: "requestedMore",
        kycDecisionNote: trimmedNote,
        kycDecidedAt: now,
        updatedAt: now
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      organizationId: pending.organizationId,
      action:
        args.decision === "approved"
          ? "kyc.approved"
          : args.decision === "rejected"
            ? "kyc.rejected"
            : "kyc.more_requested",
      entityType: "user",
      entityId: pending._id,
      summary:
        args.decision === "approved"
          ? `KYC approved for ${pending.email}`
          : args.decision === "rejected"
            ? `KYC rejected for ${pending.email}: ${trimmedNote}`
            : `KYC more documents requested for ${pending.email}: ${trimmedNote}`,
      createdAt: now
    });

    return { decision: args.decision };
  }
});
