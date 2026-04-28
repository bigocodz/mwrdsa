import { Activity, BadgePercent, CircleDollarSign, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MetricCard } from "@/components/metric-card";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AdminDashboardPage() {
  const { t } = useTranslation(["common", "admin"]);

  const navItems = [
    { label: t("navigation.dashboard", { ns: "common" }), href: "/admin/dashboard" },
    { label: t("navigation.operations", { ns: "common" }), href: "/admin/operations" },
    { label: t("navigation.clients", { ns: "common" }), href: "/admin/clients" },
    { label: t("navigation.suppliers", { ns: "common" }), href: "/admin/suppliers" },
    { label: t("navigation.catalog", { ns: "common" }), href: "/admin/catalog" },
    { label: t("navigation.audit", { ns: "common" }), href: "/admin/audit" }
  ];

  return (
    <PortalShell title={t("admin.title", { ns: "common" })} description={t("admin.description", { ns: "common" })} navItems={navItems}>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title={t("dashboard.active_rfqs", { ns: "admin" })} value="46" detail={t("dashboard.active_rfqs_detail", { ns: "admin" })} icon={<Activity className="h-4 w-4 text-primary" />} />
        <MetricCard title={t("dashboard.pending_reviews", { ns: "admin" })} value="12" detail={t("dashboard.pending_reviews_detail", { ns: "admin" })} icon={<ShieldCheck className="h-4 w-4 text-primary" />} />
        <MetricCard title={t("dashboard.margin", { ns: "admin" })} value="18.4%" detail={t("dashboard.margin_detail", { ns: "admin" })} icon={<BadgePercent className="h-4 w-4 text-primary" />} />
        <MetricCard title={t("dashboard.revenue", { ns: "admin" })} value="SAR 1.2M" detail={t("dashboard.revenue_detail", { ns: "admin" })} icon={<CircleDollarSign className="h-4 w-4 text-primary" />} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.review_queue", { ns: "admin" })}</CardTitle>
            <CardDescription>{t("dashboard.review_queue_description", { ns: "admin" })}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {["RFQ-1042", "RFQ-1038", "RFQ-1031"].map((rfq, index) => (
              <div key={rfq} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-semibold">{rfq}</p>
                  <p className="text-sm text-muted-foreground">{t(`dashboard.sample_reviews.${index}`, { ns: "admin" })}</p>
                </div>
                <Badge variant={index === 0 ? "danger" : "outline"}>{t(`dashboard.sample_priorities.${index}`, { ns: "admin" })}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.operational_risks", { ns: "admin" })}</CardTitle>
            <CardDescription>{t("dashboard.operational_risks_description", { ns: "admin" })}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="rounded-md bg-mwrd-sun/25 p-3 text-sm">{t("dashboard.no_response_risk", { ns: "admin" })}</div>
            <div className="rounded-md bg-mwrd-red/10 p-3 text-sm">{t("dashboard.margin_override_risk", { ns: "admin" })}</div>
          </CardContent>
        </Card>
      </section>
    </PortalShell>
  );
}
