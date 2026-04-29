import type { Permission, PortalRole, PortalType } from "@/types/auth";

export const rolePermissionMatrix = {
  superAdmin: [
    "portal:admin:access",
    "portal:client:access",
    "portal:supplier:access",
    "organization:create",
    "organization:update",
    "organization:suspend",
    "user:invite",
    "user:manage_roles",
    "catalog:view",
    "catalog:manage",
    "rfq:view_own",
    "rfq:manage_operations",
    "rfq:assign_suppliers",
    "supplier_rfq:view_assigned",
    "quote:review",
    "quote:apply_margin",
    "quote:release",
    "order:view_own",
    "audit:view",
    "analytics:view"
  ],
  operationsManager: ["portal:admin:access", "organization:update", "rfq:manage_operations", "rfq:assign_suppliers", "quote:review", "order:view_own", "audit:view", "analytics:view"],
  pricingAnalyst: ["portal:admin:access", "quote:review", "quote:apply_margin", "quote:release", "audit:view", "analytics:view"],
  accountManager: ["portal:admin:access", "organization:create", "organization:update", "user:invite", "audit:view"],
  catalogManager: ["portal:admin:access", "catalog:view", "catalog:manage", "audit:view"],
  reportingAnalyst: ["portal:admin:access", "analytics:view", "audit:view"],
  orgAdmin: ["portal:client:access", "user:invite", "user:manage_roles", "catalog:view", "rfq:create", "rfq:submit", "rfq:view_own", "quote:compare", "quote:select", "po:generate", "po:approve", "order:view_own", "delivery:confirm", "analytics:view"],
  procurementManager: ["portal:client:access", "catalog:view", "rfq:create", "rfq:submit", "rfq:view_own", "quote:compare", "quote:select", "po:generate", "order:view_own", "delivery:confirm", "analytics:view"],
  procurementOfficer: ["portal:client:access", "catalog:view", "rfq:create", "rfq:submit", "rfq:view_own", "quote:compare", "po:generate", "order:view_own"],
  requester: ["portal:client:access", "catalog:view", "rfq:create", "rfq:submit", "rfq:view_own", "order:view_own"],
  financeApprover: ["portal:client:access", "rfq:view_own", "quote:compare", "po:approve", "order:view_own", "analytics:view"],
  departmentHead: ["portal:client:access", "rfq:view_own", "quote:compare", "po:approve", "order:view_own"],
  supplierAdmin: ["portal:supplier:access", "user:invite", "user:manage_roles", "supplier_rfq:view_assigned", "supplier_rfq:respond", "quote:submit", "order:view_own", "order:update_status", "analytics:view"],
  quotationOfficer: ["portal:supplier:access", "supplier_rfq:view_assigned", "supplier_rfq:respond", "quote:submit"],
  operationsOfficer: ["portal:supplier:access", "supplier_rfq:view_assigned", "order:view_own", "order:update_status"],
  viewer: ["portal:client:access", "portal:supplier:access", "catalog:view", "rfq:view_own", "supplier_rfq:view_assigned", "order:view_own"]
} satisfies Record<PortalRole, readonly Permission[]>;

const portalAccessPermissionMap: Record<PortalType, Permission> = {
  admin: "portal:admin:access",
  client: "portal:client:access",
  supplier: "portal:supplier:access"
};

export function getPermissionsForRoles(roles: readonly PortalRole[]) {
  return Array.from(new Set(roles.flatMap((role) => rolePermissionMatrix[role])));
}

export function hasPermission(roles: readonly PortalRole[], permission: Permission) {
  return getPermissionsForRoles(roles).includes(permission);
}

export function hasEveryPermission(roles: readonly PortalRole[], permissions: readonly Permission[]) {
  return permissions.every((permission) => hasPermission(roles, permission));
}

export function hasAnyPermission(roles: readonly PortalRole[], permissions: readonly Permission[]) {
  return permissions.some((permission) => hasPermission(roles, permission));
}

export function canAccessPortal(portal: PortalType, roles: readonly PortalRole[], organizationType?: PortalType) {
  if (roles.includes("superAdmin")) {
    return true;
  }

  if (organizationType && organizationType !== portal) {
    return false;
  }

  return hasPermission(roles, portalAccessPermissionMap[portal]);
}

export function getPortalRoles(portal: PortalType) {
  return Object.entries(rolePermissionMatrix)
    .filter(([, permissions]) => (permissions as readonly Permission[]).includes(portalAccessPermissionMap[portal]))
    .map(([role]) => role as PortalRole);
}
