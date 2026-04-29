# MWRD Build Plan

Source inputs:
- PRD: `/Users/bigo/Downloads/mwrd_prd.md`
- Project guide and required stack: `/Users/bigo/Desktop/CLAUDE.md`
- Brand guideline: `/Users/bigo/Documents/مورد/Mwrd Guideline.pdf`
- Logo assets: `/Users/bigo/Documents/مورد/Logo/...`
- Font package: `/Users/bigo/Documents/مورد/Font/IBM_Plex_Sans_Arabic,Plus_Jakarta_Sans.zip`

Implementation source of truth:

- Follow `/Users/bigo/Desktop/CLAUDE.md` for stack, folder structure, coding conventions, commands, route boundaries, analytics events, testing rules, and hard constraints.
- Keep this build plan aligned with that guide. If architecture decisions change, update `CLAUDE.md` first and mirror the planning impact here.

## 1. Product Direction

MWRD is a controlled B2B procurement marketplace, not an open marketplace. The product should be built around three authenticated portals:

- Client Portal: procurement teams create RFQs, compare anonymous quotes, approve POs, track orders, and report on spend.
- Supplier Portal: suppliers receive anonymous RFQs, submit quotations, manage fulfillment, and view performance.
- Admin Portal: MWRD controls onboarding, supplier matching, quote review, margin logic, approvals, operations, audit logs, and reporting.

The most important product rules are:

- No catalog pricing is visible before admin-approved quotes.
- Clients and suppliers must remain anonymous to each other.
- Admins can see real identities and control pricing/margins.
- Arabic and English must be first-class, including RTL/LTR layouts.
- Every sensitive action needs auditability.

## 2. Required Technical Architecture

Use the stack and structure from `CLAUDE.md`.

Required stack:

- Frontend: React + TypeScript + Vite.
- Backend: Convex.
- Auth: Better Auth with Convex integration.
- UI: Tailwind CSS + shadcn/ui.
- Routing: React Router.
- Forms: React Hook Form + Zod.
- Tables: TanStack Table.
- Analytics: PostHog through `src/lib/analytics.ts` only.
- i18n: i18next.
- Testing: Vitest, React Testing Library, Playwright.
- Package manager: pnpm.

Required structure:

```text
src/
  app/              # app entry, providers, global config
  components/       # reusable shared UI only
  features/         # feature modules
  hooks/            # shared hooks
  lib/              # utilities, analytics, i18n setup
  pages/            # route page components
  routes/           # route definitions and guards
  styles/           # global CSS and Tailwind base
  i18n/             # ar/en translation files
  types/            # shared TypeScript types

convex/
  schema.ts
  auth.ts
  auth.config.ts
  http.ts
  betterAuth/
  users.ts
  orgs.ts
  catalog.ts
  rfqs.ts
  quotes.ts
  orders.ts
  approvals.ts
  notifications.ts
  audit.ts
  analytics.ts

docs/
  analytics-plan.md
  security-checklist.md
```

Portal routes:

- Client Portal: `/client`.
- Supplier Portal: `/supplier`.
- Admin Portal: `/admin`.
- Do not modify the root `/` landing page.

Required local commands:

```bash
pnpm install
pnpm dev
pnpm convex dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm seed
```

Required environment variables:

```text
VITE_CONVEX_URL=
VITE_CONVEX_SITE_URL=
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://app.posthog.com
SITE_URL=http://localhost:5173
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:5173
```

## 3. Brand System Setup

Create the brand foundation before building screens. Every portal should consume the same Tailwind tokens, CSS variables, fonts, and SVG assets.

Brand colors from the guideline:

```css
:root {
  --mwrd-rich-black: #1A1A1A;
  --mwrd-carrot: #FF6D43;
  --mwrd-stone: #BEB8AE;
  --mwrd-interactive-cyan: #C6E4EE;
  --mwrd-frosted-blue: #75DAEA;
  --mwrd-tuscan-sun: #F8C843;
  --mwrd-lobster-red: #EB4F5D;
}
```

Note: the supplied SVGs use `#ff6e42`, while the guideline lists Vibrant Carrot as `#FF6D43`. Treat `#FF6D43` as the official product token and keep SVG source files unchanged unless a later brand QA pass approves normalization.

