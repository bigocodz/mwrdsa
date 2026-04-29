import { FileText, GitCompareArrows, LayoutDashboard, PackageSearch, ShoppingBag } from "lucide-react";
import { useTranslation } from "react-i18next";

export function useClientNav() {
  const { t } = useTranslation("common");

  return [
    { label: t("navigation.dashboard"), href: "/client/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { label: t("navigation.catalog"), href: "/client/catalog", icon: <ShoppingBag className="h-4 w-4" /> },
    { label: t("navigation.rfqs"), href: "/client/rfqs", icon: <FileText className="h-4 w-4" /> },
    { label: t("navigation.quotes"), href: "/client/quotes", icon: <GitCompareArrows className="h-4 w-4" /> },
    { label: t("navigation.orders"), href: "/client/orders", icon: <PackageSearch className="h-4 w-4" /> }
  ];
}
