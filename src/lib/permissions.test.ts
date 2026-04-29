import { describe, expect, it } from "vitest";
import { canAccessPortal, getPermissionsForRoles, hasPermission } from "@/lib/permissions";

describe("canAccessPortal", () => {
  it("allows admin roles into the admin portal", () => {
    expect(canAccessPortal("admin", ["superAdmin"])).toBe(true);
  });

  it("blocks supplier-only roles from the client portal", () => {
    expect(canAccessPortal("client", ["supplierAdmin"], "supplier")).toBe(false);
  });

  it("does not let the shared viewer role cross organization portal boundaries", () => {
    expect(canAccessPortal("client", ["viewer"], "supplier")).toBe(false);
    expect(canAccessPortal("supplier", ["viewer"], "supplier")).toBe(true);
  });

  it("grants client procurement roles RFQ permissions without admin quote release", () => {
    expect(hasPermission(["procurementOfficer"], "rfq:create")).toBe(true);
    expect(hasPermission(["procurementOfficer"], "quote:release")).toBe(false);
  });

  it("grants pricing analysts margin and release permissions", () => {
    expect(hasPermission(["pricingAnalyst"], "quote:apply_margin")).toBe(true);
    expect(hasPermission(["pricingAnalyst"], "quote:release")).toBe(true);
    expect(hasPermission(["pricingAnalyst"], "organization:suspend")).toBe(false);
  });

  it("deduplicates permissions across multiple roles", () => {
    const permissions = getPermissionsForRoles(["orgAdmin", "procurementManager"]);
    expect(permissions.filter((permission) => permission === "portal:client:access")).toHaveLength(1);
  });
});
