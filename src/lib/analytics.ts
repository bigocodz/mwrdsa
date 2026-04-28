import posthog from "posthog-js";

export const analyticsEvents = {
  loginSuccess: "login_success",
  rfqCreated: "rfq_created",
  rfqSubmitted: "rfq_submitted",
  supplierQuoteSubmitted: "supplier_quote_submitted",
  quotesReleased: "quotes_released",
  quoteSelected: "quote_selected",
  poApproved: "po_approved",
  orderStatusUpdated: "order_status_updated",
  deliveryConfirmed: "delivery_confirmed",
  languageSwitched: "language_switched"
} as const;

export type AnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

let isAnalyticsInitialized = false;

export function initAnalytics() {
  if (isAnalyticsInitialized) {
    return;
  }

  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) {
    return;
  }

  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://app.posthog.com",
    capture_pageview: false
  });

  isAnalyticsInitialized = true;
}

export function trackEvent(eventName: AnalyticsEventName, properties: AnalyticsProperties = {}) {
  if (!isAnalyticsInitialized) {
    initAnalytics();
  }

  if (!isAnalyticsInitialized) {
    return;
  }

  posthog.capture(eventName, properties);
}