Typography:

- English: Plus Jakarta Sans.
- Arabic: IBM Plex Sans Arabic.
- Use locale-aware font stacks so Arabic pages do not inherit English typography.

Logo usage:

- App favicon and compact navigation: `Orange icon.svg`.
- English UI logo: English `Primary Logo Orange.svg`.
- Arabic UI logo: Arabic `Primary Logo Orange.svg`.
- Bilingual/auth/admin brand moments: Full Logo One Side `Primary Logo Orange.svg`.
- Preserve logo aspect ratio, never stretch or redraw.
- Respect clear space around the logo using the internal diamond element as the spacing unit.
- Use the icon pattern sparingly for empty states, auth backgrounds, and PDF/report covers. Do not let pattern decoration reduce dashboard readability.

Interface tone:

- Operational, precise, and enterprise-ready.
- Use orange for primary action and status emphasis, cyan for informative/interactive highlights, black for authority, stone for calm backgrounds.
- Avoid decorative landing-page composition because the public landing page is out of scope.
- Use Tailwind utilities and shadcn/ui components. Do not use inline styles.
- Use CSS logical properties and Tailwind RTL variants for direction-sensitive spacing and icons.

Bilingual implementation rules:

- Arabic is the default language.
- The language switcher must be visible before and after authentication.
- Save language preference to the user profile.
- Set `dir="rtl"` on `<html>` for Arabic and `dir="ltr"` for English.
- Translation files live under `src/i18n/ar/` and `src/i18n/en/` by namespace.
- Test every new UI page visually in both Arabic and English.
- Directional icons must mirror in RTL.

## 4. Data Model Foundation

Start with the core Convex schema before screen implementation. Backend domain logic lives in `convex/` as typed Convex queries, mutations, actions, internal queries, and internal mutations.

Core entities:

- Organizations: client, supplier, MWRD admin.
- Users: belongs to organization, has role memberships.
- Role, Permission, RolePermission.
- Branch, Department, CostCenter.
- ApprovalWorkflowTemplate, ApprovalStep, ApprovalInstance.
- Category, Product, ProductTranslation, ProductMedia.
- RFQ, RFQLineItem, RFQAttachment.
- SupplierRFQAssignment.
- SupplierQuote, SupplierQuoteLineItem.
- AdminQuoteReview, MarginRule, MarginOverride.
- QuoteRelease, ReleasedQuoteOption.
- PurchaseOrder, PurchaseOrderLineItem.
- Order, OrderStatusEvent, DeliveryDocument.
- Dispute.
- Notification, EmailDeliveryLog.
- AuditLog.
- AnonymousIdentityMap.

Important data rules:

- Store real identities only where admin roles can access them.
- Use anonymous IDs like `CLT-00473` and `SUP-00821` in all cross-party views.
- Never expose `organizationName`, `contactEmail`, `contactPhone`, or `userId` through opposite-party Convex query responses.
- Attachments must pass review/sanitization before cross-party release and should use Convex file storage or the approved storage path.
- Keep price fields scoped: supplier raw price, admin margin, final client price.
- Supplier quote prices are internal. Client-facing quote queries only return admin-approved `clientFinalPrice`.

## 5. Security And Governance Baseline

Build these controls from the first sprint, not after the MVP:

- Tenant isolation by organization and portal type.
- RBAC checks in every protected Convex query, mutation, and action.
- Server-side permission enforcement; UI hiding alone is not enough.
- Immutable audit logs for pricing, approvals, status changes, user/role changes, and file access.
- Secure file uploads with type validation, size limits, private storage, and a malware scanning/review workflow before cross-party release.
- Session timeout and failed login lockout settings configurable by admin.
- Optional email OTP.
- SSO-ready authentication architecture for client organizations.
- Segregation-of-duties rules for sensitive admin pricing actions.
- Better Auth manages sessions; Convex functions enforce business authorization.

## 6. Workflow State Machines

Define state machines before UI work so each portal speaks the same operational language.

RFQ:

