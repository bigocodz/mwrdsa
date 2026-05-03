# Backend Scale and PRD Implementation Plan

## Goal

Make the MWRD product match the Phase 1 PRD while keeping the backend ready for SaaS growth on Convex. The product should support multiple client, supplier, and admin organizations without cross-tenant leakage, slow portal lists, or live reports that scan the whole database.

## Current Verdict

The product is SaaS-shaped and Convex is a good fit for the operational workflow, but the current MVP code must be hardened before large production data. The main risk is not Convex itself; it is unbounded reads, in-memory filtering, and report queries that calculate large historical metrics synchronously.

## Implementation Principles

- Keep tenant boundaries explicit on every query and mutation.
- Prefer compound indexes that match real portal access patterns.
- Paginate user-facing list views before tables grow.
- Keep live Convex queries focused on operational data.
- Move historical analytics to summary tables maintained by mutations or scheduled jobs.
- Preserve anonymity between clients and suppliers with dedicated tests.
- Add PRD features in workflow order, not as isolated screens.

## Phase A: Scale Foundation

Status: started.

1. Add Convex indexes for hot SaaS paths:
   - RFQs by client/status/update time.
   - RFQs by status/update time for admin operations.
   - Supplier assignments by supplier/status and RFQ/status.
   - Supplier quotes by RFQ/status and supplier/status.
   - Purchase orders by client/status and approval time.
   - Orders by client/status and supplier/status.
   - Catalog products by visibility and visibility/category.
   - Notifications by recipient/read state.
   - Audit logs by organization and action.
2. Replace broad `.collect()` reads in portal list queries with indexed ranges and bounded result sets.
3. Add paginated APIs for list-heavy screens.
4. Replace live historical reports with summary tables:
   - `adminRevenueDailySummaries`
   - `clientSpendDailySummaries`
   - `supplierPerformanceDailySummaries`
5. Add load seed scripts for thousands of RFQs, quotes, POs, orders, and notifications.
6. Add backend tests for:
   - tenant isolation
   - supplier anonymity
   - client anonymity
   - RBAC enforcement
   - report correctness from summary rows

## Phase B: PRD Workflow Completion

1. Client onboarding and organization setup.
2. Role-aware user invites and lifecycle.
3. RFQ creation with catalog and non-catalog support.
4. Approval tree for RFQs and purchase orders.
5. Supplier matching and supplier response windows.
6. Supplier quote submission with partial fulfillment.
7. Admin quote review, margin rules, and margin overrides.
8. Client quote comparison with anonymous suppliers.
9. Split award support where the PRD requires multi-supplier selection.
10. Client PO and supplier SPO generation.
11. Order fulfillment workflow:
    - supplier acknowledgement
    - delivery note
    - goods received note
    - invoice
    - three-way match
12. Dispute handling and audit trail.

## Phase C: SaaS Operations

1. Tenant settings and limits.
2. Billing/plan hooks if the platform is sold as paid SaaS.
3. Admin support tooling for organizations, users, stuck workflows, and data repair.
4. Data export and retention policy.
5. Backup and restore runbook.
6. Monitoring, error reporting, and operational alerts.
7. Production/demo seed separation.

## Phase D: Big Load Architecture

1. Use Convex for transactional procurement workflows and realtime operational dashboards.
2. Keep heavy analytics in precomputed Convex summary tables at first.
3. Add external warehouse/BI only when reporting exceeds operational summary needs.
4. Add search/vector search only for catalog scale or semantic matching needs.
5. Run repeatable load tests before each production milestone.

## First Implementation Slice

Status: implemented.

- Add missing Convex indexes.
- Refactor high-risk list queries to use indexes and bounded reads.
- Add paginated backend functions where portal lists will need "load more".
- Keep existing screens working while preparing the API layer for frontend pagination.

## Second Implementation Slice

Status: implemented.

- Added summary tables for admin revenue, client spend, and supplier performance.
- Added workflow hooks so PO approvals, PO-to-order creation, order status changes, supplier assignment updates, and supplier quote submissions refresh summaries.
- Added summary-first report queries with bounded live fallbacks for existing/demo records.
- Added `analytics.rebuildAnalyticsSummariesForAdmin` for bounded backfills of existing approved POs and recent orders.

