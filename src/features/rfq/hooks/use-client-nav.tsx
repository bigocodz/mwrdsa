import { BarChart3, FileText, GitCompareArrows, LayoutDashboard, PackageSearch, ShoppingBag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export function useClientNav() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const canViewReports = Boolean(user && hasPermission(user.roles, "analytics:view"));

  const items = [
    { label: t("navigation.dashboard"), href: "/client/dashboard", icon: <LayoutDashboard className="size-4" /> },
    { label: t("navigation.catalog"), href: "/client/catalog", icon: <ShoppingBag className="size-4" /> },
    { label: t("navigation.rfqs"), href: "/client/rfqs", icon: <FileText className="size-4" /> },
    { label: t("navigation.quotes"), href: "/client/quotes", icon: <GitCompareArrows className="size-4" /> },
    { label: t("navigation.orders"), href: "/client/orders", icon: <PackageSearch className="size-4" /> }
  ];

  if (canViewReports) {
    items.push({ label: t("navigation.reports"), href: "/client/reports", icon: <BarChart3 className="size-4" /> });
  }

  return items;
}
