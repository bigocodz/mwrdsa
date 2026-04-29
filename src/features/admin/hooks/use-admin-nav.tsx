import { Activity, Building2, ClipboardCheck, LayoutDashboard, PackageSearch, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

export function useAdminNav() {
  const { t } = useTranslation("common");

  return [
    { label: t("navigation.dashboard"), href: "/admin/dashboard", icon: <LayoutDashboard className="size-4" /> },
    { label: t("navigation.operations"), href: "/admin/operations", icon: <Activity className="size-4" /> },
    { label: t("navigation.clients"), href: "/admin/clients", icon: <Building2 className="size-4" /> },
    { label: t("navigation.suppliers"), href: "/admin/suppliers", icon: <ShieldCheck className="size-4" /> },
    { label: t("navigation.catalog"), href: "/admin/catalog", icon: <PackageSearch className="size-4" /> },
    { label: t("navigation.audit"), href: "/admin/audit", icon: <ClipboardCheck className="size-4" /> }
  ];
}
