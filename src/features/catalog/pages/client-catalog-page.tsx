import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { catalogProducts, localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";

export function ClientCatalogPage() {
  const { t, i18n } = useTranslation(["common", "catalog"]);
  const navItems = useClientNav();

  return (
    <PortalShell title={t("catalog:title")} description={t("catalog:description")} navItems={navItems}>
      <section className="flex flex-col gap-3 rounded-lg border bg-white p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input className="h-7 border-0 bg-transparent p-0 focus-visible:ring-0" placeholder={t("catalog:search_placeholder")} />
        </div>
        <Badge variant="outline">{t("catalog:no_prices")}</Badge>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalogProducts.map((product) => (
          <Card key={product.id} className="bg-white">
            <CardHeader>
              <div className="mb-2 flex items-center justify-between gap-3">
                <Badge variant="info">{localize(product.category, i18n.language)}</Badge>
                <span className="text-xs font-semibold text-muted-foreground">{product.sku}</span>
              </div>
              <CardTitle>{localize(product.name, i18n.language)}</CardTitle>
              <CardDescription>{localize(product.specs, i18n.language)}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{localize(product.availability, i18n.language)}</span>
              <Button type="button" size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("catalog:add_to_rfq")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </PortalShell>
  );
}
