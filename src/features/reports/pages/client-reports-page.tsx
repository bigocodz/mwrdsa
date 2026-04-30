import { useQuery } from "convex/react";
import { Download } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, SparkBars, StatStrip } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { hasPermission } from "@/lib/permissions";

function localizePair(ar: string | undefined | null, en: string | undefined | null, language: string) {
  return language === "ar" ? ar || en || "" : en || ar || "";
}

function formatCurrency(amount: number, language: string) {
  return new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0
  }).format(amount);
}

function formatHours(hours: number, language: string) {
  if (!Number.isFinite(hours) || hours <= 0) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} ${localize({ en: "min", ar: "د" }, language)}`;
  if (hours < 24) return `${hours.toFixed(1)} ${localize({ en: "h", ar: "س" }, language)}`;
  const days = hours / 24;
  return `${days.toFixed(1)} ${localize({ en: "d", ar: "يوم" }, language)}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

export function ClientReportsPage() {
  const { i18n } = useTranslation("common");
  const language = i18n.language;
  const navItems = useClientNav();
  const { user } = useAuth();
  const canViewReports = Boolean(user && hasPermission(user.roles, "analytics:view"));
  const queryArgs = isBetterAuthConfigured && user && canViewReports ? { actorUserId: user.id as Id<"users"> } : "skip";
  const summary = useQuery(api.analytics.getClientReportSummary, queryArgs);

  const monthlyValues = useMemo(() => (summary?.monthlySeries ?? []).map((row) => row.amount), [summary]);
  const lastMonthSpend = monthlyValues.length > 0 ? monthlyValues[monthlyValues.length - 1] : 0;

  const handleExportSpend = () => {
    if (!summary) return;
    downloadCsv(
      `mwrd-spend-${new Date().toISOString().slice(0, 10)}.csv`,
      summary.monthlySeries.map((row) => ({ month: row.month, amount: row.amount.toFixed(2) }))
    );
  };

  const handleExportCategories = () => {
    if (!summary) return;
    downloadCsv(
      `mwrd-spend-by-category-${new Date().toISOString().slice(0, 10)}.csv`,
      summary.categoryBreakdown.map((row) => ({ category_en: row.nameEn, category_ar: row.nameAr, amount: row.total.toFixed(2) }))
    );
  };

  return (
    <PortalShell
      title={localize({ en: "Reports", ar: "التقارير" }, language)}
      description={localize({ en: "Client spend, conversion, and operational metrics", ar: "إنفاق العميل والتحويل والمقاييس التشغيلية" }, language)}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Export CSV", ar: "تصدير CSV" }, language)}
      primaryActionIcon={<Download className="size-4" aria-hidden="true" />}
      onPrimaryAction={handleExportSpend}
    >
      {!canViewReports ? (
        <DashboardCard title={localize({ en: "Reports restricted", ar: "التقارير مقيدة" }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Your role does not include analytics access.", ar: "دورك لا يتضمن صلاحية الوصول للتحليلات." }, language)}</p>
        </DashboardCard>
      ) : summary === undefined ? (
        <DashboardCard title={localize({ en: "Loading...", ar: "جار التحميل..." }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Loading reports...", ar: "جار تحميل التقارير..." }, language)}</p>
        </DashboardCard>
      ) : (
        <>
          <StatStrip
            stats={[
              { label: localize({ en: "Total spend", ar: "إجمالي الإنفاق" }, language), value: formatCurrency(summary.totalSpend, language), detail: localize({ en: "Across approved POs", ar: "عبر أوامر الشراء المعتمدة" }, language) },
              { label: localize({ en: "RFQ → order conversion", ar: "تحويل الطلبات إلى أوامر" }, language), value: formatPercent(summary.conversionRate), detail: localize({ en: "Submitted RFQs reaching PO", ar: "طلبات وصلت إلى أمر شراء" }, language), trendTone: "positive" },
              { label: localize({ en: "Avg time to quote", ar: "متوسط زمن التسعير" }, language), value: formatHours(summary.avgTimeToQuoteHours, language), detail: localize({ en: "RFQ submit → first release", ar: "من الإرسال إلى أول إصدار" }, language), trendTone: "neutral" },
              { label: localize({ en: "Avg PO approval time", ar: "متوسط زمن اعتماد أمر الشراء" }, language), value: formatHours(summary.avgPoApprovalHours, language), detail: localize({ en: "PO created → approved", ar: "من إنشاء أمر الشراء إلى اعتماده" }, language), trendTone: "neutral" }
            ]}
          />

          <section className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
            <DashboardCard title={localize({ en: "Monthly spend", ar: "الإنفاق الشهري" }, language)} description={localize({ en: "Last 12 months from approved purchase orders.", ar: "آخر 12 شهراً من أوامر الشراء المعتمدة." }, language)}>
              {monthlyValues.length === 0 ? (
                <p className="text-sm text-muted-foreground">{localize({ en: "No spend data yet.", ar: "لا توجد بيانات إنفاق بعد." }, language)}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-3xl font-semibold">{formatCurrency(lastMonthSpend, language)}</span>
                    <span className="text-xs text-muted-foreground">{localize({ en: "Most recent month", ar: "أحدث شهر" }, language)}</span>
                  </div>
                  <SparkBars values={monthlyValues} tone="primary" />
                </div>
              )}
            </DashboardCard>

            <DashboardCard title={localize({ en: "Activity", ar: "النشاط" }, language)}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">{localize({ en: "Total RFQs", ar: "إجمالي الطلبات" }, language)}</span>
                  <span className="text-lg font-semibold">{summary.rfqCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">{localize({ en: "Purchase orders", ar: "أوامر الشراء" }, language)}</span>
                  <span className="text-lg font-semibold">{summary.poCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">{localize({ en: "Active orders", ar: "طلبات نشطة" }, language)}</span>
                  <span className="text-lg font-semibold">{summary.activeOrders}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">{localize({ en: "Completed orders", ar: "طلبات مكتملة" }, language)}</span>
                  <span className="text-lg font-semibold">{summary.completedOrders}</span>
                </div>
              </div>
            </DashboardCard>
          </section>

          <DashboardCard title={localize({ en: "Top spend by category", ar: "أعلى إنفاق حسب الفئة" }, language)}>
            <div className="mb-3 flex justify-end">
              <Button type="button" size="sm" variant="outline" disabled={summary.categoryBreakdown.length === 0} onClick={handleExportCategories}>
                <Download className="size-4" aria-hidden="true" />
                {localize({ en: "Export categories", ar: "تصدير الفئات" }, language)}
              </Button>
            </div>
            <DataTable
              rows={summary.categoryBreakdown}
              emptyLabel={localize({ en: "No category-tagged spend yet.", ar: "لا يوجد إنفاق مصنف بعد." }, language)}
              getRowKey={(row) => row.nameEn}
              columns={[
                { header: localize({ en: "Category", ar: "الفئة" }, language), cell: (row) => <span className="font-semibold">{localizePair(row.nameAr, row.nameEn, language)}</span> },
                { header: localize({ en: "Spend", ar: "الإنفاق" }, language), cell: (row) => <span className="font-semibold">{formatCurrency(row.total, language)}</span> }
              ]}
            />
          </DashboardCard>

          <DashboardCard title={localize({ en: "Monthly spend table", ar: "جدول الإنفاق الشهري" }, language)}>
            <DataTable
              rows={summary.monthlySeries}
              emptyLabel={localize({ en: "No spend data yet.", ar: "لا توجد بيانات إنفاق بعد." }, language)}
              getRowKey={(row) => row.month}
              columns={[
                { header: localize({ en: "Month", ar: "الشهر" }, language), cell: (row) => <span>{row.month}</span> },
                { header: localize({ en: "Spend", ar: "الإنفاق" }, language), cell: (row) => <span className="font-semibold">{formatCurrency(row.amount, language)}</span> }
              ]}
            />
          </DashboardCard>
        </>
      )}
    </PortalShell>
  );
}
