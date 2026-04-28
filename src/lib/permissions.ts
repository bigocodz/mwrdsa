import type { PortalRole, PortalType } from "@/types/auth";

const portalRoleMap: Record<PortalType, readonly PortalRole[]> = {
  admin: ["superAdmin", "operationsManager", "pricingAnalyst", "accountManager", "catalogManager", "reportingAnalyst"],
  client: ["orgAdmin", "procurementManager", "procurementOfficer", "requester", "financeApprover", "departmentHead", "viewer"],
  supplier: ["supplierAdmin", "quotationOfficer", "operationsOfficer", "viewer"]
};

export function canAccessPortal(portal: PortalType, roles: PortalRole[]) {
  const allowedRoles = portalRoleMap[portal];
  return roles.some((role) => allowedRoles.includes(role));
}

export function getPortalRoles(portal: PortalType) {
  return portalRoleMap[portal];
}
