# MWRD PRD Phase 1 Gap Plan

Source reviewed: `/Users/bigo/Downloads/MWRD Strategic MVP v3 (3).docx`

## Current Product Baseline

The current repo is a single React/Vite app with shared portal shell routes for `/client`, `/supplier`, and `/admin`, backed by Convex and Better Auth. It already has:

- Client, supplier, and admin authenticated portals.
- Arabic/English localization and RTL/LTR support.
- Admin-owned catalog categories/products with no public client prices.
- RFQ creation, non-catalog request line items, attachments, supplier assignment, supplier quotes, admin margin review, quote release, client comparison, quote selection, PO approval, supplier order tracking, audit logs, notifications, and demo seed data.
- Client/admin/supplier reporting surfaces added in Step 14.

The PRD Phase 1 target is broader and structurally different: Turborepo, three separate web apps, one Expo mobile app, shared public auth package, separate backoffice auth, in-memory mock data swap point, master catalog plus supplier offers, auto-quote engine, split awards, bundles, saved carts, company catalogs, account management, approval tree, dual PO, DN/GRN/Invoice, three-way match, and stubs for ZATCA/Tap/notifications.

## Critical Architecture Gap

The PRD says Phase 1 should build against an in-memory mock data layer in `packages/shared/src/data/index.ts`, with Supabase replacing that file in Phase 2.

This repo is already built on Convex as the live backend. That is a product/architecture fork:

- Option A: Keep the current Convex/Vite direction and implement PRD product capabilities inside this stack.
- Option B: Replatform toward the PRD architecture: Turborepo, three Next.js apps, Expo app, shared packages, mock data layer, then Supabase.

Recommendation: choose Option A unless there is a hard investor/engineering requirement to match the PRD stack exactly. Replatforming now would consume most of Phase 1 without improving the MVP workflows users can test.

## Phase 1 Gap Matrix

| Area | PRD Phase 1 Requirement | Current Status | Gap Priority |
|---|---|---:|---:|
| App architecture | 3 web apps plus Expo mobile, shared packages | Single Vite SPA with portal routes | P0 decision |
| Public auth | Shared client/supplier registration, callback activation, onboarding wizard | Login-only demo/auth flow | P0 |
| Backoffice auth | Fully separate auth and session policy | Same Better Auth surface with portal guard | P0 |
| Master catalog | Admin master products with pack types, images, deprecation, 200-300 seeded products | Basic categories/products, 3 seeded demo products | P1 |
| Supplier offers | Supplier offers/rate cards attached to master products | Foundation added: supplier offers attach to products with private cost/MOQ/lead time | P1 |
| Product addition requests | Supplier submits proposed products; admin approves/rejects | Foundation added: supplier request flow and admin decision queue | P1 |
| Offer approval queue | Backoffice verifies first-time supplier offers | Foundation added: admin offer approval queue | P1 |
| Auto-quote engine | Per-offer toggle, review window, threshold hold, server margin | Foundation added: approved supplier offers can generate admin-review quotes with server margin recommendations and threshold holds | P1 |
| Quote manager | Margin slider, threshold-based holds, bulk send | Margin review, threshold holds, and bulk recommended approval/release added | P1 |
| Client quote award | Line-item comparison with split awards or full basket award | Per-line awards persisted on `rfqLineItems` and PO generation creates one PO per awarded supplier | P1 |
| Saved carts | Multiple parked RFQ drafts with 7-day expiry | Added: tenant-scoped saved RFQ carts with 7-day expiry and client save/load/delete UI | P1 |
| Bundles | Pre-built kits, one-click add to RFQ | Static mock bundle references only | P2 |
| Company catalogs | Curated approved products per client company | Missing | P2 |
| Account management | Users, roles, approval tree, addresses | Org/user directory partial; no client account UI | P1 |
| Approval tree | Configurable approval chain gates every order | Simple PO approval instance only | P1 |
| Supplier catalog UX | Supplier browses catalog and clicks "Sell this product" | Foundation added in supplier Offers workspace | P1 |
| Auto-quote review queue | Supplier edits/accepts auto-draft quote | Missing | P1 |
| Delivery notes | Supplier creates DN | Missing | P1 |
| Dual PO | Client CPO + supplier SPO linked by `transaction_ref` | Single purchase order | P1 |
| GRN/Invoice | GRN and invoice lifecycle | Missing | P1 |
| Three-way match | PO x GRN x Invoice variance review | Missing | P1 |
| ZATCA stub | TLV generator returns null | Missing | P2 |
| Tap stub | Mock payment intent | Missing | P2 |
| Notification stubs | Email/SMS/push stubs with in-app notification | In-app notifications exist; external stubs missing | P2 |
| Leads queue | Signup callback queue | Missing | P0 |
| KYC queue | Post-callback document verification | Missing | P1 |
| Internal users | Backoffice invite/manage internal users | Missing | P1 |
| Anonymity audit | CI tests assert no real-name leaks | Manual query shaping only | P0 |
| Mobile app | Expo client/supplier mobile app | Missing | P2 or separate track |

## Recommended Build Plan

### Phase 1A: Scope And Architecture Lock

Goal: decide whether the current Convex/Vite architecture is the accepted implementation path.

Deliverables:

- Update `MWRD_BUILD_PLAN.md` to state whether PRD compliance means product/workflow compliance or exact stack compliance.
- Create a canonical Phase 1 checklist in `docs/phase1-prd-checklist.md`.
- Define non-negotiable anonymity test cases.
- Decide whether mobile is in Phase 1 or a parallel track.

Exit criteria:

- One architecture path approved.
- No feature work starts until this is written down.

### Phase 1B: Auth, Onboarding, And Backoffice Separation

