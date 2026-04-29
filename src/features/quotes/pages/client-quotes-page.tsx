import { CheckCircle2, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, DateRangeButton, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clientQuotes, localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";

export function ClientQuotesPage() {
  const { t, i18n } = useTranslation(["common", "quotes"]);
  const navItems = useClientNav();

  return (
    <PortalShell
      title={t("quotes:title")}
      description={t("quotes:description")}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Approve quote", ar: "اعتماد عرض" }, i18n.language)}
      primaryActionIcon={<CheckCircle2 className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Released groups", ar: "مجموعات مصدرة" }, i18n.language), value: "7", detail: localize({ en: "Ready for client decision", ar: "جاهزة لقرار العميل" }, i18n.language), trend: "+3", trendTone: "positive" },
          { label: localize({ en: "Average margin", ar: "متوسط الهامش" }, i18n.language), value: "14.2%", detail: localize({ en: "Already added by admin", ar: "مضافة من الإدارة" }, i18n.language), trend: "+1.8%", trendTone: "positive" },
          { label: localize({ en: "Expiring soon", ar: "تنتهي قريبا" }, i18n.language), value: "2", detail: localize({ en: "Within 24 hours", ar: "خلال 24 ساعة" }, i18n.language), trend: "-1", trendTone: "negative" },
          { label: localize({ en: "Anonymized suppliers", ar: "موردون مجهولون" }, i18n.language), value: "12", detail: localize({ en: "Across active quote groups", ar: "ضمن مجموعات العروض النشطة" }, i18n.language), trend: "+4", trendTone: "positive" }
        ]}
      />

      <DashboardToolbar
        searchPlaceholder={localize({ en: "Search quote groups...", ar: "ابحث في مجموعات العروض..." }, i18n.language)}
        filterLabel={t("actions.filter", { ns: "common" })}
        gridLabel={t("actions.grid_view", { ns: "common" })}
        listLabel={t("actions.list_view", { ns: "common" })}
      >
        <DateRangeButton label={t("actions.last_month", { ns: "common" })} />
      </DashboardToolbar>

      <section className="grid gap-5 xl:grid-cols-3">
        {clientQuotes.map((quote, index) => (
          <article key={quote.id} className="rounded-lg border border-border/70 bg-card p-5 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant={index === 1 ? "info" : "outline"}>{quote.supplierAnonymousId}</Badge>
              </div>
              <span className="flex items-center gap-1 text-sm font-semibold">
                <Star className="size-4 fill-mwrd-sun text-mwrd-sun" aria-hidden="true" />
                {quote.rating}
              </span>
            </div>
            <div className="mt-8">
              <p className="text-sm font-semibold text-muted-foreground">{quote.id}</p>
              <p className="mt-2 text-3xl font-semibold">{quote.finalPrice}</p>
              <p className="mt-1 text-sm text-muted-foreground">{localize(quote.validity, i18n.language)}</p>
            </div>
            <div className="mt-5 flex flex-col gap-4">
              <div className="rounded-lg border border-border/70 bg-background/65 p-3 text-sm">
                <span className="text-muted-foreground">{t("quotes:lead_time")}</span>
                <p className="mt-1 font-semibold">{localize(quote.leadTime, i18n.language)}</p>
              </div>
              <Button type="button" variant={index === 1 ? "default" : "outline"}>
                {t("quotes:select_quote")}
              </Button>
            </div>
          </article>
        ))}
      </section>

      <DashboardCard title={localize({ en: "Released quote comparison", ar: "مقارنة العروض المصدرة" }, i18n.language)}>
        <DataTable
          rows={clientQuotes}
          getRowKey={(quote) => quote.id}
          columns={[
            { header: "ID", cell: (quote) => <span className="font-semibold">{quote.id}</span> },
            { header: localize({ en: "Supplier", ar: "المورد" }, i18n.language), cell: (quote) => <Badge variant="outline">{quote.supplierAnonymousId}</Badge> },
            { header: localize({ en: "Final price", ar: "السعر النهائي" }, i18n.language), cell: (quote) => <span className="font-semibold">{quote.finalPrice}</span> },
            { header: t("quotes:lead_time"), cell: (quote) => <span>{localize(quote.leadTime, i18n.language)}</span> },
            { header: localize({ en: "Validity", ar: "الصلاحية" }, i18n.language), cell: (quote) => <StatusBadge tone="warning">{localize(quote.validity, i18n.language)}</StatusBadge> }
          ]}
        />
      </DashboardCard>
    </PortalShell>
  );
}