```text
Draft -> Submitted -> Matching -> Assigned -> Quoting -> Admin Review -> Released -> Selected -> PO Generated
Draft/Submitted/Matching/Assigned/Quoting can also move to Cancelled or Expired where rules allow.
```

Quote:

```text
Submitted -> Under Review -> Approved For Release -> Released -> Selected
Submitted/Under Review can also move to Rejected or Held.
Released can move to Expired or Lost.
```

PO:

```text
Draft -> Pending Approval -> Approved -> Sent To Supplier
Pending Approval can move to Rejected or Returned For Changes.
```

Order:

```text
Pending -> Confirmed -> Processing -> Shipped -> Delivered -> Receipt Confirmed -> Completed
Any active order can move to Disputed or Delayed.
```

## 7. Step-By-Step Build Plan

### Step 1: Product And UX Alignment

Deliverables:

- Confirm Phase 1 scope from the PRD.
- Resolve open PRD decisions that affect architecture.
- Map role permissions for all client, supplier, and admin roles.
- Create user journey maps for RFQ, quote review, PO approval, fulfillment, and disputes.
- Define bilingual content strategy and translation ownership.

Exit criteria:

- Signed-off Phase 1 scope.
- Role-permission matrix.
- Approved workflow diagrams.

### Step 2: Project Foundation

Deliverables:

- Initialize a React + TypeScript + Vite app managed by pnpm.
- Configure Convex, Better Auth Convex integration, React Router, Tailwind CSS, shadcn/ui, i18next, PostHog wrapper, Vitest, React Testing Library, and Playwright.
- Create the required `src/`, `convex/`, and `docs/` folder structure from `CLAUDE.md`.
- Configure TypeScript strict mode, linting, formatting, tests, and CI.
- Add environment validation.
- Add Convex schema, seed strategy, and local dev scripts.
- Add brand SVGs and fonts to the app asset structure.
- Create `.env.example` with the required Vite, Convex, PostHog, and Better Auth variables.

Exit criteria:

- App boots locally with `pnpm dev`.
- Convex backend runs locally with `pnpm convex dev`.
- CI runs lint, typecheck, unit tests, component tests, and build checks.
- Brand tokens are available in UI components.

### Step 3: Design System And Layout Shells

Deliverables:

- Implement bilingual Tailwind design tokens, typography, spacing, color, buttons, inputs, tables, badges, tabs, dialogs, drawers, toasts, and empty states using shadcn/ui as the base.
- Build RTL/LTR-aware layout utilities.
- Build React Router protected route shells for `/client`, `/supplier`, and `/admin`.
- Add authenticated navigation, breadcrumbs, page headers, and notification center.
- Use the correct MWRD logo per locale and context.
- Keep the existing landing page at `/` untouched.

Exit criteria:

- English and Arabic layouts render correctly.
- Shared UI components pass accessibility checks.
- No screen depends on hardcoded brand colors outside tokens.
- No UI code uses hardcoded physical left/right spacing where logical spacing is required.

### Step 4: Auth, RBAC, Organizations

Deliverables:

- Email/password login via Better Auth.
- Optional email OTP structure via Better Auth-compatible flow.
- SSO-ready organization configuration for SAML 2.0/OAuth client organizations.
- Users, roles, permissions, invitations, activation/suspension.
- Admin-configurable session timeout and lockout rules.
- Profile language preference.

Exit criteria:

- Portal access is role-gated.
- Unauthorized actions fail inside Convex functions.
- Language preference persists per user.

### Step 5: Admin Setup Core

Deliverables:

- Admin dashboard foundation.
- Lead management.
- Client organization management.
- Supplier onboarding, qualification, category/region mapping.
- Category and catalog management with Arabic/English fields.
- Product visibility controls.

Exit criteria:

- Admin can create client and supplier organizations.
- Admin can configure categories and catalog items.
- Client catalog displays products without prices.

### Step 6: Client Catalog And RFQ Creation

Deliverables:

- Catalog browse/search/filter.
- Product details with images/specs and no prices.
- Cart and saved product lists.
- RFQ creation from cart.
- Non-catalog RFQ request.
- Notes and attachments.
- CSV bulk RFQ upload.
- Repeat previous RFQ.
- Client RFQ timeline.

