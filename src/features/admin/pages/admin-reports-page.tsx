import { useQuery } from "convex/react";
import { Download } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, SparkBars, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAdminNav } from "@/features/admin/hooks/use-admin-nav";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";

function formatCurrency(amount: number, language: string) {
  return new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0
  }).format(amount);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(timestamp: number, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AdminReportsPage() {
  const { t, i18n } = useTranslation("common");
  const language = i18n.language;
  const navItems = useAdminNav();
  const { user } = useAuth();
  const queryArgs = isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip";
  const summary = useQuery(api.analytics.getAdminRevenueMarginSummary, queryArgs);

  const monthlyRevenueValues = useMemo(() => (summary?.monthlySeries ?? []).map((row) => row.revenue), [summary]);
  const latestMonth = summary?.monthlySeries.at(-1);

  const handleExport = () => {
    if (!summary) return;
    downloadCsv(
      `mwrd-admin-revenue-margin-${new Date().toISOString().slice(0, 10)}.csv`,
      summary.quoteRows.map((row) => ({
        purchase_order_id: row.purchaseOrderId,
        rfq_id: row.rfqId,
        quote_id: row.quoteId,
        client_name: row.clientName,
        client_anonymous_id: row.clientAnonymousId,
        supplier_name: row.supplierName,
        supplier_anonymous_id: row.supplierAnonymousId,
        status: row.status,
        revenue: row.revenue.toFixed(2),
        supplier_cost: row.supplierCost.toFixed(2),
        gross_margin: row.grossMargin.toFixed(2),
        gross_margin_rate: row.grossMarginRate.toFixed(2),
        applied_margin_percent: row.currentMarginPercent.toFixed(2),
        override_count: row.overrideCount,
        created_at: new Date(row.createdAt).toISOString()
      }))
    );
  };

  return (
    <PortalShell
      title={t("navigation.reports")}
      description={localize({ en: "Revenue, supplier cost, and realized margin control", ar: "الإيراد وتكلفة المورد ومراقبة الهامش المحقق" }, language)}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Export CSV", ar: "تصدير CSV" }, language)}
      primaryActionIcon={<Download className="size-4" aria-hidden="true" />}
      onPrimaryAction={handleExport}
    >
      {summary === undefined ? (
        <DashboardCard title={localize({ en: "Loading...", ar: "جار التحميل..." }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Loading admin reports...", ar: "جار تحميل تقارير الإدارة..." }, language)}</p>
        </DashboardCard>
      ) : (
        <>
          <StatStrip
            stats={[
              { label: localize({ en: "Tracked revenue", ar: "الإيراد المتابع" }, language), value: formatCurrency(summary.totalRevenue, language), detail: localize({ en: "Selected quote POs", ar: "أوامر شراء بعروض مختارة" }, language), trendTone: "positive" },
              { label: localize({ en: "Gross margin", ar: "الهامش الإجمالي" }, language), value: formatCurrency(summary.totalGrossMargin, language), detail: localize({ en: "Revenue less supplier cost", ar: "الإيراد ناقص تكلفة المورد" }, language), trendTone: "positive" },
              { label: localize({ en: "Margin rate", ar: "معدل الهامش" }, language), value: formatPercent(summary.grossMarginRate), detail: localize({ en: "Realized against revenue", ar: "محقق مقابل الإيراد" }, language), trendTone: "positive" },
              { label: localize({ en: "Margin overrides", ar: "تعديلات الهامش" }, language), value: String(summary.totalOverrides), detail: localize({ en: "Across selected quotes", ar: "عبر العروض المختارة" }, language), trendTone: summary.totalOverrides > 0 ? "neutral" : "positive" }
            ]}
          />

          <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <DashboardCard title={localize({ en: "Revenue trend", ar: "اتجاه الإيراد" }, language)} description={localize({ en: "Last 12 months from selected quote purchase orders.", ar: "آخر 12 شهراً من أوامر الشراء للعروض المختارة." }, language)}>
              {monthlyRevenueValues.length === 0 ? (
                <p className="text-sm text-muted-foreground">{localize({ en: "No revenue data yet.", ar: "لا توجد بيانات إيراد بعد." }, language)}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-3xl font-semibold">{formatCurrency(latestMonth?.revenue ?? 0, language)}</span>
                    <span className="text-xs text-muted-foreground">{latestMonth?.month ?? localize({ en: "Most recent month", ar: "أحدث شهر" }, language)}</span>
                  </div>
                  <SparkBars values={monthlyRevenueValues} tone="primary" />
                </div>
              )}
            </DashboardCard>

            <DashboardCard title={localize({ en: "Margin mix", ar: "توزيع الهامش" }, language)}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">{localize({ en: "Supplier cost", ar: "تكلفة المورد" }, language)}</span>
                  <span className="text-lg font-semibold">{formatCurrency(summary.totalSupplierCost, language)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">{localize({ en: "Avg applied markup", ar: "متوسط هامش التسعير" }, language)}</span>
                  <span className="text-lg font-semibold">{formatPercent(summary.averageAppliedMarginPercent)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">{localize({ en: "Purchase orders", ar: "أوامر الشراء" }, language)}</span>
                  <span className="text-lg font-semibold">{summary.selectedQuoteCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">{localize({ en: "Line items", ar: "البنود" }, language)}</span>
                  <span className="text-lg font-semibold">{summary.totalLineItems}</span>
                </div>
              </div>
            </DashboardCard>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <DashboardCard title={localize({ en: "Top clients by revenue", ar: "أعلى العملاء حسب الإيراد" }, language)}>
              <DataTable
                rows={summary.clientBreakdown}
                emptyLabel={localize({ en: "No client revenue yet.", ar: "لا توجد إيرادات عملاء بعد." }, language)}
                getRowKey={(row) => row.clientOrganizationId}
                columns={[
                  {
                    header: localize({ en: "Client", ar: "العميل" }, language),
                    cell: (row) => (
                      <span className="flex flex-col">
                        <span className="font-semibold">{row.clientName}</span>
                        <span className="text-xs text-muted-foreground">{row.clientAnonymousId}</span>
                      </span>
                    )
                  },
                  { header: localize({ en: "Revenue", ar: "الإيراد" }, language), cell: (row) => <span className="font-semibold">{formatCurrency(row.revenue, language)}</span> },
                  { header: localize({ en: "Margin", ar: "الهامش" }, language), cell: (row) => <StatusBadge tone="info">{formatPercent(row.grossMarginRate)}</StatusBadge> },
                  { header: localize({ en: "POs", ar: "أوامر" }, language), cell: (row) => <span>{row.purchaseOrderCount}</span> }
                ]}
              />
            </DashboardCard>

            <DashboardCard title={localize({ en: "Top suppliers by fulfilled revenue", ar: "أعلى الموردين حسب الإيراد المنفذ" }, language)}>
              <DataTable
                rows={summary.supplierBreakdown}
                emptyLabel={localize({ en: "No supplier revenue yet.", ar: "لا توجد إيرادات موردين بعد." }, language)}
                getRowKey={(row) => row.supplierOrganizationId}
                columns={[
                  {
                    header: localize({ en: "Supplier", ar: "المورد" }, language),
                    cell: (row) => (
                      <span className="flex flex-col">
                        <span className="font-semibold">{row.supplierName}</span>
                        <span className="text-xs text-muted-foreground">{row.supplierAnonymousId}</span>
                      </span>
                    )
                  },
                  { header: localize({ en: "Revenue", ar: "الإيراد" }, language), cell: (row) => <span className="font-semibold">{formatCurrency(row.revenue, language)}</span> },
                  { header: localize({ en: "Margin", ar: "الهامش" }, language), cell: (row) => <StatusBadge tone="info">{formatPercent(row.grossMarginRate)}</StatusBadge> },
                  { header: localize({ en: "POs", ar: "أوامر" }, language), cell: (row) => <span>{row.purchaseOrderCount}</span> }
                ]}
              />
            </DashboardCard>
          </section>

          <DashboardCard
            title={localize({ en: "Recent selected quotes", ar: "أحدث العروض المختارة" }, language)}
            action={
              <Button type="button" size="sm" variant="outline" disabled={summary.quoteRows.length === 0} onClick={handleExport}>
                <Download className="size-4" aria-hidden="true" />
                {localize({ en: "Export rows", ar: "تصدير الصفوف" }, language)}
              </Button>
            }
          >
            <DataTable
              rows={summary.quoteRows}
              emptyLabel={localize({ en: "No selected quote revenue yet.", ar: "لا توجد إيرادات عروض مختارة بعد." }, language)}
              getRowKey={(row) => row.purchaseOrderId}
              columns={[
                { header: "PO", cell: (row) => <span className="font-semibold">{row.purchaseOrderId.slice(-6).toUpperCase()}</span> },
                { header: localize({ en: "Client", ar: "العميل" }, language), cell: (row) => <span>{row.clientName}</span> },
                { header: localize({ en: "Supplier", ar: "المورد" }, language), cell: (row) => <span>{row.supplierName}</span> },
                { header: localize({ en: "Revenue", ar: "الإيراد" }, language), cell: (row) => <span className="font-semibold">{formatCurrency(row.revenue, language)}</span> },
                { header: localize({ en: "Cost", ar: "التكلفة" }, language), cell: (row) => <span>{formatCurrency(row.supplierCost, language)}</span> },
                { header: localize({ en: "Margin", ar: "الهامش" }, language), cell: (row) => <StatusBadge tone="info">{formatPercent(row.grossMarginRate)}</StatusBadge> },
                { header: localize({ en: "Created", ar: "تاريخ الإنشاء" }, language), cell: (row) => <span className="text-muted-foreground">{formatDate(row.createdAt, language)}</span> }
              ]}
            />
          </DashboardCard>
        </>
      )}
    </PortalShell>
  );
}
