import { createBrowserRouter, Navigate } from "react-router-dom";
import { SupplierOffersPage } from "@/features/offers/pages/supplier-offers-page";
import { SupplierAssignmentDetailPage } from "@/features/supplier/pages/supplier-assignment-detail-page";
import { SupplierDashboardPage } from "@/features/supplier/pages/supplier-dashboard-page";
import { SupplierOrderDetailPage } from "@/features/supplier/pages/supplier-order-detail-page";
import {
  SupplierOrdersPage,
  SupplierPerformancePage,
  SupplierQuotesPage,
  SupplierRfqsPage
} from "@/features/supplier/pages/supplier-workspace-pages";
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { UnauthorizedPage } from "@/pages/unauthorized-page";
import { ProtectedRoute } from "@/routes/protected-route";

export const supplierRouter = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/supplier" replace />
  },
  { path: "/auth/login", element: <LoginPage /> },
  { path: "/unauthorized", element: <UnauthorizedPage /> },
  {
    path: "/supplier",
    element: <ProtectedRoute portal="supplier" />,
    children: [
      { index: true, element: <Navigate to="/supplier/dashboard" replace /> },
      { path: "dashboard", element: <SupplierDashboardPage /> },
      { path: "rfqs", element: <SupplierRfqsPage /> },
      { path: "rfqs/:assignmentId", element: <SupplierAssignmentDetailPage /> },
      { path: "quotes", element: <SupplierQuotesPage /> },
      { path: "offers", element: <SupplierOffersPage /> },
      { path: "orders", element: <SupplierOrdersPage /> },
      { path: "orders/:orderId", element: <SupplierOrderDetailPage /> },
      { path: "performance", element: <SupplierPerformancePage /> }
    ]
  },
  { path: "*", element: <NotFoundPage /> }
]);
