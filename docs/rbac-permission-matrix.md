# RBAC Permission Matrix

This document tracks the Phase 1 role and permission baseline for MWRD. It mirrors `src/lib/permissions.ts` and should be updated before changing access behavior.

## Rules

- Convex functions must enforce these permissions server-side before returning or mutating data.
- UI guards only improve UX and are not a security boundary.
- The shared `viewer` role is scoped by organization portal. A supplier viewer cannot access the client portal and a client viewer cannot access the supplier portal.
- `superAdmin` is the only cross-portal role for MWRD operator oversight.
- Client and supplier views must use anonymous IDs across party boundaries.

## Portal Access

| Portal | Access permission | Roles |
|---|---|---|
| Admin | `portal:admin:access` | `superAdmin`, `operationsManager`, `pricingAnalyst`, `accountManager`, `catalogManager`, `reportingAnalyst` |
| Client | `portal:client:access` | `superAdmin`, `orgAdmin`, `procurementManager`, `procurementOfficer`, `requester`, `financeApprover`, `departmentHead`, `viewer` |
| Supplier | `portal:supplier:access` | `superAdmin`, `supplierAdmin`, `quotationOfficer`, `operationsOfficer`, `viewer` |

## Workflow Permissions

| Area | Permissions | Primary roles |
|---|---|---|
| Organizations | `organization:create`, `organization:update`, `organization:suspend` | `superAdmin`, `accountManager`, selected admin operators |
| Users | `user:invite`, `user:manage_roles` | `superAdmin`, `accountManager`, `orgAdmin`, `supplierAdmin` |
| Catalog | `catalog:view`, `catalog:manage` | client buyers can view; `catalogManager` and `superAdmin` manage |
| Client RFQ | `rfq:create`, `rfq:submit`, `rfq:view_own` | `orgAdmin`, `procurementManager`, `procurementOfficer`, `requester` |
| Admin RFQ Ops | `rfq:manage_operations`, `rfq:assign_suppliers` | `superAdmin`, `operationsManager` |
| Supplier RFQ | `supplier_rfq:view_assigned`, `supplier_rfq:respond` | `supplierAdmin`, `quotationOfficer`, selected supplier operations roles |
| Quotes | `quote:submit`, `quote:review`, `quote:apply_margin`, `quote:release`, `quote:compare`, `quote:select` | suppliers submit; admins review/release; clients compare/select |
| Purchase Orders | `po:generate`, `po:approve` | client procurement and approver roles |
| Orders | `order:view_own`, `order:update_status`, `delivery:confirm` | client and supplier operational roles |
| Governance | `audit:view`, `analytics:view` | admin operators, org admins, reporting roles |

## Implementation Status

- Frontend role matrix: implemented in `src/lib/permissions.ts`.
- Portal guard uses role permissions and organization portal in `src/routes/protected-route.tsx`.
- Language preference is now routed through the auth session context and persisted locally as the temporary Phase 1 browser fallback.
- `convex/auth.ts` exposes the current authenticated app user by matching the Better Auth/Convex identity email to the MWRD `users` table. The React auth provider consumes that query when `VITE_CONVEX_URL` is configured and falls back to the local demo session otherwise.
- Convex mutation enforcement has started in `convex/rbac.ts` and the current organization, user, catalog, RFQ, quote, and order mutations.
