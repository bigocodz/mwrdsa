export type RfqStatus =
  | "draft"
  | "submitted"
  | "matching"
  | "assigned"
  | "quoting"
  | "adminReview"
  | "released"
  | "selected"
  | "poGenerated"
  | "cancelled"
  | "expired";

export type QuoteStatus = "submitted" | "underReview" | "approvedForRelease" | "released" | "selected" | "rejected" | "held" | "expired" | "lost";

export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "receiptConfirmed" | "completed" | "disputed" | "delayed";
