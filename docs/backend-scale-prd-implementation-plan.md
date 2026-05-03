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

## Slice 19 — Master product codes + pack-type repeater

Status: implemented.

- Schema: added optional `masterProductCode`, `packTypes` (array of strings), `defaultUnit`, and `lifecycleStatus` (`active | deprecated`) on `products`. New index `by_master_product_code`.
- `supplierOffers` gained optional `packTypePricing` (`{ packType, supplierCostSar, minOrderQuantity }[]`) and `fulfillmentMode` (`express | market`). Legacy single-pack `packType` + `unitCost` + `minOrderQuantity` stay for back-compat — UIs can keep submitting either shape until a future pack-type-only migration.
- New numbering helper [convex/numbers.ts](convex/numbers.ts) → `generateMasterProductCode(seq)` returns `MWRD-PROD-NNNNN` (5-digit padded).
- [convex/catalog.ts](convex/catalog.ts):
  - `createProduct` accepts `masterProductCode`, `packTypes`, `defaultUnit`, normalizes pack types (trim + de-dupe), refuses an explicit code that already exists, and auto-generates one from the row count when omitted. Marks `lifecycleStatus='active'` on creation.
  - New `backfillMasterProductCodes` internal mutation walks products by `createdAt` and assigns codes / lifecycle to legacy rows missing them.
- [convex/offers.ts](convex/offers.ts):
  - `upsertSupplierOffer` now accepts a `packTypePricing` array and `fulfillmentMode`. Each entry's pack type must be present in the product's `packTypes` allowlist (when defined), no duplicates, and the default `packType` arg must appear in the pricing entries. Legacy single-pack mode still works when `packTypePricing` is omitted.
- Seed: demo `upsertProduct` and load-test `ensureProduct` now stamp `packTypes`, `defaultUnit`, `lifecycleStatus`, and stable `MWRD-PROD-NNNNN` codes.
- Contract test asserts the schema additions, the numbering helper, the create/backfill paths, and the offer pricing validation guards.

## Slice 18 — Delivery Notes, Goods Receipts, Invoices, three-way match

Status: implemented.

- Schema: six new tables — `deliveryNotes`, `deliveryNoteItems`, `goodsReceiptNotes`, `goodsReceiptNoteItems`, `invoices`, `invoiceVarianceSummaries`. All cross-linked by `cpoId` / `spoId` / `transactionRef`. The variance summary precomputes PO/GRN/Invoice totals and `withinTolerance` so the three-way-match queue is an indexed read, not a recompute.
- New numbering helpers: `generateDeliveryNoteNumber`, `generateGoodsReceiptNumber`, `generateInvoiceNumber` returning `MWRD-DN-…` / `MWRD-GRN-…` / `MWRD-INV-…`.
- New module [convex/documents.ts](convex/documents.ts):
  - `runThreeWayMatch(cpoId, grnId, invoiceTotalSar)` computes PO total (from awarded quote line items), GRN total (qty received × unit price), invoice total. Returns the worst variance and `withinTolerance` against the **2 % tolerance**.
  - `createDeliveryNote` (gate `order:update_status`): supplier-only, refuses CPO ids, refuses SPOs not in `sentToSupplier`, audit-logged, notifies the client.
  - `confirmGoodsReceipt` (gate `delivery:confirm`): client-only, one GRN per DN, accepts per-line `condition` of `ok | damaged | short`.
  - `issueInvoice` (gate `po:approve`): VAT 15 % computed server-side, runs the three-way match, sets `status='issued'` if within tolerance else `status='onHold'` with `holdReason`. Always writes a `invoiceVarianceSummaries` row. Audit logged with `invoice.issued` / `invoice.held`.
  - `decideInvoiceVariance` (gate `po:approve`): admin override path. `approved` → invoice → `issued` (with override note); `rejected` → invoice → `cancelled` with mandatory note. Updates the variance summary with reviewer + note + decision time.
  - `recordInvoicePayment` (gate `po:approve`): flips invoice → `paid`, persists the Moyasar `paymentIntentId` from slice 12.
  - `listInvoicesOnHold` (gate `po:approve`): indexed by `by_status_updated_at`, joins variance summary + client anonymous id for the queue UI.
