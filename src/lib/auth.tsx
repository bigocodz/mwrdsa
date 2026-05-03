import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authClient, isBetterAuthConfigured } from "@/lib/auth-client";
import { getBuildPortal } from "@/lib/build-portal";
import { useIdleSignOut } from "@/lib/use-idle-signout";
import type { PortalRole, PortalType } from "@/types/auth";
import type { SupportedLanguage } from "@/lib/i18n";

const BACKOFFICE_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const PUBLIC_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export function getPortalIdleTimeoutMs() {
  return getBuildPortal() === "backoffice" ? BACKOFFICE_IDLE_TIMEOUT_MS : PUBLIC_IDLE_TIMEOUT_MS;
}

type SessionUser = {
  id: string;
  name: string;
  email: string;
  portal: PortalType;
  roles: PortalRole[];
  organizationId: string;
  language: SupportedLanguage;
};

type AuthContextValue = {
  user: SessionUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasRole: (roles: PortalRole[]) => boolean;
  setLanguagePreference: (language: SupportedLanguage) => void;
  signOut: () => Promise<void>;
};

const demoUser: SessionUser = {
  id: "demo-admin",
  name: "MWRD Admin",
  email: "admin@mwrd.local",
  portal: "admin",
  roles: ["superAdmin", "orgAdmin", "supplierAdmin"],
  organizationId: "mwrd",
  language: (localStorage.getItem("mwrd-language") as SupportedLanguage | null) ?? "ar"
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const convexAuth = useConvexAuth();
  const sessionUser = useQuery(api.auth.getCurrentSession, isBetterAuthConfigured ? {} : "skip") as SessionUser | null | undefined;
  const user = isBetterAuthConfigured ? (sessionUser ?? null) : demoUser;
  const isLoading = isBetterAuthConfigured && (convexAuth.isLoading || (convexAuth.isAuthenticated && sessionUser === undefined));

  const signOut = useCallback(async () => {
    if (isBetterAuthConfigured) {
      await authClient.signOut();
    }
  }, []);

  useIdleSignOut({
    thresholdMs: getPortalIdleTimeoutMs(),
    enabled: isBetterAuthConfigured && Boolean(user),
    onIdle: () => {
      void signOut().then(() => {
        if (typeof window !== "undefined") {
          window.location.assign("/auth/login?reason=idle");
        }
      });
    }
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      hasRole: (roles) => roles.some((role) => user?.roles.includes(role)),
      setLanguagePreference: (language) => {
        localStorage.setItem("mwrd-language", language);
      },
      signOut
    }),
    [isLoading, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
