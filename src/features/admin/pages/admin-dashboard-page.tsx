import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, SegmentedProgress, SparkBars, StatStrip, StatusBadge } from "@/components/portal-ui";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAdminNav } from "@/features/admin/hooks/use-admin-nav";

export function AdminDashboardPage() {
  const { t, i18n } = useTranslation(["common", "admin"]);
  const navItems = useAdminNav();
  const reviewRows = ["RFQ-1042", "RFQ-1038", "RFQ-1031"].map((id, index) => ({
    id,
    summary: t(`dashboard.sample_reviews.${index}`, { ns: "admin" }),
    priority: t(`dashboard.sample_priorities.${index}`, { ns: "admin" }),
    owner: ["Pricing", "Supplier Ops", "Admin"][index],
    due: ["2026-04-30", "2026-05-01", "2026-05-02"][index]
  }));

  return (
    <PortalShell
      title={t("admin.title", { ns: "common" })}
      description={t("admin.description", { ns: "common" })}
      navItems={navItems}
      primaryActionLabel={t("actions.release_quotes", { ns: "common" })}
      primaryActionIcon={<Send className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: t("dashboard.active_rfqs", { ns: "admin" }), value: "46", detail: t("dashboard.active_rfqs_detail", { ns: "admin" }), trend: "+8", trendTone: "positive" },
          { label: t("dashboard.pending_reviews", { ns: "admin" }), value: "12", detail: t("dashboard.pending_reviews_detail", { ns: "admin" }), trend: "-4", trendTone: "negative" },
          { label: t("dashboard.margin", { ns: "admin" }), value: "18.4%", detail: t("dashboard.margin_detail", { ns: "admin" }), trend: "+2.1%", trendTone: "positive" },
          { label: t("dashboard.revenue", { ns: "admin" }), value: "SAR 1.2M", detail: t("dashboard.revenue_detail", { ns: "admin" }), trend: "+11%", trendTone: "positive" }
        ]}
      />

      <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <DashboardCard title={t("dashboard.review_queue", { ns: "admin" })} description={t("dashboard.review_queue_description", { ns: "admin" })}>
          <DataTable
            rows={reviewRows}
            getRowKey={(row) => row.id}
            columns={[
              { header: "ID", cell: (row) => <span className="font-semibold">{row.id}</span> },
              { header: localize({ en: "Review", ar: "المراجعة" }, i18n.language), cell: (row) => <span className="text-muted-foreground">{row.summary}</span> },
              { header: localize({ en: "Owner", ar: "المسؤول" }, i18n.language), cell: (row) => <span>{row.owner}</span> },
              { header: localize({ en: "Due", ar: "الاستحقاق" }, i18n.language), cell: (row) => <span>{row.due}</span> },
              { header: localize({ en: "Priority", ar: "الأولوية" }, i18n.language), cell: (row) => <StatusBadge tone={row.priority === t("dashboard.sample_priorities.0", { ns: "admin" }) ? "danger" : "neutral"}>{row.priority}</StatusBadge> }
            ]}
          />
        </DashboardCard>

        <DashboardCard title={t("dashboard.operational_risks", { ns: "admin" })} description={t("dashboard.operational_risks_description", { ns: "admin" })}>
          <div className="flex flex-col gap-4">
            <SegmentedProgress
              segments={[
                { label: localize({ en: "Normal", ar: "طبيعي" }, i18n.language), value: "76%", width: "76%", className: "bg-primary" },
                { label: localize({ en: "Watch", ar: "مراقبة" }, i18n.language), value: "18%", width: "18%", className: "bg-mwrd-sun" },
                { label: localize({ en: "Escalate", ar: "تصعيد" }, i18n.language), value: "6%", width: "6%", className: "bg-mwrd-red" }
              ]}
            />
            <div className="rounded-lg bg-mwrd-sun/20 p-3 text-sm">{t("dashboard.no_response_risk", { ns: "admin" })}</div>
            <div className="rounded-lg bg-mwrd-red/10 p-3 text-sm">{t("dashboard.margin_override_risk", { ns: "admin" })}</div>
          </div>
        </DashboardCard>
      </section>

      <DashboardCard title={localize({ en: "Marketplace operations trend", ar: "اتجاه عمليات السوق" }, i18n.language)} description={localize({ en: "RFQ and quote review movement across the last period", ar: "حركة طلبات التسعير ومراجعات العروض خلال الفترة الأخيرة" }, i18n.language)}>
        <SparkBars values={[46, 62, 54, 75, 71, 52, 83, 64, 79, 88, 69, 92]} />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">{localize({ en: "RFQs approved", ar: "طلبات تسعير معتمدة" }, i18n.language)}</p>
            <p className="mt-1 text-2xl font-semibold">31</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{localize({ en: "Quotes released", ar: "عروض مصدرة" }, i18n.language)}</p>
            <p className="mt-1 text-2xl font-semibold">24</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{localize({ en: "Margin exceptions", ar: "استثناءات هامش" }, i18n.language)}</p>
            <p className="mt-1 text-2xl font-semibold">2</p>
          </div>
        </div>
      </DashboardCard>
    </PortalShell>
  );
}
