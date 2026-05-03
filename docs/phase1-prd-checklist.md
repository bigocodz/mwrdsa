# Phase 1 PRD Checklist

This checklist tracks product/workflow compliance inside the current Convex/Vite implementation path.

## Architecture

- [x] Keep one portal app with role-based client, supplier, and admin workspaces.
- [x] Use Convex as the transactional backend instead of the PRD mock-data/Supabase swap layer.
- [ ] Document any investor-facing decision if exact Turborepo/Expo parity becomes required.

## Auth And Onboarding

- [x] Better Auth protected portal access.
- [ ] Public client/supplier callback request form.
- [ ] Admin leads queue.
- [ ] Admin KYC/document placeholder queue.
- [ ] First-login company profile onboarding.
- [ ] Separate backoffice login/session policy.

## Master Catalog And Supplier Offers

- [x] Admin-managed master catalog categories/products.
- [x] Supplier offer/rate-card records attached to master products.
- [x] Supplier "sell this product" workspace.
- [x] Supplier product addition request flow.
- [x] Admin supplier-offer approval queue.
- [x] Admin product-addition request queue.
- [ ] Pack-type catalog governance beyond free-text pack labels.
- [ ] 200-300 realistic seeded master products.

## RFQ And Quote Flow

- [x] Client catalog and non-catalog RFQs.
- [x] Supplier assignment and response window.
- [x] Supplier quote submission.
- [x] Admin margin review and release.
- [x] Client anonymous quote comparison.
- [x] Auto-match RFQ lines to approved supplier offers.
- [x] Auto-draft quotes from approved offers into admin review.
- [x] Threshold hold queue for quote manager.
- [x] Bulk quote release.
- [ ] Split award by line item.

## Client Procurement Depth

- [x] Local RFQ cart.
- [x] PO generation from selected quote.
- [x] Basic PO approval.
- [x] Saved carts with expiry.
- [ ] Bundles/essentials packs.
- [ ] Company catalogs.
- [ ] Address book.
- [ ] Configurable approval tree.

## Order And Finance Operations

- [x] Supplier order status tracking.
- [x] Client receipt confirmation and disputes.
- [ ] Client CPO and supplier SPO split with transaction reference.
- [ ] Delivery notes.
- [ ] Goods receipt notes.
- [ ] Invoices.
- [ ] Three-way match queue.
- [ ] PDF rendering stubs for CPO/SPO/DN/GRN/INV.
- [ ] ZATCA and Tap stubs.

## Reporting And Scale

- [x] Paginated high-volume portal lists.
- [x] Admin revenue/margin summary tables and report.
- [x] Client spend and department/branch/cost-center summaries.
- [x] Supplier on-time/fill-rate performance report.
- [x] Load-test seed command.
- [ ] Playwright smoke coverage for core PRD flows.

## Security And Anonymity

- [x] Backend contract tests for cross-party anonymity.
- [x] Contract tests for scale indexes and paginated screens.
- [ ] Integration tests with fixture real names/emails to prove no client/supplier leakage.
- [ ] Backoffice access tests for public users.
