import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PortalRole, PortalType } from "@/types/auth";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  portal: PortalType;
  roles: PortalRole[];
  organizationId: string;
};

type AuthContextValue = {
  user: SessionUser | null;
  isAuthenticated: boolean;
  hasRole: (roles: PortalRole[]) => boolean;
};

const demoUser: SessionUser = {
  id: "demo-admin",
  name: "MWRD Admin",
  email: "admin@mwrd.local",
  portal: "admin",
  roles: ["superAdmin", "orgAdmin", "supplierAdmin"],
  organizationId: "mwrd"
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const value = useMemo<AuthContextValue>(
    () => ({
      user: demoUser,
      isAuthenticated: true,
      hasRole: (roles) => roles.some((role) => demoUser.roles.includes(role))
    }),
    []
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
