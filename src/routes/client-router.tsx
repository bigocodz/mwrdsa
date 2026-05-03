import { createBrowserRouter, Navigate } from "react-router-dom";
import { ClientApprovalTreePage } from "@/features/account/pages/client-approval-tree-page";
import { ClientAddressBookPage } from "@/features/account/pages/client-address-book-page";
import { ClientBundlesPage } from "@/features/account/pages/client-bundles-page";
import { ClientCompanyCatalogsPage } from "@/features/account/pages/client-company-catalogs-page";
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
import { ActivatePage } from "@/pages/activate-page";
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { OnboardingPage } from "@/pages/onboarding-page";
import { RegisterPage } from "@/pages/register-page";
import { RegisterThankYouPage } from "@/pages/register-thank-you-page";
import { UnauthorizedPage } from "@/pages/unauthorized-page";
import { ProtectedRoute } from "@/routes/protected-route";

export const clientRouter = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/client" replace />
  },
  { path: "/auth/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/register/thank-you", element: <RegisterThankYouPage /> },
  { path: "/activate", element: <ActivatePage /> },
  { path: "/onboarding", element: <OnboardingPage /> },
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
      { path: "reports", element: <ClientReportsPage /> },
      // Account & settings (Slices 16, 20, 21, 22)
      { path: "account/approval-tree", element: <ClientApprovalTreePage /> },
      { path: "account/addresses", element: <ClientAddressBookPage /> },
      { path: "account/bundles", element: <ClientBundlesPage /> },
      { path: "account/company-catalogs", element: <ClientCompanyCatalogsPage /> },
      { path: "account/company-catalogs/:companyCatalogId", element: <ClientCompanyCatalogsPage /> }
    ]
  },
  { path: "*", element: <NotFoundPage /> }
]);