Exit criteria:

- Client can submit catalog and non-catalog RFQs.
- No client-facing Convex query response includes hidden price data.
- RFQ audit events are captured.

### Step 7: Supplier RFQ Inbox And Quoting

Deliverables:

- Supplier dashboard.
- RFQ inbox using anonymous client IDs only.
- Accept/decline RFQ.
- Structured decline reasons.
- Quote submission with line item prices, lead time, validity, partial fulfillment.
- Quote history and basic win/loss visibility.

Exit criteria:

- Supplier never sees real client identity.
- Supplier quote submission creates admin review tasks.
- Quote changes are auditable.

### Step 8: Admin RFQ Operations And Pricing Control

Deliverables:

- RFQ operations queue.
- Supplier matching and reassignment.
- SLA timers and exception flags.
- Supplier quote aggregation.
- Margin rule engine.
- Manual margin override with reason capture.
- Quote approval/rejection/hold.
- Quote release to client.
- PostHog `quotes_released` event through `src/lib/analytics.ts`.

Exit criteria:

- Admin can transform supplier raw quotes into client-facing final quotes.
- Margin changes are logged.
- Released quotes hide real supplier identities.

### Step 9: Client Quote Comparison And Selection

Deliverables:

- Side-by-side anonymous quote comparison.
- Supplier anonymous ID, rating, completed transactions, delivery time, final price, validity.
- Sorting and comparison controls.
- Quote selection.
- Lock selection after approval workflow starts.
- PostHog `quote_selected` event through `src/lib/analytics.ts`.

Exit criteria:

- Client can select a released quote.
- Real supplier identity is not present in client-facing Convex query responses.
- Quote expiry is enforced.

### Step 10: Purchase Orders And Approval Workflows

Deliverables:

- PO generation from selected quote.
- Client terms and conditions templates.
- Signature and stamp upload.
- Sequential approvals.
- Parallel approvals.
- Threshold-based routing.
- Delegation and escalation.
- PDF download in preferred language.
- PostHog `po_approved` event through `src/lib/analytics.ts`.

Exit criteria:

- PO approval routes correctly by department, threshold, and role.
- Approved PO can be released to supplier.
- PO approval/rejection is fully audited.

### Step 11: Supplier Orders And Fulfillment

Deliverables:

- Supplier order dashboard.
- PO receipt view.
- Order statuses: Pending, Confirmed, Processing, Shipped, Delivered.
- Shipping/delivery document uploads.
- Delivery confirmation request.
- Supplier disputes.
- PostHog `order_status_updated` event through `src/lib/analytics.ts`.

Exit criteria:

- Supplier can update fulfillment status.
- Client sees order timeline updates.
- Supplier still only sees anonymous client identity.

### Step 12: Client Order Tracking And Disputes

Deliverables:

- Active/historical orders.
- Delivery status timeline.
- Delayed order alerts.
- Receipt confirmation.
- Dispute/delivery issue creation.
- PostHog `delivery_confirmed` event through `src/lib/analytics.ts`.

Exit criteria:

- Client can complete delivery confirmation.
- Order completion updates metrics.
- Disputes route to admin.

### Step 13: Notifications And Audit Logs

Deliverables:

- In-platform notification center.
- Email templates in Arabic and English.
- Convex-driven notification dispatcher.
- Quote expiry reminders.
- Approval requests.
- Order status notifications.
- Admin broadcasts.
- Searchable audit logs and export.

Exit criteria:

- Key RFQ/quote/PO/order events trigger notifications.
- Notification delivery is logged.
- Audit export works for admin roles.

### Step 14: Reporting And Analytics

Deliverables:

- Client spend by department, category, branch, and period.
- RFQ-to-order conversion.
- Average time to quote.
- Average PO approval time.
- Supplier on-time delivery and fill rate.
- Admin revenue and margin reports.
- Exportable reports.
- Centralized analytics events documented in `docs/analytics-plan.md`.
- Required analytics events: `login_success`, `rfq_created`, `rfq_submitted`, `supplier_quote_submitted`, `quotes_released`, `quote_selected`, `po_approved`, `order_status_updated`, `delivery_confirmed`, `language_switched`.