## Third Implementation Slice

Status: implemented.

- Added backend contract tests for scale indexes, analytics refresh hooks, anonymity, and bounded portal list reads.
- Added `seed.seedLoadTestData` for generating synthetic RFQs, quotes, POs, orders, clients, suppliers, and summary rows in safe batches.
- Added `pnpm seed:load` as the local command for running load-data generation.

Example load seed command:

```bash
pnpm seed:load -- '{"rfqCount":1000,"batchSize":25,"clientCount":8,"supplierCount":20}'
```

## Fourth Implementation Slice

Status: implemented.

- Wired client catalog to `catalog.listVisibleProductsPaginated`.
- Wired client RFQ history to `rfqs.listRfqsForActorPaginated`.
- Wired client RFQ catalog selection/CSV support to paginated catalog data.
- Wired admin catalog product management to `catalog.listProductsForAdminPaginated`.
- Added explicit Load More controls instead of silent infinite scroll.
- Added frontend pagination contract tests.

## Fifth Implementation Slice

Status: implemented.

- Added paginated Convex APIs for admin operations, client quote groups, client purchase orders, client order tracking, supplier RFQ assignments, supplier quote history, and supplier fulfillment queues.
- Added a global RFQ `by_updated_at` index for paginated admin operations reads.
- Kept the existing bounded list APIs in place while wiring portals to the new paginated APIs.
- Wired Load More controls into admin operations, client quotes, client orders, supplier RFQ inbox, supplier quotes, and supplier orders.
- Expanded backend and frontend contract tests to guard the new pagination surface.

## Sixth Implementation Slice

Status: implemented.

- Added supplier offer/rate-card data model attached to the existing master catalog products.
- Added product addition request data model for supplier-proposed catalog gaps.
- Added supplier APIs for browsing sellable catalog products, submitting/updating supplier offers, and requesting new products.
- Added admin APIs for approving/rejecting supplier offers and approving/rejecting product addition requests.
- Added supplier Offers workspace and admin Offers approval queue.
- Seeded demo supplier offers and a pending product addition request.
- Added contract tests for the supplier-offer PRD foundation and route wiring.

## Seventh Implementation Slice

Status: implemented.

- Added `quotes.generateAutoQuotesForRfq` to generate admin-review supplier quotes from approved supplier offers.
- Auto-generation matches catalog RFQ line items to approved, auto-quote-enabled supplier offers by product.
- MOQ and available quantity gates prevent unsuitable auto-quotes.
- Generated quotes stay internal as `underReview` and still require admin margin approval/release before clients can see them.
- Admin pricing now includes a Generate Auto-Quotes action.
- Added analytics event and contract tests for the auto-quote foundation.

## Eighth Implementation Slice

Status: implemented.

- Added margin recommendation helper using active margin rules with priority for client + category, client, category, then global/default margin.
- Added indexed margin-rule access paths for client and category targeting.
- Added SAR 25,000 quote-manager threshold hold policy.
- Auto-generated quotes above the threshold are created as `held` and require explicit admin action before release.
- Admin pricing shows recommended margin, rule source, and threshold hold indicators.
- Approving with the recommended margin no longer requires a manual override reason; custom margin changes still do.
- Seed data now includes demo margin rules.

## Ninth Implementation Slice

Status: implemented.

- Added `quotes.bulkApproveRecommendedQuotesForRfq` for bulk approving every reviewable RFQ quote with its server-recommended margin.
- Bulk approval includes `submitted`, `underReview`, and explicitly held threshold quotes.
- Bulk approval writes quote-level and RFQ-level audit entries.
- Admin pricing now has an Approve Recommended action before Release Approved Quotes.
- Added analytics and contract coverage for the bulk approval path.

## Tenth Implementation Slice

Status: implemented.

- Added tenant-scoped `savedRfqCarts` with a 7-day expiry window and indexed client/expiry reads.
- Added client APIs to list active saved carts, save the current RFQ cart, and delete saved carts with audit entries.
- Wired the client RFQ page to save, load, and delete reusable RFQ carts without losing department, branch, cost center, delivery date, or notes.
- Added backend and frontend contract coverage for the saved-cart PRD workflow.

