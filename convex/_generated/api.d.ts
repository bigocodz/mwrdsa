/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as addresses from "../addresses.js";
import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as approvals from "../approvals.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as betterAuth_index from "../betterAuth/index.js";
import type * as bundles from "../bundles.js";
import type * as catalog from "../catalog.js";
import type * as companyCatalogs from "../companyCatalogs.js";
import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as http from "../http.js";
import type * as idempotency from "../idempotency.js";
import type * as notifications from "../notifications.js";
import type * as numbers from "../numbers.js";
import type * as observability from "../observability.js";
import type * as offers from "../offers.js";
import type * as orders from "../orders.js";
import type * as orgs from "../orgs.js";
import type * as payments from "../payments.js";
import type * as publicAuth from "../publicAuth.js";
import type * as purchaseOrders from "../purchaseOrders.js";
import type * as quotes from "../quotes.js";
import type * as rateLimits from "../rateLimits.js";
import type * as rbac from "../rbac.js";
import type * as rfqs from "../rfqs.js";
import type * as scheduled from "../scheduled.js";
import type * as seed from "../seed.js";
import type * as storage from "../storage.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  addresses: typeof addresses;
  admin: typeof admin;
  analytics: typeof analytics;
  approvals: typeof approvals;
  audit: typeof audit;
  auth: typeof auth;
  "betterAuth/index": typeof betterAuth_index;
  bundles: typeof bundles;
  catalog: typeof catalog;
  companyCatalogs: typeof companyCatalogs;
  crons: typeof crons;
  documents: typeof documents;
  http: typeof http;
  idempotency: typeof idempotency;
  notifications: typeof notifications;
  numbers: typeof numbers;
  observability: typeof observability;
  offers: typeof offers;
  orders: typeof orders;
  orgs: typeof orgs;
  payments: typeof payments;
  publicAuth: typeof publicAuth;
  purchaseOrders: typeof purchaseOrders;
  quotes: typeof quotes;
  rateLimits: typeof rateLimits;
  rbac: typeof rbac;
  rfqs: typeof rfqs;
  scheduled: typeof scheduled;
  seed: typeof seed;
  storage: typeof storage;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
