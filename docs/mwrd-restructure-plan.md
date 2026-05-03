# MWRD Restructure Plan

This document is the source of truth for restructuring the MWRD webapp to match the spec in `MWRD_RESTRUCTURE_GUIDE.md`. It captures the agreed app topology, slice order, and SaaS-aware guarantees.

## Stack and topology

- **Stack stays as-is.** Vite + React + TypeScript + Convex + Better Auth + Tailwind/shadcn + i18next + PostHog + pnpm. No Turborepo, no Next.js, no Expo.
- **Three Vite builds, one repo, one Convex backend.** Each portal is its own independently deployable bundle.
  - `apps/client/` → `dist/client/` → `client.mwrd.io`
  - `apps/supplier/` → `dist/supplier/` → `supplier.mwrd.io`
  - `apps/backoffice/` → `dist/backoffice/` → `backoffice.mwrd.io`
- **Shared code lives in `src/`** (lib, components, features, hooks, types, i18n, styles). All three apps import from `@/*`.
- **Per-portal entry points:** `apps/<portal>/main.tsx` mounts only its own router (`src/routes/<portal>-router.tsx`). The other portals' route trees and feature pages are not in the bundle.
- **Build-time portal flag:** each Vite config injects `__BUILD_PORTAL__ = "client" | "supplier" | "backoffice"`. `getBuildPortalType()` reads it; `ProtectedRoute` refuses any portal that doesn't match the build flag, so a hostile route push cannot land on a forbidden screen even if guards drift.
- **Mobile (Expo)** is deferred to Phase 1.5.

## Why split, not deferred

- **Bundle size.** Each portal ships only its own routes — first-contentful-paint shrinks vs the prior combined SPA.
- **Independent scaling and caching.** Three CDN deploys, three cache rules, three rollback surfaces.
- **Real auth boundary.** Subdomain cookies bound to one portal cannot be replayed against another.
- **Blast radius.** A bug in admin code cannot ship to client browsers.
- **WAF / DDoS rules.** Backoffice can require IP allowlist or Cloudflare Access while public portals stay open.

## Spec name → repo name (no rename, mapped via docs only)

| Spec term | Repo term |
|---|---|
| `User.real_name` | `users.name` |
| `User.platform_alias` | `users` does not store this; resolved via the org's `clientAnonymousId` / `supplierAnonymousId` |
| `Company` | `organizations` |
| `Company.real_name` | `organizations.name` |
| `Company.platform_alias` | `organizations.clientAnonymousId` / `organizations.supplierAnonymousId` |
| `Address` | (to add in slice 20) |
| `ApprovalNode` | (to add in slice 16) |
| `MasterProduct` | `products` |
| `Offer` | `supplierOffers` |
| `ProductAdditionRequest` | `productAdditionRequests` |
| `Bundle` | (to add in slice 21) |
| `Cart` | `savedRfqCarts` (active cart is the in-progress RFQ) |
| `RFQ.source` | (to add in slice 23) |
| `Quote.is_auto_generated` | implicit via `quote.auto_generated` audit + held flag (slice 7) |
| `PO.type='CPO'/'SPO'` + `transaction_ref` | (to add in slice 17) |
| `DN`, `GRN`, `Invoice` | (to add in slice 18) |

## Slice order

Pre-feature scale slices (SaaS-aware):

- **Slice 11.5 — three Vite builds + per-portal route guards.** *Implemented.*
- **Slice 11.6 — tenant-scoped index audit, idempotency keys, rate limits, scheduled-functions module, server-side observability.** *Implemented.*
- **Slice 11.7 — anonymity CI gate (fixture real-name leak grep + cross-party shape tests).** *Implemented.*

Feature restructure slices:

- **Slice 12 — doc cleanup (remove ZATCA / Tap doc references) + Moyasar payment stub interface + storage URL interface.** *Implemented.*
- **Slice 13 — public registration + callback + activation + onboarding wizard.** *Implemented.*
- **Slice 14 — leads queue + KYC queue.** *Implemented.*
- **Slice 15 — backoffice auth split: idle timeout + cross-portal sign-in refusal.** *Implemented.*
- **Slice 16 — Approval Tree (`approvalNodes` + cycle detection + per-step `approvalTasks`).** *Implemented.*
- **Slice 17 — Dual PO (CPO + SPO + `transactionRef`).** *Implemented.*
- **Slice 18 — DN + GRN + Invoice + three-way match.** *Implemented.*
- **Slice 19 — pack-type repeater + master product code + numbering generators.** *Implemented.*
- Slice 20 — address book.
- Slice 21 — Bundles (Essentials Packs).
- Slice 22 — Company Catalogs.
- Slice 23 — Custom Request RFQ flag + 200–300 seeded master products.
- Slice 24 — VAT 15% line items + PDF stubs (via storage interface).
- Slice 25 — internal users management (superadmin invite).
- Slice 26 — anonymity tests with fixture real names + Playwright smoke + load test rerun.

## Out of scope

- ZATCA / Fatoora — removed from docs in slice 12, never added to code.
- Tap Payments — never added; Moyasar stub interface in slice 12.
- Wallet, Reports module, Subscriptions, Company Contracts, Analytics Tags, Bulk Orders, CS ticketing, Tiered pricing, CSV bulk offer upload, supplier ratings, AI features, 2FA — all v2.
- Mobile (Expo) — Phase 1.5.

## Local dev commands

- `pnpm dev` or `pnpm dev:client` → client portal on http://localhost:5173
- `pnpm dev:supplier` → supplier portal on http://localhost:5174
- `pnpm dev:backoffice` → backoffice portal on http://localhost:5175
- `pnpm convex dev` → backend (single Convex deployment serves all three)
- `pnpm build` → builds all three portals into `dist/{client,supplier,backoffice}/`
- `pnpm build:client` / `pnpm build:supplier` / `pnpm build:backoffice` → single-portal builds for CI
