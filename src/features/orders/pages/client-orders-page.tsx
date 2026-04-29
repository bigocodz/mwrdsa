import { CheckCircle2, Circle, Download, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, DateRangeButton, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clientOrders, localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";

export function ClientOrdersPage() {
  const { t, i18n } = useTranslation(["common", "orders"]);
  const navItems = useClientNav();

  return (
    <PortalShell
      title={t("orders:title")}
      description={t("orders:description")}
      navItems={navItems}
      primaryActionLabel={t("actions.export", { ns: "common" })}
      primaryActionIcon={<Download className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Active orders", ar: "طلبات نشطة" }, i18n.language), value: "11", detail: localize({ en: "Processing or shipped", ar: "قيد التجهيز أو الشحن" }, i18n.language), trend: "+8%", trendTone: "positive" },
          { label: localize({ en: "Pending receipt", ar: "بانتظار الاستلام" }, i18n.language), value: "3", detail: localize({ en: "Need client confirmation", ar: "تحتاج تأكيد العميل" }, i18n.language), trend: "-2", trendTone: "negative" },
          { label: localize({ en: "On-time fulfillment", ar: "التنفيذ في الموعد" }, i18n.language), value: "94%", detail: localize({ en: "Supplier performance", ar: "أداء الموردين" }, i18n.language), trend: "+4%", trendTone: "positive" },
          { label: localize({ en: "Exceptions", ar: "استثناءات" }, i18n.language), value: "1", detail: localize({ en: "Requires review", ar: "تحتاج مراجعة" }, i18n.language), trend: "-1", trendTone: "positive" }
        ]}
      />

      <DashboardToolbar
        searchPlaceholder={localize({ en: "Search orders...", ar: "ابحث في الطلبات..." }, i18n.language)}
        filterLabel={t("actions.filter", { ns: "common" })}
        gridLabel={t("actions.grid_view", { ns: "common" })}
        listLabel={t("actions.list_view", { ns: "common" })}
      >
        <DateRangeButton label={t("actions.last_7_days", { ns: "common" })} />
      </DashboardToolbar>

      <DashboardCard title={localize({ en: "Order tracking", ar: "متابعة الطلبات" }, i18n.language)}>
        <DataTable
          rows={clientOrders}
          getRowKey={(order) => order.id}
          columns={[
            { header: "ID", cell: (order) => <span className="font-semibold">{order.id}</span> },
            { header: localize({ en: "Supplier", ar: "المورد" }, i18n.language), cell: (order) => <Badge variant="info">{order.supplierAnonymousId}</Badge> },
            { header: localize({ en: "Status", ar: "الحالة" }, i18n.language), cell: (order) => <StatusBadge tone="neutral">{localize(order.status, i18n.language)}</StatusBadge> },
            { header: localize({ en: "Current step", ar: "المرحلة الحالية" }, i18n.language), cell: (order) => <span>{localize(order.currentStep, i18n.language)}</span> },
            { header: localize({ en: "ETA", ar: "موعد متوقع" }, i18n.language), cell: (order) => <span className="text-muted-foreground">{localize(order.eta, i18n.language)}</span> },
            {
              header: localize({ en: "Action", ar: "الإجراء" }, i18n.language),
              cell: () => (
                <Button type="button" variant="outline" size="sm">
                  {t("orders:confirm_receipt")}
                </Button>
              )
            }
          ]}
        />
      </DashboardCard>

      <section className="grid gap-5 xl:grid-cols-2">
        {clientOrders.map((order) => (
          <div key={order.id} className="rounded-lg border border-border/70 bg-card p-5 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{order.id}</p>
                <p className="mt-1 text-sm text-muted-foreground">{localize(order.eta, i18n.language)}</p>
              </div>
              <Badge variant="outline">{localize(order.status, i18n.language)}</Badge>
            </div>
            <div className="mt-5 flex flex-col gap-3 rounded-lg bg-muted/60 p-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                <span className="text-sm">{t("orders:steps.po_sent")}</span>
              </div>
              <div className="flex items-center gap-3">
                <Truck className="size-4 text-primary" aria-hidden="true" />
                <span className="text-sm">{localize(order.currentStep, i18n.language)}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Circle className="size-4" aria-hidden="true" />
                <span className="text-sm">{t("orders:steps.receipt_confirmation")}</span>
              </div>
            </div>
          </div>
        ))}
      </section>
    </PortalShell>
  );
}
