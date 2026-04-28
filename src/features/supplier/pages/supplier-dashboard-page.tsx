import { BarChart3, ClipboardList, PackageOpen, TimerReset } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MetricCard } from "@/components/metric-card";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SupplierDashboardPage() {
  const { t } = useTranslation(["common", "supplier"]);

  const navItems = [
    { label: t("navigation.dashboard", { ns: "common" }), href: "/supplier/dashboard" },
    { label: t("navigation.rfq_inbox", { ns: "common" }), href: "/supplier/rfqs" },
    { label: t("navigation.quotes", { ns: "common" }), href: "/supplier/quotes" },
    { label: t("navigation.orders", { ns: "common" }), href: "/supplier/orders" },
    { label: t("navigation.performance", { ns: "common" }), href: "/supplier/performance" }
  ];

  return (
    <PortalShell title={t("supplier.title", { ns: "common" })} description={t("supplier.description", { ns: "common" })} navItems={navItems}>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title={t("dashboard.awaiting_response", { ns: "supplier" })} value="9" detail={t("dashboard.awaiting_response_detail", { ns: "supplier" })} icon={<ClipboardList className="h-4 w-4 text-primary" />} />
        <MetricCard title={t("dashboard.deadlines", { ns: "supplier" })} value="3" detail={t("dashboard.deadlines_detail", { ns: "supplier" })} icon={<TimerReset className="h-4 w-4 text-primary" />} />
        <MetricCard title={t("dashboard.active_orders", { ns: "supplier" })} value="14" detail={t("dashboard.active_orders_detail", { ns: "supplier" })} icon={<PackageOpen className="h-4 w-4 text-primary" />} />
        <MetricCard title={t("dashboard.response_rate", { ns: "supplier" })} value="92%" detail={t("dashboard.response_rate_detail", { ns: "supplier" })} icon={<BarChart3 className="h-4 w-4 text-primary" />} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.inbox", { ns: "supplier" })}</CardTitle>
          <CardDescription>{t("dashboard.inbox_description", { ns: "supplier" })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {["CLT-00473", "CLT-00921", "CLT-00118"].map((clientId, index) => (
            <div key={clientId} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-semibold">{clientId}</p>
                <p className="text-sm text-muted-foreground">{t(`dashboard.sample_rfqs.${index}`, { ns: "supplier" })}</p>
              </div>
              <Badge variant={index === 0 ? "warning" : "outline"}>{t(`dashboard.sample_statuses.${index}`, { ns: "supplier" })}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
