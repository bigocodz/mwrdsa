import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const browserOrigin = typeof window === "undefined" ? "http://localhost:5173" : window.location.origin;

export const isBetterAuthConfigured = Boolean(import.meta.env.VITE_CONVEX_URL && import.meta.env.VITE_CONVEX_SITE_URL);

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL || import.meta.env.VITE_BETTER_AUTH_URL || browserOrigin,
  basePath: "/api/auth",
  plugins: [convexClient(), crossDomainClient()]
});
