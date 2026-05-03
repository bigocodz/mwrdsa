import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sweep-saved-rfq-carts", { hours: 1 }, internal.scheduled.sweepExpiredSavedRfqCarts, {});
crons.interval("sweep-idempotency-keys", { hours: 1 }, internal.scheduled.sweepExpiredIdempotencyKeys, {});
crons.interval("sweep-rate-limits", { hours: 6 }, internal.scheduled.sweepStaleRateLimits, {});
crons.interval("sweep-mutation-metrics", { hours: 24 }, internal.scheduled.sweepOldMutationMetrics, {});

export default crons;
