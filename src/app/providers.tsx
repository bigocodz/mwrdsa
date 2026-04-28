import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import "@/lib/i18n";

const convexUrl = import.meta.env.VITE_CONVEX_URL || "https://placeholder.convex.cloud";
const convex = new ConvexReactClient(convexUrl);

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ConvexProvider client={convex}>
      <AuthProvider>{children}</AuthProvider>
    </ConvexProvider>
  );
}
