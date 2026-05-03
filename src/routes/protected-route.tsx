import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { getBuildPortalType } from "@/lib/build-portal";
import { canAccessPortal } from "@/lib/permissions";
import type { PortalType } from "@/types/auth";

type ProtectedRouteProps = {
  portal: PortalType;
};

export function ProtectedRoute({ portal }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  const buildPortal = getBuildPortalType();
  if (buildPortal !== portal) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to={`/auth/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (!user || !canAccessPortal(portal, user.roles, user.portal)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
