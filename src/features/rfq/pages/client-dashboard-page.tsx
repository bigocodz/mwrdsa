import { Clock3, FileCheck2, FileText, GitCompareArrows, LayoutDashboard, PackageCheck, PackageSearch, ScrollText, ShoppingBag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MetricCard } from "@/components/metric-card";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ClientDashboardPage() {
  const { t } = useTranslation(["common", "rfq"]);

  const navItems = [
    { label: t("navigation.dashboard", { ns: "common" }), href: "/client/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { label: t("navigation.catalog", { ns: "common" }), href: "/client/catalog", icon: <ShoppingBag className="h-4 w-4" /> },
    { label: t("navigation.rfqs", { ns: "common" }), href: "/client/rfqs", icon: <FileText className="h-4 w-4" /> },
    { label: t("navigation.quotes", { ns: "common" }), href: "/client/quotes", icon: <GitCompareArrows className="h-4 w-4" /> },
    { label: t("navigation.orders", { ns: "common" }), href: "/client/orders", icon: <PackageSearch className="h-4 w-4" /> }
  ];

  return (
    <PortalShell title={t("client.title", { ns: "common" })} description={t("client.description", { ns: "common" })} navItems={navItems}>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title={t("dashboard.active_rfqs", { ns: "rfq" })} value="18" detail={t("dashboard.active_rfqs_detail", { ns: "rfq" })} icon={<ScrollText className="h-4 w-4" />} tone="orange" />
        <MetricCard title={t("dashboard.awaiting_decision", { ns: "rfq" })} value="7" detail={t("dashboard.awaiting_decision_detail", { ns: "rfq" })} icon={<FileCheck2 className="h-4 w-4" />} tone="cyan" />
        <MetricCard title={t("dashboard.pending_approval", { ns: "rfq" })} value="4" detail={t("dashboard.pending_approval_detail", { ns: "rfq" })} icon={<Clock3 className="h-4 w-4" />} tone="stone" />
        <MetricCard title={t("dashboard.active_orders", { ns: "rfq" })} value="11" detail={t("dashboard.active_orders_detail", { ns: "rfq" })} icon={<PackageCheck className="h-4 w-4" />} tone="orange" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.rfq_queue", { ns: "rfq" })}</CardTitle>
            <CardDescription>{t("dashboard.rfq_queue_description", { ns: "rfq" })}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {["RFQ-1042", "RFQ-1038", "RFQ-1031"].map((rfq, index) => (
              <div key={rfq} className="flex items-center justify-between gap-3 rounded-md border bg-white/70 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{rfq}</p>
                  <p className="text-sm text-muted-foreground">{t(`dashboard.sample_items.${index}`, { ns: "rfq" })}</p>
                </div>
                <Badge variant={index === 0 ? "info" : "outline"}>{t(`dashboard.sample_statuses.${index}`, { ns: "rfq" })}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.alerts", { ns: "rfq" })}</CardTitle>
            <CardDescription>{t("dashboard.alerts_description", { ns: "rfq" })}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="rounded-md bg-mwrd-sun/25 p-3 text-sm">{t("dashboard.quote_expiry_alert", { ns: "rfq" })}</div>
            <div className="rounded-md bg-mwrd-red/10 p-3 text-sm">{t("dashboard.delivery_delay_alert", { ns: "rfq" })}</div>
          </CardContent>
        </Card>
      </section>
    </PortalShell>
  );
}