- Admin UI: new page [admin-three-way-match-page.tsx](src/features/admin/pages/admin-three-way-match-page.tsx) at `/admin/three-way-match`. Per-row Review opens a decision card showing PO / GRN / Invoice / Subtotal / VAT, with reviewer note and Override-Approve / Reject actions. Linked from `useAdminNav` under `po:approve`.
- i18n: added `navigation.three_way_match` in EN + AR.
- Seed: demo CPO now ships with a paired DN, GRN, and a clean within-tolerance Invoice + variance summary, so the three-way match queue starts empty but the data is shaped end-to-end.
- Contract test asserts the schema additions, the numbering helpers, the variance constants, the per-mutation permission gates and error messages, and the new admin route + nav.

## Slice 17 — Dual PO (CPO + SPO + transactionRef)

Status: implemented.

- Schema: `purchaseOrders` gained `type: 'cpo' | 'spo'`, `transactionRef`, and `linkedPurchaseOrderId` (all optional for legacy compat). New indexes: `by_transaction_ref` (paired-PO lookup) and `by_client_type_updated_at` (client list filtering).
- New module [convex/numbers.ts](convex/numbers.ts) provides `generateTransactionRef`, `generateCpoNumber`, `generateSpoNumber` with the `MWRD-TXN-…` / `MWRD-CPO-…` / `MWRD-SPO-…` shapes from the spec. Slice 19 will replace the random-suffix backstop with a real sequence; the public API stays the same.
- `generatePoFromSelectedQuote` now emits **two rows per awarded supplier**:
  - CPO: `type='cpo'`, `status='pendingApproval'`, owns the approvalTasks chain, surfaced to the client.
  - SPO: `type='spo'`, `status='draft'`, no chain.
  - Both share the same `transactionRef`. Each row's `linkedPurchaseOrderId` points at the partner.
  - `purchaseOrderIds` returned to the client only contains CPO ids (the supplier's bundle is discovered through `transactionRef`).
- `sendPurchaseOrderToSupplier` now refuses an SPO id, looks up the paired SPO via `linkedPurchaseOrderId` (with `by_transaction_ref` fallback), flips the SPO to `sentToSupplier`, and creates the `orders` row with `purchaseOrderId = spoId` so supplier-facing fulfillment queries continue to resolve through the SPO.
- Client-facing list (`listPurchaseOrdersForActor[Paginated]`) is filtered through the new `isClientFacingPurchaseOrder` helper — SPOs are hidden, legacy un-typed rows still surface.
- Row builder + detail query now expose `type`, `transactionRef`, `linkedPurchaseOrderId` so future PDF / "view paired SPO" UI can deep-link.
- Seed updated: demo PO now creates both CPO + SPO with a stable `MWRD-TXN-DEMO-…` ref; load-test seed creates them with `MWRD-TXN-LOAD-…`. Order rows reference the SPO id.
- Contract test asserts the schema additions, the numbering helpers, dual-PO emission in `generatePoFromSelectedQuote`, the SPO-aware `sendPurchaseOrderToSupplier`, the `isClientFacingPurchaseOrder` filter, and the seed updates.

## Slice 16 — Approval Tree (approvalNodes + approvalTasks + cycle detection)

Status: implemented.

- Schema: removed `approvalInstances`. Added `approvalNodes` (`organizationId`, `memberUserId`, optional `directApproverUserId`, indexed by org / org+member / approver) and `approvalTasks` (`purchaseOrderId`, `approverUserId`, `orderInChain`, `status: pending|approved|rejected|skipped`, optional `decidedAt`/`note`, indexed by po / po+order / po+status / approver+status).
- Rewrote [convex/approvals.ts](convex/approvals.ts):
  - `computeApprovalChain(ctx, organizationId, memberUserId)` walks the tree following `directApproverUserId`, deduping via a visited set, capped at `MAX_CHAIN_LENGTH=12` for safety.
  - `setDirectApprover` (gate `user:invite`) refuses self-approval, cross-org approver, and configurations that would create a cycle. Cycle detection walks upward from the proposed approver and rejects if it reaches the member or hits an existing cyclic chain. Audit-logged.
  - `listApprovalTreeForActor` returns members with their direct approver + resolved chain + chain length.
  - `listApprovalTasksForPurchaseOrder` returns the per-step tasks for the client PO detail page.
- Rewired [convex/purchaseOrders.ts](convex/purchaseOrders.ts):
  - New `resolveDefaultApproverChain` helper: prefers the configured chain; falls back to "any other org user with `po:approve`"; final fallback is the actor themselves so seed/dev data still produces approvable POs.
  - `generatePoFromSelectedQuote` now creates one `approvalTasks` row per chain step (first row `pending`, the rest `skipped` until activated).
  - `decidePurchaseOrder` now requires the actor to be the next pending approver. Approving advances to the next chain step (or finalizes the PO to `approved` if last). Rejecting closes the PO. `returnedForChanges` keeps the chain alive for re-submission. Per-step audit logs.
  - `getPurchaseOrderDetail` returns the full enriched `approvalTasks[]` (with approver name/email) instead of legacy approval instances.
  - Row builder reports `approvalStatus`, `chainLength`, and `pendingApproverUserId` for list views.
- Updated [convex/seed.ts](convex/seed.ts) to seed `approvalTasks` (single self-approval at chain step 0) for both the demo PO and the load-test PO generator.
- Updated [src/features/orders/pages/client-purchase-order-page.tsx](src/features/orders/pages/client-purchase-order-page.tsx) "Approval chain" card to show the ordered chain with approver, status, and decision time.
- New page [src/features/account/pages/client-approval-tree-page.tsx](src/features/account/pages/client-approval-tree-page.tsx) at `/client/account/approval-tree`. Org-admin members can pick a direct approver from a dropdown of other members, see the resolved chain, and save. Cycle errors surface inline. Routed in [src/routes/client-router.tsx](src/routes/client-router.tsx) and added to the client nav under `user:invite`.
- i18n: added `navigation.approval_tree` in EN + AR.
- Contract test asserts the schema swap, cycle-detection error strings, the `user:invite` gate, the new chain task-creation in PO generation, the strict next-approver guard in `decidePurchaseOrder`, and the route + nav wiring.

## Slice 15 — Backoffice auth split: idle timeout + cross-portal sign-in refusal

Status: implemented.

- Added [src/lib/use-idle-signout.ts](src/lib/use-idle-signout.ts): a portal-agnostic hook that resets a timer on `mousemove`/`mousedown`/`keydown`/`scroll`/`touchstart`/`click`/`visibilitychange`, fires `onIdle` after the threshold, and is gated on `enabled`.
- [src/lib/auth.tsx](src/lib/auth.tsx) reads `__BUILD_PORTAL__` and passes the per-portal threshold into the hook: 15 min for `backoffice`, 24 h for `client` and `supplier`. On idle, the provider calls `authClient.signOut()` and redirects to `/auth/login?reason=idle`. The threshold constants (`BACKOFFICE_IDLE_TIMEOUT_MS`, `PUBLIC_IDLE_TIMEOUT_MS`) are exported for tests.
- [src/pages/login-page.tsx](src/pages/login-page.tsx) now:
  - Reads `getBuildPortalType()` and refuses any signed-in user whose `user.portal !== buildPortal`. The user is force-signed-out so the credential cannot be reused on this domain. A clear notice ("This account is not authorized for this portal.") is rendered — we never redirect them to the matching portal, per the spec.
  - Renders an idle-signout notice when `?reason=idle` is in the URL.
  - Resolves `redirectPath` against `portalStartPaths[buildPortal]` instead of always defaulting to `/admin/dashboard`, so a successful client-portal login lands on `/client/dashboard`.
  - Tracks `loginSuccess` with `portal: buildPortal` so PostHog can split the funnel by portal.
- Contract test (in `frontend-pagination-contracts.test.ts`) asserts the hook is wired, the per-portal thresholds are present, the cross-portal refusal logic is in `LoginPage`, and the idle redirect uses `?reason=idle`.

## Slice 14 — Leads queue + KYC queue

Status: implemented.

- Schema: extended `users.status` with `callbackCompleted`. Added KYC fields on `users`: `kycSubmittedAt`, `kycDecision` (`approved | rejected | requestedMore`), `kycDecisionNote`, `kycDecidedAt`, `kycDocuments` (array of `{ documentType, storageId?, submittedAt, status }` placeholder records ready for the supplier/client upload UI in a later slice).
- Onboarding flow updated to match the spec exactly:
  - `publicRegisterRequest` → user `pendingCallback`, org `pendingCallback`.
  - `markCallbackComplete` → user `callbackCompleted`, org `pendingKyc`, 7-day activation token issued.
  - `completeActivation` → user `pendingKyc`, org `pendingKyc`, `kycSubmittedAt=now` so the new queue immediately shows the activated org.
  - `decideKycReview` (admin, `audit:view`): `approved` → user/org `active`; `rejected` → user/org `suspended` with required reviewer note; `requestedMore` → keeps `pendingKyc` and stores the reviewer note. Audit-logged with `kyc.approved` / `kyc.rejected` / `kyc.more_requested`.
- Authentication: `getCurrentSession` now accepts `active` and `pendingKyc` so an activated user can complete `/onboarding` and continue using the platform during KYC review. `assertActiveUser` matches. Hard rejects still apply to `suspended`, `invited`, `pendingCallback`, `callbackCompleted`.
- Backend queries: `listPendingLeads` now spans both `pendingCallback` and `callbackCompleted` (so ops can see leads they have already called but not yet activated). New `listPendingKycReviews` returns `pendingKyc` users with company CR / VAT / submitted documents.
- UI: new admin pages [admin-leads-page.tsx](src/features/admin/pages/admin-leads-page.tsx) and [admin-kyc-page.tsx](src/features/admin/pages/admin-kyc-page.tsx). Each is a queue table with a per-row Review button that opens a decision card under the table. Leads supports "mark callback complete + notes"; KYC supports approve / reject / request-more with mandatory note for the latter two.
- Routing: backoffice router registers `/admin/leads` and `/admin/kyc`. Admin nav now lists them under the same `audit:view` gate (so non-superadmin internal users without that permission see neither).
- Backend contract test asserts the schema additions, the audit-view gate, the activation flow status changes, the new queue index reads, and the routes / nav wiring.

## Slice 13 — Public callback registration + activation + onboarding

Status: implemented.

- Schema: extended `users.status` with `pendingCallback` and `pendingKyc`. Added `users.activationStatus` (`awaitingCallback | callbackCompleted | activated`), `users.activationToken`, `users.activationTokenExpiresAt`, `users.callbackNotes`, `users.phone`, `users.signupSource`. Added `users.by_status_updated_at` and `users.by_activation_token` indexes. Extended `organizations.status` with `pendingCallback` / `pendingKyc`, added `signupSource`, `signupIntent`, `expectedMonthlyVolumeSar`, `crNumber`, `vatNumber`, `onboardingCompleted` and an `organizations.by_status_updated_at` index.
- New module `convex/publicAuth.ts`:
  - `publicRegisterRequest` — public mutation. Validates name / email / phone / company. Rate-limited via `RATE_LIMIT_POLICIES.publicRegister`. Creates a pending org + pending user with `status='pendingCallback'`, `activationStatus='awaitingCallback'`. Role is hard-coded to `orgAdmin` (client) or `supplierAdmin` (supplier) — public signup can never produce admin / ops / finance / cs roles.
  - `markCallbackComplete` — admin-only (`audit:view`). Generates a 7-day activation token, flips user/org to `pendingKyc`, sets `activationStatus='callbackCompleted'`, writes audit log. Returns the token for delivery via the (Phase 3) email channel.
  - `lookupActivationToken` — public query. Resolves a token to email/name/portal. Rejects expired tokens or tokens whose `activationStatus !== "callbackCompleted"`.
  - `completeActivation` — public mutation. Validates the token, flips user → `active` / `activated` and clears the token. Org is flipped to `active` so `getCurrentSession` will accept the next login.
  - `completeOnboarding` — authenticated mutation. Sets CR / VAT / expected volume on the org and marks `onboardingCompleted=true`.
  - `listPendingLeads` — admin-only feed for the upcoming Leads queue (slice 14).
- Better Auth: relaxed `disableSignUp` to `false`. Trust boundary stays at `getCurrentSession`, which still rejects any Better Auth user without an active Convex `users` row. The `/activate` page is the only client-side flow that produces such a row.
- Pages (`src/pages/`):
  - `register-page.tsx` — shared client/supplier register form with account-type toggle, defaults to the build portal's account type.
  - `register-thank-you-page.tsx` — confirmation screen.
  - `activate-page.tsx` — token lookup + password set + Better Auth signUp + `completeActivation`.
  - `onboarding-page.tsx` — first-login CR / VAT / expected-volume capture.
- Routing: client and supplier portals each register `/register`, `/register/thank-you`, `/activate`, `/onboarding`. Backoffice intentionally registers none of them; the contract test fails the build if any of those paths leak into `backoffice-router.tsx`.
- Contract test asserts the schema additions, the role guard in `publicRegisterRequest` (no admin role literals), the `audit:view` gate on `markCallbackComplete`, the activation-token lifecycle in `completeActivation`, and the cross-portal isolation in the routers.

## Slice 12 — Doc cleanup, Moyasar payment stub, storage URL interface

Status: implemented.

- Removed every ZATCA / Fatoora / Tap-Payment reference from `docs/phase1-prd-checklist.md` and `docs/prd-phase1-gap-plan.md`. The gap matrix now lists Moyasar payment stub and storage URL interface as P1 items (both implemented this slice). Phase 1F deliverables drop the ZATCA TLV / Tap stub line.
- Added `convex/payments.ts` with three mutations: `createPaymentIntent`, `capturePayment`, `refundPayment`.
  - All three return mock charge ids of the form `moyasar_charge_<ts>_<rand>`.
  - `createPaymentIntent` is rate-limited via `RATE_LIMIT_POLICIES.paymentIntentCreate` and idempotent on `idempotencyKey`. Replays do not double-create.
  - `capturePayment` and `refundPayment` validate the charge id starts with `moyasar_charge_` so a forged id from a foreign provider cannot pass.
  - All three write `payment.intent_created` / `payment.captured` / `payment.refunded` audit log entries scoped to the actor's organization.
  - All three require `po:approve`. The shared `paymentStatus` validator is exported for the Phase-1F invoice table.
- Added `convex/storage.ts` with a single query `getDocumentDownloadUrl(actorUserId, entityType, entityId)`.
  - `entityType` enum covers CPO, SPO, DN, GRN, INV, KYC docs, offer images, master product images.
  - Each entity type maps to one or more permissions checked via `assertHasAnyPermission`. Suppliers can read SPO/DN, clients can read CPO/GRN/INV, admins can read KYC.
  - Today returns a mock URL `https://mwrd-mock-storage/documents/<entityType>/<entityId>?token=…&expires=<ts>` with a 5-minute TTL. Phase 3 swaps the implementation behind this signature for real signed CDN URLs (R2 / S3) without touching call sites.
- Added a backend contract test that fails the build if (a) any `tap_payment` / `zatca` / `fatoora` string sneaks back into `payments.ts` or `storage.ts`, (b) `createPaymentIntent` loses its idempotency / rate-limit / audit wiring, (c) any of the eight document entity types disappear from the storage map.

## Slice 11.7 — Anonymity CI gate

Status: implemented.

- Added `src/lib/anonymity-contracts.test.ts` as a static-analysis CI gate that fails any commit that loosens cross-party anonymity. Seven assertions:
  1. **Fixture-name guard.** Walks every `convex/*.ts` source file and refuses any hardcoded reference to canonical fixture real names (`AcmeRealCorp`, `GlobexRealLtd`, `FixtureClientReal`, `FixtureSupplierReal`). Locks in the rule that future fixture data may not embed opposing-party real names into shipped code.
  2. **Client-facing queries — supplier identity guard.** For every client-facing query (`getRfqQuoteComparison`, `listReleasedRfqsForClient[Paginated]`, `listPurchaseOrdersForActor[Paginated]`, `getPurchaseOrderDetail`, `listOrdersForClientActor[Paginated]`), assert no `.name` / `.email` / `.phone` access on a `supplier` / `supplierOrg` variable.
  3. **Supplier-facing queries — client identity guard.** For every supplier-facing query (`listSupplierAssignments[Paginated]`, `getSupplierAssignmentDetail`, `listSupplierQuotesForActor[Paginated]`, `getQuoteForAssignment`, `listOrdersForSupplierActor[Paginated]`), assert no `.name` / `.email` / `.phone` access on a `client` / `clientOrg` / `clientOrganization` variable.
  4. **Cross-party row builders.** `buildSupplierOrderRow` and `buildSupplierAssignmentRow` must contain `clientAnonymousId` and never `client*.name`. `buildClientOrderRow` must contain `supplierAnonymousId` and never `supplier*.name`.
  5. **Client-facing prices.** `getRfqQuoteComparison` and `listReleasedRfqsForClient` must not return `supplierUnitPrice` or `supplierTotalPrice`; must return `clientFinalUnitPrice` / `clientFinalTotalPrice`.
  6. **Supplier-facing prices.** `getQuoteForAssignment` must not return `clientFinalUnitPrice` / `clientFinalTotalPrice` / margin fields.
  7. **Admin-only queues.** `listSubmittedQuotesForRfq` is the only path that may surface real names, and only behind the `quote:apply_margin` permission.
- Future cross-party queries are added to the gate's `CLIENT_FACING_QUERIES` / `SUPPLIER_FACING_QUERIES` arrays so they automatically get audited.

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
