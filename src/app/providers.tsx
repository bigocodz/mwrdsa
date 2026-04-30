import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { RfqCartProvider } from "@/features/rfq/hooks/use-rfq-cart";
import { AuthProvider } from "@/lib/auth";
import { authClient, isBetterAuthConfigured } from "@/lib/auth-client";
import "@/lib/i18n";

const convexUrl = import.meta.env.VITE_CONVEX_URL || "https://placeholder.convex.cloud";
const convex = new ConvexReactClient(convexUrl);

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  if (isBetterAuthConfigured) {
    return (
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <AuthProvider>
          <RfqCartProvider>{children}</RfqCartProvider>
        </AuthProvider>
      </ConvexBetterAuthProvider>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <AuthProvider>
        <RfqCartProvider>{children}</RfqCartProvider>
      </AuthProvider>
    </ConvexProvider>
  );
}
