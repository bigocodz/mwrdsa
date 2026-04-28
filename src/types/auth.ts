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