Goal: align access control with the PRD trust model.

Deliverables:

- Public registration for client/supplier with minimal fields.
- Thank-you screen: "we'll call within 24 hours".
- Leads callback queue in admin.
- Activation/password-set flow after callback approval.
- First-login onboarding wizard for company profile.
- Separate backoffice login route and stricter route/session policy.
- KYC queue with document status fields and UI placeholders.

Exit criteria:

- Client/supplier cannot self-activate.
- Public users cannot access admin routes.
- Admin users cannot be created through public signup.

### Phase 1C: Master Catalog And Supplier Offers

Goal: move from quote-only manual assignment to PRD's master catalog plus supplier offers model.

Deliverables:

- Add `masterProducts`, `packTypes`, `supplierOffers`, `productAdditionRequests`, and `offerApprovals` data model.
- Admin master catalog CRUD supports pack types, product media placeholders, status/deprecation.
- Supplier catalog browsing page with "Sell this product" CTA.
- Supplier rate card management with cost price, lead time, MOQ, pack type, availability, auto-quote toggle.
- Product addition request flow.
- Admin offer approval and product addition queues.
- Seed 200-300 master products across Office Supplies, IT/Electronics, Furniture.

Exit criteria:

- Suppliers no longer create product content directly.
- Offers attach to canonical master products.
- Supplier offer prices are never visible to clients.

### Phase 1D: Auto-Quote Engine And Quote Manager

Goal: implement the PRD's Model B auto-quote flow.

Deliverables:

- Auto-match RFQ line items to supplier offers.
- Per-supplier auto-quote review windows: instant, 30 min, 2 hr.
- Auto-draft quotes with supplier edit/decline/send actions.
- Server-side margin rule engine by category and client.
- Configurable threshold hold, default SAR 25,000.
- Quote Manager queue for held quotes.
- Bulk approve/release actions.

Exit criteria:

- Matched RFQs can produce quotes without manual admin assignment.
- Quotes above threshold hold for admin.
- Margin is applied server-side and remains invisible to client/supplier.

### Phase 1E: Client Procurement Depth

Goal: match PRD client workflows beyond basic RFQ.

Deliverables:

- Saved carts with 7-day expiry and multiple drafts.
- Bundles/essentials packs, one-click add to RFQ.
- Company catalogs per client organization.
- Address book.
- Account management: members, roles, invitation placeholders.
- Approval tree builder with cycle detection and simple default chain.
- Split award in quote comparison: per-item supplier selection plus full-basket selection.

Exit criteria:

- Client can choose different suppliers per line item.
- PO generation respects approval tree.
- Repeat procurement can start from company catalogs, bundles, or saved carts.

### Phase 1F: Documents And Order Operations

Goal: make procurement-finance plumbing credible.

Deliverables:

- Replace single PO model with linked CPO and SPO using `transaction_ref`.
- Add PO line items scoped per selected supplier.
- Delivery Note creation by supplier.
- Goods Receipt Note confirmation by client.
- Invoice entity and lifecycle.
- Three-way match queue with 2% variance tolerance.
- PDF rendering stubs for CPO, SPO, DN, GRN, INV.
- ZATCA TLV stub returning `null`.
- Tap payment intent stub returning mock ID/status.

Exit criteria:

- Every awarded supplier receives an SPO.
- Client sees CPOs.
- GRN and invoice can be matched against PO within tolerance.

### Phase 1G: Backoffice Completion

Goal: close operational control gaps.

Deliverables:

- Leads queue.
- KYC queue.
- Product addition request queue.
- Offer approval queue.
- Quote Manager threshold queue.
- Three-way match queue.
- Internal users management for superadmin.
- Admin settings for auto-quote threshold and review windows.
- Expanded audit log for every queue decision.

Exit criteria:

- Every PRD backoffice queue has a screen, data model, and seed data.
- Every sensitive admin action writes an audit event.

### Phase 1H: Security, Anonymity, And Test Gates

Goal: prevent the highest-cost platform bug class: identity leaks.

Deliverables:

- Integration tests for every cross-party query.
- Tests that supplier reads never include client real names/emails/phones.
- Tests that client reads never include supplier real names or supplier raw prices.
- Tests that admin can see real identities where intended.
- Fixture real names used only to assert they do not leak.
- Backoffice access tests using public users.

Exit criteria:

- CI blocks on anonymity leak tests.
- All Phase 1 PRD flows have Playwright smoke coverage in Arabic and English.

### Phase 1I: Mobile Track Decision

Goal: avoid silently missing the PRD's fourth app.

Options:

- Build Expo app as a parallel track after web workflows stabilize.
- Formally move Expo to Phase 1.5 if investor/demo needs allow.

Recommended: defer mobile to Phase 1.5 unless the demo audience explicitly requires native mobile. The web product is missing several procurement-core workflows that matter more than mobile parity.

## Suggested Execution Order

1. Architecture decision and checklist.
2. Auth/onboarding/backoffice separation.
3. Master catalog plus supplier offers.
4. Auto-quote engine and Quote Manager.
5. Split awards and approval tree.
6. Dual PO, DN, GRN, invoice, three-way match.
7. Backoffice queues.
8. Security/anonymity tests.
9. Mobile track.

## Immediate Next Sprint

Recommended first implementation sprint:

- Add Phase 1 checklist doc.
- Add supplier offer schema and admin/supplier offer pages.
- Add product addition request schema and queues.
- Seed realistic master catalog/products/offers.
- Add anonymity leak tests for existing client/supplier quote and RFQ APIs.

This is the best first sprint because supplier offers are the foundation for auto-quote, clean line-item comparison, product addition requests, and supplier rate cards.
