type Role =
  | "superAdmin"
  | "operationsManager"
  | "pricingAnalyst"
  | "accountManager"
  | "catalogManager"
  | "reportingAnalyst"
  | "orgAdmin"
  | "procurementManager"
  | "procurementOfficer"
  | "requester"
  | "financeApprover"
  | "departmentHead"
  | "supplierAdmin"
  | "quotationOfficer"
  | "operationsOfficer"
  | "viewer";

type Permission =
  | "organization:create"
  | "organization:update"
  | "user:invite"
  | "catalog:manage"
  | "rfq:create"
  | "rfq:submit"
  | "quote:submit"
  | "quote:apply_margin"
  | "quote:release"
  | "order:update_status"
  | "delivery:confirm"
  | "audit:view";

type UserLike = {
  roles: Role[];
  status: "active" | "invited" | "suspended";
  organizationId: unknown;
};

const rolePermissionMatrix = {
  superAdmin: ["organization:create", "organization:update", "user:invite", "catalog:manage", "rfq:create", "rfq:submit", "quote:submit", "quote:apply_margin", "quote:release", "order:update_status", "delivery:confirm", "audit:view"],
  operationsManager: ["organization:update", "rfq:submit", "audit:view"],
  pricingAnalyst: ["quote:apply_margin", "quote:release", "audit:view"],
  accountManager: ["organization:create", "organization:update", "user:invite", "audit:view"],
  catalogManager: ["catalog:manage", "audit:view"],
  reportingAnalyst: ["audit:view"],
  orgAdmin: ["user:invite", "rfq:create", "rfq:submit", "delivery:confirm"],
  procurementManager: ["rfq:create", "rfq:submit", "delivery:confirm"],
  procurementOfficer: ["rfq:create", "rfq:submit"],
  requester: ["rfq:create", "rfq:submit"],
  financeApprover: ["delivery:confirm"],
  departmentHead: ["delivery:confirm"],
  supplierAdmin: ["user:invite", "quote:submit", "order:update_status"],
  quotationOfficer: ["quote:submit"],
  operationsOfficer: ["order:update_status"],
  viewer: []
} satisfies Record<Role, readonly Permission[]>;

export function assertActiveUser(user: UserLike | null) {
  if (!user || user.status !== "active") {
    throw new Error("Active authenticated user is required.");
  }

  return user;
}

export function hasPermission(roles: readonly Role[], permission: Permission) {
  return roles.some((role) => (rolePermissionMatrix[role] as readonly Permission[]).includes(permission));
}

export function hasAnyPermission(roles: readonly Role[], permissions: readonly Permission[]) {
  return permissions.some((permission) => hasPermission(roles, permission));
}

export function assertHasPermission(user: UserLike, permission: Permission) {
  if (!hasPermission(user.roles, permission)) {
    throw new Error(`Missing required permission: ${permission}`);
  }
}

export function assertHasAnyPermission(user: UserLike, permissions: readonly Permission[]) {
  if (!hasAnyPermission(user.roles, permissions)) {
    throw new Error(`Missing one of required permissions: ${permissions.join(", ")}`);
  }
}

export function assertSameOrganization(user: UserLike, organizationId: unknown) {
  if (user.roles.includes("superAdmin")) {
    return;
  }

  if (user.organizationId !== organizationId) {
    throw new Error("Cross-organization access is not allowed.");
  }
}
