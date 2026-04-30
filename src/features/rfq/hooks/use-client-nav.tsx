import { BarChart3, FileText, GitCompareArrows, LayoutDashboard, PackageSearch, ShoppingBag } from "lucide-react";
import { useTranslation } from "react-i18next";

export function useClientNav() {
  const { t } = useTranslation("common");

  return [
    { label: t("navigation.dashboard"), href: "/client/dashboard", icon: <LayoutDashboard className="size-4" /> },
    { label: t("navigation.catalog"), href: "/client/catalog", icon: <ShoppingBag className="size-4" /> },
    { label: t("navigation.rfqs"), href: "/client/rfqs", icon: <FileText className="size-4" /> },
    { label: t("navigation.quotes"), href: "/client/quotes", icon: <GitCompareArrows className="size-4" /> },
    { label: t("navigation.orders"), href: "/client/orders", icon: <PackageSearch className="size-4" /> },
    { label: t("navigation.reports", { defaultValue: "Reports" }), href: "/client/reports", icon: <BarChart3 className="size-4" /> }
  ];
}
