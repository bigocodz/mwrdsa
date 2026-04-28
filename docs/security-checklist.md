# Security Checklist

## Authorization

- Convex queries and mutations enforce authorization server-side.
- UI route guards are UX only.
- Every protected function checks caller organization and role.

## Anonymity

- Supplier-facing functions never return client real names, users, emails, or phone numbers.
- Client-facing functions never return supplier real names, users, emails, or phone numbers.
- Client-facing quote functions only return admin-approved final prices.
- Supplier raw prices never appear in client-facing payloads.

## Files

- Uploaded files are private by default.
- Attachments crossing between client and supplier require sanitization review.
- Original filenames must be checked for identifying information before cross-party release.

## Audit

- RFQ creation and submission are logged.
- Quote submission, margin changes, approvals, and release actions are logged.
- PO approval/rejection and order status updates are logged.
- Role and permission changes are logged.

## Bilingual And RTL

- Arabic is the default language.
- New screens are visually checked in Arabic RTL and English LTR.
- Directional icons mirror in RTL.
