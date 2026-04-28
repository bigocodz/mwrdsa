import { createBrowserRouter, Navigate } from "react-router-dom";
import { AdminDashboardPage } from "@/features/admin/pages/admin-dashboard-page";
import { ClientDashboardPage } from "@/features/rfq/pages/client-dashboard-page";
import { SupplierDashboardPage } from "@/features/supplier/pages/supplier-dashboard-page";
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { RootLandingBoundaryPage } from "@/pages/root-landing-boundary-page";
import { UnauthorizedPage } from "@/pages/unauthorized-page";
import { ProtectedRoute } from "@/routes/protected-route";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLandingBoundaryPage />
  },
  {
    path: "/auth/login",
    element: <LoginPage />
  },
  {
    path: "/unauthorized",
    element: <UnauthorizedPage />
  },
  {
    path: "/client",
    element: <ProtectedRoute portal="client" />,
    children: [
      { index: true, element: <Navigate to="/client/dashboard" replace /> },
      { path: "dashboard", element: <ClientDashboardPage /> }
    ]
  },
  {
    path: "/supplier",
    element: <ProtectedRoute portal="supplier" />,
    children: [
      { index: true, element: <Navigate to="/supplier/dashboard" replace /> },
      { path: "dashboard", element: <SupplierDashboardPage /> }
    ]
  },
  {
    path: "/admin",
    element: <ProtectedRoute portal="admin" />,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: "dashboard", element: <AdminDashboardPage /> }
    ]
  },
  {
    path: "*",
    element: <NotFoundPage />
  }
]);
