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

// Slice 25/26: superAdmin:manage permission coverage
describe("superAdmin:manage permission (Slice 25)", () => {
  it("superAdmin role has superAdmin:manage permission", () => {
    expect(hasPermission(["superAdmin"], "superAdmin:manage")).toBe(true);
  });

  it("operationsManager does NOT have superAdmin:manage", () => {
    expect(hasPermission(["operationsManager"], "superAdmin:manage")).toBe(false);
  });

  it("orgAdmin does NOT have superAdmin:manage", () => {
    expect(hasPermission(["orgAdmin"], "superAdmin:manage")).toBe(false);
  });

  it("catalogManager does NOT have superAdmin:manage", () => {
    expect(hasPermission(["catalogManager"], "superAdmin:manage")).toBe(false);
  });

  it("supplierAdmin does NOT have superAdmin:manage", () => {
    expect(hasPermission(["supplierAdmin"], "superAdmin:manage")).toBe(false);
  });
});

// Slice 20/21/22: address book and bundle creation require rfq:create
describe("rfq:create permission covers address/bundle/catalog management (Slice 20-22)", () => {
  it("procurementOfficer can create RFQs (and thus addresses, bundles)", () => {
    expect(hasPermission(["procurementOfficer"], "rfq:create")).toBe(true);
  });

  it("requester can create RFQs (and thus addresses)", () => {
    expect(hasPermission(["requester"], "rfq:create")).toBe(true);
  });

  it("viewer cannot create RFQs or addresses", () => {
    expect(hasPermission(["viewer"], "rfq:create")).toBe(false);
  });

  it("quotationOfficer (supplier-only) cannot create RFQs", () => {
    expect(hasPermission(["quotationOfficer"], "rfq:create")).toBe(false);
  });
});
