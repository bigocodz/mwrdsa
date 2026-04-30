# Analytics Plan

Analytics must be sent through `src/lib/analytics.ts`. Components must not call PostHog directly.

## Reporting Surfaces

| Surface | Convex Query | Audience | Metrics |
|---|---|---|---|
| Client reports | `api.analytics.getClientReportSummary` | Client users with reporting access | Spend, RFQ-to-order conversion, time to quote, PO approval time, category spend |
| Admin revenue and margin | `api.analytics.getAdminRevenueMarginSummary` | Admin users with `analytics:view` | Revenue, supplier cost, gross margin, margin rate, margin overrides, client and supplier breakdowns |

## Required Events

| Event | Trigger | Initial Properties |
|---|---|---|
| `login_success` | Successful authentication | `user_id`, `organization_id`, `portal` |
| `rfq_created` | RFQ saved as draft | `rfq_id`, `organization_id`, `line_item_count` |
| `rfq_submitted` | RFQ submitted for processing | `rfq_id`, `organization_id` |
| `supplier_quote_submitted` | Supplier submits quotation | `rfq_id`, `quote_id`, `supplier_anonymous_id` |
| `quotes_released` | Admin releases quotes to client | `rfq_id`, `released_quote_count` |
| `quote_selected` | Client selects a quote | `rfq_id`, `quote_id`, `supplier_anonymous_id` |
| `po_approved` | Final PO approval completed | `purchase_order_id`, `approval_step_count` |
| `order_status_updated` | Any order status change | `order_id`, `status` |
| `delivery_confirmed` | Client confirms delivery receipt | `order_id` |
| `language_switched` | User switches language | `language` |

## Privacy Rules

- Never send client or supplier real names to PostHog.
- Prefer anonymous IDs for cross-party workflow events.
- Do not include filenames, attachment contents, contact details, phone numbers, or emails in event payloads.
- Keep analytics payloads small and operational.

## Step 14 Remaining Scope

- Supplier on-time delivery and fill-rate reports should be backed by order status history and selected quote line-item fulfillment data.
- Client department, branch, and cost-center breakdowns require those dimensions on RFQs, purchase orders, or client organization metadata before they can be reported accurately.
