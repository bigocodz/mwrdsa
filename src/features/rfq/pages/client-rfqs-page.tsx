import { CalendarDays, Plus, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, DateRangeButton, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientRfqs, localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";

export function ClientRfqsPage() {
  const { t, i18n } = useTranslation(["common", "rfq"]);
  const navItems = useClientNav();

  return (
    <PortalShell
      title={t("rfq:pages.rfqs_title")}
      description={t("rfq:pages.rfqs_description")}
      navItems={navItems}
      primaryActionLabel={t("actions.new_rfq", { ns: "common" })}
      primaryActionIcon={<Plus className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Open requests", ar: "طلبات مفتوحة" }, i18n.language), value: "18", detail: localize({ en: "Across all departments", ar: "عبر كل الإدارات" }, i18n.language), trend: "+5", trendTone: "positive" },
          { label: localize({ en: "Admin review", ar: "مراجعة الإدارة" }, i18n.language), value: "6", detail: localize({ en: "Before supplier release", ar: "قبل الإرسال للموردين" }, i18n.language), trend: "+2", trendTone: "positive" },
          { label: localize({ en: "Quote windows", ar: "نوافذ التسعير" }, i18n.language), value: "9", detail: localize({ en: "Currently active", ar: "نشطة حاليا" }, i18n.language), trend: "-1", trendTone: "negative" },
          { label: localize({ en: "Decision ready", ar: "جاهزة للقرار" }, i18n.language), value: "7", detail: localize({ en: "Released quote groups", ar: "مجموعات عروض مصدرة" }, i18n.language), trend: "+3", trendTone: "positive" }
        ]}
      />

      <DashboardToolbar
        searchPlaceholder={localize({ en: "Search RFQs...", ar: "ابحث في طلبات التسعير..." }, i18n.language)}
        filterLabel={t("actions.filter", { ns: "common" })}
        gridLabel={t("actions.grid_view", { ns: "common" })}
        listLabel={t("actions.list_view", { ns: "common" })}
      >
        <DateRangeButton label={t("actions.last_7_days", { ns: "common" })} />
      </DashboardToolbar>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <DashboardCard title={t("rfq:pages.my_rfqs")} description={t("rfq:pages.my_rfqs_description")}>
          <DataTable
            rows={clientRfqs}
            getRowKey={(rfq) => rfq.id}
            columns={[
              {
                header: "ID",
                cell: (rfq) => <span className="font-semibold">{rfq.id}</span>
              },
              {
                header: localize({ en: "Department", ar: "الإدارة" }, i18n.language),
                cell: (rfq) => <span>{localize(rfq.department, i18n.language)}</span>
              },
              {
                header: localize({ en: "Items", ar: "البنود" }, i18n.language),
                cell: (rfq) => <span className="text-muted-foreground">{localize(rfq.items, i18n.language)}</span>
              },
              {
                header: localize({ en: "Status", ar: "الحالة" }, i18n.language),
                cell: (rfq) => <StatusBadge tone="info">{localize(rfq.status, i18n.language)}</StatusBadge>
              },
              {
                header: localize({ en: "Requested", ar: "تاريخ الطلب" }, i18n.language),
                cell: (rfq) => (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="size-4" aria-hidden="true" />
                    {rfq.requestedDate}
                  </span>
                )
              }
            ]}
          />
        </DashboardCard>

        <DashboardCard title={t("rfq:pages.create_rfq")} description={t("rfq:pages.create_rfq_description")}>
          <form className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t("rfq:form.item")}
              <Input placeholder={t("rfq:form.item_placeholder")} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t("rfq:form.quantity")}
              <Input type="number" min="1" placeholder="10" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t("rfq:form.delivery_date")}
              <Input type="date" />
            </label>
            <div className="rounded-lg bg-muted/65 p-3 text-sm text-muted-foreground">
              {localize({ en: "Supplier identity remains hidden until MWRD releases eligible quotes.", ar: "تبقى هوية المورد مخفية حتى تصدر مورد العروض المؤهلة." }, i18n.language)}
            </div>
            <Button type="button" className="mt-1">
              <Send className="size-4" aria-hidden="true" />
              {t("rfq:form.save_draft")}
            </Button>
          </form>
        </DashboardCard>
      </section>
    </PortalShell>
  );
}
