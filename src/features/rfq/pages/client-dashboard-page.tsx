import { ArrowUpRight, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, SegmentedProgress, SparkBars, StatStrip } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";

export function ClientDashboardPage() {
  const { t, i18n } = useTranslation(["common", "rfq"]);
  const navItems = useClientNav();

  return (
    <PortalShell
      title={t("client.title", { ns: "common" })}
      description={t("client.description", { ns: "common" })}
      navItems={navItems}
      primaryActionLabel={t("actions.new_rfq", { ns: "common" })}
      primaryActionIcon={<ScrollText className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: t("dashboard.active_rfqs", { ns: "rfq" }), value: "18", detail: t("dashboard.active_rfqs_detail", { ns: "rfq" }), trend: "+12%", trendTone: "positive" },
          { label: t("dashboard.awaiting_decision", { ns: "rfq" }), value: "7", detail: t("dashboard.awaiting_decision_detail", { ns: "rfq" }), trend: "+3", trendTone: "positive" },
          { label: t("dashboard.pending_approval", { ns: "rfq" }), value: "4", detail: t("dashboard.pending_approval_detail", { ns: "rfq" }), trend: "-1", trendTone: "negative" },
          { label: t("dashboard.active_orders", { ns: "rfq" }), value: "11", detail: t("dashboard.active_orders_detail", { ns: "rfq" }), trend: "+8%", trendTone: "positive" }
        ]}
      />

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr_0.85fr]">
        <DashboardCard
          title={t("dashboard.rfq_queue", { ns: "rfq" })}
          description={t("dashboard.rfq_queue_description", { ns: "rfq" })}
          className="xl:col-span-1"
          action={
            <Button type="button" variant="outline" size="sm">
              <ArrowUpRight className="size-4" aria-hidden="true" />
              {t("actions.last_month", { ns: "common" })}
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            {["RFQ-1042", "RFQ-1038", "RFQ-1031"].map((rfq, index) => (
              <div key={rfq} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{rfq}</p>
                  <p className="text-sm text-muted-foreground">{t(`dashboard.sample_items.${index}`, { ns: "rfq" })}</p>
                </div>
                <Badge variant={index === 0 ? "info" : "outline"}>{t(`dashboard.sample_statuses.${index}`, { ns: "rfq" })}</Badge>
              </div>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          title={localize({ en: "Procurement activity", ar: "نشاط المشتريات" }, i18n.language)}
          description={localize({ en: "RFQ volume across the current period", ar: "حجم طلبات التسعير خلال الفترة الحالية" }, i18n.language)}
        >
          <SparkBars values={[42, 68, 51, 74, 38, 63, 81, 46, 58, 70, 44, 79]} />
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">{localize({ en: "Submitted", ar: "مرسلة" }, i18n.language)}</p>
              <p className="mt-1 text-xl font-semibold">41%</p>
            </div>
            <div>
              <p className="text-muted-foreground">{localize({ en: "Quoting", ar: "قيد التسعير" }, i18n.language)}</p>
              <p className="mt-1 text-xl font-semibold">36%</p>
            </div>
            <div>
              <p className="text-muted-foreground">{localize({ en: "Released", ar: "مصدر" }, i18n.language)}</p>
              <p className="mt-1 text-xl font-semibold">23%</p>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title={t("dashboard.alerts", { ns: "rfq" })} description={t("dashboard.alerts_description", { ns: "rfq" })}>
          <div className="flex flex-col gap-4">
            <SegmentedProgress
              segments={[
                { label: localize({ en: "On track", ar: "ضمن المسار" }, i18n.language), value: "62%", width: "62%", className: "bg-primary" },
                { label: localize({ en: "At risk", ar: "تحتاج انتباه" }, i18n.language), value: "28%", width: "28%", className: "bg-mwrd-sun" },
                { label: localize({ en: "Blocked", ar: "متعطلة" }, i18n.language), value: "10%", width: "10%", className: "bg-mwrd-red" }
              ]}
            />
            <div className="rounded-lg bg-mwrd-sun/20 p-3 text-sm">{t("dashboard.quote_expiry_alert", { ns: "rfq" })}</div>
            <div className="rounded-lg bg-mwrd-red/10 p-3 text-sm">{t("dashboard.delivery_delay_alert", { ns: "rfq" })}</div>
          </div>
        </DashboardCard>
      </section>
    </PortalShell>
  );
}
