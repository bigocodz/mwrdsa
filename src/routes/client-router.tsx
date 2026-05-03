import { createBrowserRouter, Navigate } from "react-router-dom";
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
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { UnauthorizedPage } from "@/pages/unauthorized-page";
import { ProtectedRoute } from "@/routes/protected-route";

export const clientRouter = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/client" replace />
  },
  { path: "/auth/login", element: <LoginPage /> },
  { path: "/unauthorized", element: <UnauthorizedPage /> },
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
  { path: "*", element: <NotFoundPage /> }
]);
