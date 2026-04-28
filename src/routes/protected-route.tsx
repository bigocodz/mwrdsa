import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { canAccessPortal } from "@/lib/permissions";
import type { PortalType } from "@/types/auth";

type ProtectedRouteProps = {
  portal: PortalType;
};

export function ProtectedRoute({ portal }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  if (!user || !canAccessPortal(portal, user.roles)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
