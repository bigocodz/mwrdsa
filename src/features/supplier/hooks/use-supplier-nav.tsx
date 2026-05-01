import { BarChart3, ClipboardList, FileCheck2, LayoutDashboard, PackageCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export function useSupplierNav() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const canViewPerformance = Boolean(user && hasPermission(user.roles, "analytics:view"));

  const items = [
    { label: t("navigation.dashboard"), href: "/supplier/dashboard", icon: <LayoutDashboard className="size-4" /> },
    { label: t("navigation.rfq_inbox"), href: "/supplier/rfqs", icon: <ClipboardList className="size-4" /> },
    { label: t("navigation.quotes"), href: "/supplier/quotes", icon: <FileCheck2 className="size-4" /> },
    { label: t("navigation.orders"), href: "/supplier/orders", icon: <PackageCheck className="size-4" /> }
  ];

  if (canViewPerformance) {
    items.push({ label: t("navigation.performance"), href: "/supplier/performance", icon: <BarChart3 className="size-4" /> });
  }

  return items;
}
