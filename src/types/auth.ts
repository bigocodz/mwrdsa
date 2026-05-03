export type PortalType = "client" | "supplier" | "admin";

export type AdminRole =
  | "superAdmin"
  | "operationsManager"
  | "pricingAnalyst"
  | "accountManager"
  | "catalogManager"
  | "reportingAnalyst";

export type ClientRole =
  | "orgAdmin"
  | "procurementManager"
  | "procurementOfficer"
  | "requester"
  | "financeApprover"
  | "departmentHead"
  | "viewer";

export type SupplierRole = "supplierAdmin" | "quotationOfficer" | "operationsOfficer" | "viewer";

export type PortalRole = AdminRole | ClientRole | SupplierRole;

export type Permission =
  | "portal:admin:access"
  | "portal:client:access"
  | "portal:supplier:access"
  | "organization:create"
  | "organization:update"
  | "organization:suspend"
  | "user:invite"
  | "user:manage_roles"
  | "catalog:view"
  | "catalog:manage"
  | "rfq:create"
  | "rfq:submit"
  | "rfq:view_own"
  | "rfq:manage_operations"
  | "rfq:assign_suppliers"
  | "supplier_rfq:view_assigned"
  | "supplier_rfq:respond"
  | "quote:submit"
  | "quote:review"
  | "quote:apply_margin"
  | "quote:release"
  | "quote:compare"
  | "quote:select"
  | "po:generate"
  | "po:approve"
  | "order:view_own"
  | "order:update_status"
  | "delivery:confirm"
  | "audit:view"
  | "analytics:view"
  | "superAdmin:manage";
