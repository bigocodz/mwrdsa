import { MoreVertical, PackageSearch, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { DashboardToolbar, DateRangeButton, StatStrip } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { catalogProducts, localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";

export function ClientCatalogPage() {
  const { t, i18n } = useTranslation(["common", "catalog"]);
  const navItems = useClientNav();

  return (
    <PortalShell
      title={t("catalog:title")}
      description={t("catalog:description")}
      navItems={navItems}
      primaryActionLabel={t("actions.new_rfq", { ns: "common" })}
      primaryActionIcon={<Plus className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Catalog groups", ar: "مجموعات الكتالوج" }, i18n.language), value: "24", detail: t("catalog:no_prices"), trend: "+4", trendTone: "positive" },
          { label: localize({ en: "Ready for RFQ", ar: "جاهز لطلب التسعير" }, i18n.language), value: "186", detail: localize({ en: "Matched to supplier pools", ar: "مرتبطة بمجموعات موردين" }, i18n.language), trend: "+2%", trendTone: "positive" },
          { label: localize({ en: "Non-catalog drafts", ar: "مسودات خارج الكتالوج" }, i18n.language), value: "8", detail: localize({ en: "Awaiting item details", ar: "بانتظار تفاصيل البنود" }, i18n.language), trend: "-1", trendTone: "negative" },
          { label: localize({ en: "SLA coverage", ar: "تغطية اتفاقيات الخدمة" }, i18n.language), value: "92%", detail: localize({ en: "Current supplier coverage", ar: "تغطية الموردين الحالية" }, i18n.language), trend: "+6%", trendTone: "positive" }
        ]}
      />

      <DashboardToolbar
        searchPlaceholder={t("catalog:search_placeholder")}
        filterLabel={t("actions.filter", { ns: "common" })}
        gridLabel={t("actions.grid_view", { ns: "common" })}
        listLabel={t("actions.list_view", { ns: "common" })}
      >
        <DateRangeButton label={t("actions.last_7_days", { ns: "common" })} />
      </DashboardToolbar>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {catalogProducts.map((product) => (
          <article key={product.id} className="flex min-h-[21rem] flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-card">
            <div className="flex items-center justify-between px-5 pt-5">
              <span className="h-1.5 w-8 rounded-full bg-muted-foreground/40" />
              <Button type="button" variant="ghost" size="icon" aria-label={product.sku}>
                <MoreVertical className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="mx-5 mt-3 grid flex-1 place-items-center rounded-lg bg-muted/55 p-8">
              <span className="grid size-24 place-items-center rounded-full bg-card text-primary shadow-card">
                <PackageSearch className="size-12" aria-hidden="true" />
              </span>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{localize(product.name, i18n.language)}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{localize(product.specs, i18n.language)}</p>
                </div>
                <Badge variant="info">{localize(product.category, i18n.language)}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-muted-foreground">{product.sku}</span>
                <span className="text-sm text-muted-foreground">{localize(product.availability, i18n.language)}</span>
              </div>
              <Button type="button" size="sm">
                <Plus className="size-4" aria-hidden="true" />
                {t("catalog:add_to_rfq")}
              </Button>
            </div>
          </article>
        ))}
      </section>
    </PortalShell>
  );
}