Exit criteria:

- Phase 1 operational reports are usable.
- Metrics definitions are documented.
- Reports respect role and tenant permissions.

### Step 15: AI-Assisted Features

Implement after the core workflow is stable.

Deliverables:

- RFQ classification.
- Supplier matching recommendations.
- Quote ranking support.
- Margin recommendation.
- Price benchmarking.
- Repeated RFQ suggestions.
- Supplier performance insights.

Rules:

- AI recommends; admin/user decides.
- Store recommendation inputs and outputs for auditability.
- Never send identifying data to AI services unless approved by privacy policy and architecture review.

Exit criteria:

- AI features are explainable, optional, and reviewable.
- No anonymity rules are weakened.

### Step 16: QA, UAT, And Hardening

Deliverables:

- Unit, integration, and end-to-end tests.
- Vitest tests for Convex business logic.
- React Testing Library component tests.
- Playwright E2E tests under `e2e/`.
- Permission matrix tests.
- Convex query response leakage tests for anonymity.
- RTL/LTR visual QA.
- Accessibility pass.
- Performance testing for dashboard and search.
- Security testing for upload, auth, session, and tenant isolation.
- UAT scripts for all three portals.

Exit criteria:

- Critical workflows pass E2E tests.
- No high-risk permission or identity leakage issues remain.
- Dashboard load target is under 3 seconds under normal load.

### Step 17: Deployment And Operations

Deliverables:

- Staging and production environments.
- Convex deployment and data backup/export plan.
- Convex file storage lifecycle policy.
- Monitoring dashboards.
- Error alerts.
- Convex action/scheduled workflow monitoring.
- PostHog analytics verification.
- Admin runbooks for RFQ exceptions, quote release, supplier delays, and disputes.

Exit criteria:

- Production deploy is repeatable.
- Operational team can manage exceptions without engineering support.
- Rollback and backup procedures are tested.

## 8. Phase 1 MVP Definition

Phase 1 should include:

- Auth, organizations, roles, permissions.
- Arabic/English with RTL/LTR.
- Required stack from `CLAUDE.md`: Vite, React, TypeScript, Convex, Better Auth, Tailwind, shadcn/ui, i18next, PostHog, pnpm.
- Admin client/supplier/category/catalog setup.
- Client catalog without prices.
- Client RFQ submission.
- Supplier RFQ inbox and quote submission.
- Admin supplier matching, quote review, margin control, quote release.
- Client quote comparison and quote selection.
- PO generation and approval workflow.
- Supplier order fulfillment.
- Client delivery confirmation.
- Notifications.
- Audit logs.
- Basic dashboards and operational reports.

Defer to Phase 2:

- Advanced analytics.
- AI recommendations.
- Supplier scorecards beyond basic operational metrics.
- Advanced exception handling.

Defer to Phase 3:

- ERP integrations.
- Advanced governance automation.
- Expanded AI assistance.

## 9. Critical Risks To Control Early

- Identity leakage through Convex payloads, filenames, attachments, notification text, or logs.
- Price leakage in catalog, client-side state, search indexes, or exports.
- Approval workflow complexity causing blocked POs.
- Manual margin overrides without audit trail.
- RTL implemented as a late styling pass instead of a first-class layout mode.
- Admin operations becoming too slow because RFQ matching, quote review, and exceptions are not modeled as clear operational queues in Convex.
- Reporting definitions changing after data is already stored inconsistently.
- Direct PostHog calls inside components instead of the centralized analytics wrapper.

## 10. Immediate Next Actions

1. Treat `/Users/bigo/Desktop/CLAUDE.md` as the required project guide and keep it updated when architecture decisions change.
2. Convert PRD requirements into tracked epics and user stories.
3. Create the role-permission matrix using the exact role keys from `CLAUDE.md`.
4. Create low-fidelity UX flows for `/client`, `/supplier`, and `/admin`.
5. Set up the Vite + React + TypeScript + Convex project with pnpm.
6. Implement Better Auth, i18next, route guards, tenant/RBAC checks, and brand tokens before domain screens.
7. Build the Phase 1 procurement workflow end to end as a thin vertical slice.
