import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authClient, isBetterAuthConfigured } from "@/lib/auth-client";
import type { PortalRole, PortalType } from "@/types/auth";
import type { SupportedLanguage } from "@/lib/i18n";

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
  const sessionUser = useQuery(api.auth.getCurrentSession, isBetterAuthConfigured ? {} : "skip") as SessionUser | null | undefined;
  const user = isBetterAuthConfigured ? (sessionUser ?? null) : demoUser;
  const isLoading = isBetterAuthConfigured && sessionUser === undefined;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      hasRole: (roles) => roles.some((role) => user?.roles.includes(role)),
      setLanguagePreference: (language) => {
        localStorage.setItem("mwrd-language", language);
      },
      signOut: async () => {
        if (isBetterAuthConfigured) {
          await authClient.signOut();
        }
      }
    }),
    [isLoading, user]
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