## Slice 11.5 — Three Vite builds + per-portal bundles

Status: implemented.

- Added `apps/client/`, `apps/supplier/`, `apps/backoffice/` as three thin Vite entry points sharing `src/`.
- Three per-portal vite configs (`vite.config.client.ts`, `vite.config.supplier.ts`, `vite.config.backoffice.ts`) inject a `__BUILD_PORTAL__` flag that `getBuildPortalType()` reads.
- `ProtectedRoute` refuses any route whose `portal` does not match the build flag, so a hostile route push to a foreign portal lands on `/unauthorized` regardless of role.
- Split `src/routes/router.tsx` into `client-router.tsx`, `supplier-router.tsx`, `backoffice-router.tsx`. Each portal bundle imports only its own pages.
- `pnpm dev:client | dev:supplier | dev:backoffice` on ports 5173/5174/5175. `pnpm build` builds all three into `dist/{client,supplier,backoffice}/`.
- Added isolation contract test that fails if a foreign portal's pages leak into another bundle's router.

## Slice 11.6 — SaaS guarantees: idempotency + rate limits + scheduler + observability

Status: implemented.

- Audited every `withIndex(...)` in `convex/`. The non-tenant indexes (`by_status_updated_at`, `by_visible`, `by_active`, `by_approved_at`, `by_day`) are used exclusively by admin queues that are supposed to be cross-tenant, all bounded by `take(N)` or pagination. No lookups need rescoping.
- Added `idempotencyKeys` table indexed by `(actorUserId, action, key)` plus `lookupIdempotentResult` / `recordIdempotentResult` helpers. 24 h TTL by default.
- Added `rateLimits` table indexed by `(actorUserId, action, windowStart)` plus `assertWithinRateLimit` helper and a `RATE_LIMIT_POLICIES` table covering public registration, RFQ submit, supplier offer upsert, payment intent create, and product addition request.
- Added `mutationMetrics` table with `withMetrics` tracer that samples successful mutations at 1 % and records 100 % of errors with `(actorUserId, organizationId, durationMs, errorClass)`.
- Wired idempotency into `submitRfq` and `generatePoFromSelectedQuote`; wired rate limits into `submitRfq`, `upsertSupplierOffer`, and `submitProductAdditionRequest`; wired `withMetrics` into `submitRfq`.
- Added `convex/scheduled.ts` with internal mutations and `convex/crons.ts` registering hourly sweeps for expired saved carts and idempotency keys, six-hourly rate-limit cleanup, and daily mutation-metric retention (7 days).
- Updated UI call sites (`submitRfq` from rfq detail page and rfqs page, `generatePo` from quote comparison page) to pass `crypto.randomUUID()` per click so duplicate clicks and network retries coalesce server-side.
- Added a backend contract test asserting all of the above stay wired.

## Eleventh Implementation Slice

Status: implemented.

- Added `awardedQuoteId` to RFQ line items and `awardedRfqLineItemIds`/`awardKind` to purchase orders so that split awards survive PO generation and analytics.
- Added `quotes.selectAwardsByLineItem` mutation: validates that every line is awarded, that the chosen supplier quote is still released and in-validity, and that the supplier actually priced the line. Marks the quote(s) as `selected` and the rest as `lost`, then locks the RFQ.
- Updated `purchaseOrders.generatePoFromSelectedQuote` to group line items by their awarded quote and emit one PO per unique supplier, scoped to the awarded line items.
- Updated the PO snapshot loader, supplier order line loader, and analytics helpers to filter line items to the PO's awarded subset so split-award POs do not double-count revenue, supplier cost, or coverage.
- Replaced the client quote comparison page with a per-line award flow: the cheapest eligible supplier is preselected per line, "Award all" still supports full-basket selection, and a new "Lock awards" action submits the per-line awards before "Generate PO" creates the linked POs.
- Added the `quote_split_awarded` analytics event and a backend contract test for the schema additions, mutation guards, and PO generation grouping.
