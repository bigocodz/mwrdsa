import { BarChart3, ClipboardList, FileCheck2, LayoutDashboard, PackageCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

export function useSupplierNav() {
  const { t } = useTranslation("common");

  return [
    { label: t("navigation.dashboard"), href: "/supplier/dashboard", icon: <LayoutDashboard className="size-4" /> },
    { label: t("navigation.rfq_inbox"), href: "/supplier/rfqs", icon: <ClipboardList className="size-4" /> },
    { label: t("navigation.quotes"), href: "/supplier/quotes", icon: <FileCheck2 className="size-4" /> },
    { label: t("navigation.orders"), href: "/supplier/orders", icon: <PackageCheck className="size-4" /> },
    { label: t("navigation.performance"), href: "/supplier/performance", icon: <BarChart3 className="size-4" /> }
  ];
}
