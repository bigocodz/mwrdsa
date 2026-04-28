import { describe, expect, it } from "vitest";
import { canAccessPortal } from "@/lib/permissions";

describe("canAccessPortal", () => {
  it("allows admin roles into the admin portal", () => {
    expect(canAccessPortal("admin", ["superAdmin"])).toBe(true);
  });

  it("blocks supplier-only roles from the client portal", () => {
    expect(canAccessPortal("client", ["supplierAdmin"])).toBe(false);
  });
});
