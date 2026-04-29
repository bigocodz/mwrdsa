import { FileCheck2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, SegmentedProgress, SparkBars, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useSupplierNav } from "@/features/supplier/hooks/use-supplier-nav";

export function SupplierDashboardPage() {
  const { t, i18n } = useTranslation(["common", "supplier"]);
  const navItems = useSupplierNav();
  const inboxRows = ["SUP-RFQ-8842", "SUP-RFQ-8838", "SUP-RFQ-8821"].map((id, index) => ({
    id,
    client: ["CLT-00473", "CLT-00921", "CLT-00118"][index],
    item: t(`dashboard.sample_rfqs.${index}`, { ns: "supplier" }),
    status: t(`dashboard.sample_statuses.${index}`, { ns: "supplier" }),
    due: ["2026-05-01", "2026-05-03", "2026-05-06"][index]
  }));

  return (
    <PortalShell
      title={t("supplier.title", { ns: "common" })}
      description={t("supplier.description", { ns: "common" })}
      navItems={navItems}
      primaryActionLabel={t("actions.submit_quote", { ns: "common" })}
      primaryActionIcon={<FileCheck2 className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: t("dashboard.awaiting_response", { ns: "supplier" }), value: "9", detail: t("dashboard.awaiting_response_detail", { ns: "supplier" }), trend: "+4", trendTone: "positive" },
          { label: t("dashboard.deadlines", { ns: "supplier" }), value: "3", detail: t("dashboard.deadlines_detail", { ns: "supplier" }), trend: "-1", trendTone: "negative" },
          { label: t("dashboard.active_orders", { ns: "supplier" }), value: "14", detail: t("dashboard.active_orders_detail", { ns: "supplier" }), trend: "+8%", trendTone: "positive" },
          { label: t("dashboard.response_rate", { ns: "supplier" }), value: "92%", detail: t("dashboard.response_rate_detail", { ns: "supplier" }), trend: "+2.4%", trendTone: "positive" }
        ]}
      />

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <DashboardCard title={t("dashboard.inbox", { ns: "supplier" })} description={t("dashboard.inbox_description", { ns: "supplier" })}>
          <DataTable
            rows={inboxRows}
            getRowKey={(row) => row.id}
            columns={[
              { header: "ID", cell: (row) => <span className="font-semibold">{row.id}</span> },
              { header: localize({ en: "Anonymous client", ar: "عميل مجهول" }, i18n.language), cell: (row) => <span>{row.client}</span> },
              { header: localize({ en: "Scope", ar: "النطاق" }, i18n.language), cell: (row) => <span className="text-muted-foreground">{row.item}</span> },
              { header: localize({ en: "Due", ar: "الاستحقاق" }, i18n.language), cell: (row) => <span>{row.due}</span> },
              { header: localize({ en: "Status", ar: "الحالة" }, i18n.language), cell: (row) => <StatusBadge tone={row.status === t("dashboard.sample_statuses.0", { ns: "supplier" }) ? "warning" : "neutral"}>{row.status}</StatusBadge> }
            ]}
          />
        </DashboardCard>

        <DashboardCard title={localize({ en: "Response health", ar: "صحة الاستجابة" }, i18n.language)} description={localize({ en: "Last 12 assigned RFQs", ar: "آخر 12 طلب تسعير مسند" }, i18n.language)}>
          <SparkBars values={[55, 62, 49, 77, 66, 81, 45, 72, 84, 61, 79, 88]} tone="cyan" />
          <div className="mt-5">
            <SegmentedProgress
              segments={[
                { label: localize({ en: "Submitted", ar: "مرسلة" }, i18n.language), value: "70%", width: "70%", className: "bg-primary" },
                { label: localize({ en: "Drafting", ar: "قيد التحضير" }, i18n.language), value: "20%", width: "20%", className: "bg-mwrd-sun" },
                { label: localize({ en: "Missed", ar: "فائتة" }, i18n.language), value: "10%", width: "10%", className: "bg-mwrd-red" }
              ]}
            />
          </div>
          <Button type="button" variant="outline" className="mt-5 w-full">
            {t("navigation.performance", { ns: "common" })}
          </Button>
        </DashboardCard>
      </section>
    </PortalShell>
  );
}
