# Analytics Plan

Analytics must be sent through `src/lib/analytics.ts`. Components must not call PostHog directly.

## Reporting Surfaces

| Surface | Convex Query | Audience | Metrics |
|---|---|---|---|
| Client reports | `api.analytics.getClientReportSummary` | Client users with reporting access | Approved PO spend, RFQ-to-order conversion, time to quote, PO approval time, category spend, department/branch/cost-center spend |
| Admin revenue and margin | `api.analytics.getAdminRevenueMarginSummary` | Admin users with `analytics:view` | Approved PO revenue, supplier cost, gross margin, margin rate, margin overrides, client and supplier breakdowns |
| Supplier performance | `api.analytics.getSupplierPerformanceSummary` | Supplier users with `analytics:view` | Response rate, win rate, on-time delivery, fill rate, fulfillment rows |

## Required Events

| Event | Trigger | Initial Properties |
|---|---|---|
| `login_success` | Successful authentication | `user_id`, `organization_id`, `portal` |
| `rfq_created` | RFQ saved as draft | `rfq_id`, `organization_id`, `line_item_count` |
| `rfq_submitted` | RFQ submitted for processing | `rfq_id`, `organization_id` |
| `supplier_quote_submitted` | Supplier submits quotation | `rfq_id`, `quote_id`, `supplier_anonymous_id` |
| `quotes_released` | Admin releases quotes to client | `rfq_id`, `released_quote_count` |
| `quote_selected` | Client selects a quote (full basket) | `rfq_id`, `quote_id`, `supplier_anonymous_id` |
| `quote_split_awarded` | Client splits award across multiple suppliers | `rfq_id`, `unique_supplier_count` |
| `po_approved` | Final PO approval completed | `purchase_order_id`, `approval_step_count` |
| `order_status_updated` | Any order status change | `order_id`, `status` |
| `delivery_confirmed` | Client confirms delivery receipt | `order_id` |
| `language_switched` | User switches language | `language` |

## Privacy Rules

- Never send client or supplier real names to PostHog.
- Prefer anonymous IDs for cross-party workflow events.
- Do not include filenames, attachment contents, contact details, phone numbers, or emails in event payloads.
- Keep analytics payloads small and operational.

## Step 14 Status

- Phase 1 reporting is wired for client spend, admin revenue/margin, supplier performance, and client department/branch/cost-center breakdowns.

## Metric Notes

- Supplier on-time delivery uses the first `delivered`, `receiptConfirmed`, or `completed` order status event against the RFQ required delivery date.
- Supplier fill rate currently uses selected quote line-item coverage against requested RFQ line quantities. Shipment-level fulfilled quantity should replace this when partial delivery tracking is added.
- Client department, branch, and cost-center breakdowns use RFQ dimensions captured at request time. Older RFQs without dimensions are grouped as `Unassigned`.
