import { createBrowserRouter, Navigate } from "react-router-dom";
import { AdminDashboardPage } from "@/features/admin/pages/admin-dashboard-page";
import { AdminOfferApprovalsPage } from "@/features/admin/pages/admin-offer-approvals-page";
import { AdminReportsPage } from "@/features/admin/pages/admin-reports-page";
import { AdminRfqPricingPage } from "@/features/admin/pages/admin-rfq-pricing-page";
import { AdminAuditPage, AdminCatalogPage, AdminClientsPage, AdminOperationsPage, AdminSuppliersPage } from "@/features/admin/pages/admin-workspace-pages";
import { ClientCatalogPage } from "@/features/catalog/pages/client-catalog-page";
import { ClientOrderDetailPage } from "@/features/orders/pages/client-order-detail-page";
import { ClientOrdersPage } from "@/features/orders/pages/client-orders-page";
import { ClientPurchaseOrderPage } from "@/features/orders/pages/client-purchase-order-page";
import { ClientReportsPage } from "@/features/reports/pages/client-reports-page";
import { ClientQuoteComparisonPage } from "@/features/quotes/pages/client-quote-comparison-page";
import { ClientQuotesPage } from "@/features/quotes/pages/client-quotes-page";
import { ClientDashboardPage } from "@/features/rfq/pages/client-dashboard-page";
import { ClientRfqDetailPage } from "@/features/rfq/pages/client-rfq-detail-page";
import { ClientRfqsPage } from "@/features/rfq/pages/client-rfqs-page";
import { SupplierOffersPage } from "@/features/offers/pages/supplier-offers-page";
import { SupplierAssignmentDetailPage } from "@/features/supplier/pages/supplier-assignment-detail-page";
import { SupplierDashboardPage } from "@/features/supplier/pages/supplier-dashboard-page";
import { SupplierOrderDetailPage } from "@/features/supplier/pages/supplier-order-detail-page";
import { SupplierOrdersPage, SupplierPerformancePage, SupplierQuotesPage, SupplierRfqsPage } from "@/features/supplier/pages/supplier-workspace-pages";
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
      { path: "dashboard", element: <ClientDashboardPage /> },
      { path: "catalog", element: <ClientCatalogPage /> },
      { path: "rfqs", element: <ClientRfqsPage /> },
      { path: "rfqs/:rfqId", element: <ClientRfqDetailPage /> },
      { path: "quotes", element: <ClientQuotesPage /> },
      { path: "quotes/:rfqId", element: <ClientQuoteComparisonPage /> },
      { path: "orders", element: <ClientOrdersPage /> },
      { path: "orders/po/:purchaseOrderId", element: <ClientPurchaseOrderPage /> },
      { path: "orders/:orderId", element: <ClientOrderDetailPage /> },
      { path: "reports", element: <ClientReportsPage /> }
    ]
  },
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
  {
    path: "/admin",
    element: <ProtectedRoute portal="admin" />,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: "dashboard", element: <AdminDashboardPage /> },
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
  {
    path: "*",
    element: <NotFoundPage />
  }
]);
