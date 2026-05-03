import { createBrowserRouter, Navigate } from "react-router-dom";
import { AdminDashboardPage } from "@/features/admin/pages/admin-dashboard-page";
import { AdminKycPage } from "@/features/admin/pages/admin-kyc-page";
import { AdminLeadsPage } from "@/features/admin/pages/admin-leads-page";
import { AdminOfferApprovalsPage } from "@/features/admin/pages/admin-offer-approvals-page";
import { AdminReportsPage } from "@/features/admin/pages/admin-reports-page";
import { AdminRfqPricingPage } from "@/features/admin/pages/admin-rfq-pricing-page";
import {
  AdminAuditPage,
  AdminCatalogPage,
  AdminClientsPage,
  AdminOperationsPage,
  AdminSuppliersPage
} from "@/features/admin/pages/admin-workspace-pages";
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { UnauthorizedPage } from "@/pages/unauthorized-page";
import { ProtectedRoute } from "@/routes/protected-route";

export const backofficeRouter = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/admin" replace />
  },
  { path: "/auth/login", element: <LoginPage /> },
  { path: "/unauthorized", element: <UnauthorizedPage /> },
  {
    path: "/admin",
    element: <ProtectedRoute portal="admin" />,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: "dashboard", element: <AdminDashboardPage /> },
      { path: "leads", element: <AdminLeadsPage /> },
      { path: "kyc", element: <AdminKycPage /> },
      { path: "operations", element: <AdminOperationsPage /> },
      { path: "operations/:rfqId", element: <AdminRfqPricingPage /> },
      { path: "clients", element: <AdminClientsPage /> },
      { path: "suppliers", element: <AdminSuppliersPage /> },
      { path: "catalog", element: <AdminCatalogPage /> },
      { path: "offers", element: <AdminOfferApprovalsPage /> },
      { path: "reports", element: <AdminReportsPage /> },
      { path: "audit", element: <AdminAuditPage /> }
    ]
  },
  { path: "*", element: <NotFoundPage /> }
]);
