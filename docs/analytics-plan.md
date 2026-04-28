# Analytics Plan

Analytics must be sent through `src/lib/analytics.ts`. Components must not call PostHog directly.

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
