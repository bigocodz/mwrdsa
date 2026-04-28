import { mutation } from "./_generated/server";

export const seedDevelopmentData = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const adminOrgId = await ctx.db.insert("organizations", {
      type: "admin",
      name: "MWRD",
      status: "active",
      defaultLanguage: "ar",
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("users", {
      organizationId: adminOrgId,
      email: "admin@mwrd.local",
      name: "MWRD Admin",
      roles: ["superAdmin"],
      language: "ar",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    return { adminOrgId };
  }
});
