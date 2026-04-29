import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clientQuotes, localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";

export function ClientQuotesPage() {
  const { t, i18n } = useTranslation(["common", "quotes"]);
  const navItems = useClientNav();

  return (
    <PortalShell title={t("quotes:title")} description={t("quotes:description")} navItems={navItems}>
      <section className="grid gap-4 xl:grid-cols-3">
        {clientQuotes.map((quote, index) => (
          <Card key={quote.id} className="bg-white">
            <CardHeader>
              <div className="mb-2 flex items-center justify-between gap-3">
                <Badge variant={index === 1 ? "info" : "outline"}>{quote.supplierAnonymousId}</Badge>
                <span className="flex items-center gap-1 text-sm font-semibold">
                  <Star className="h-4 w-4 fill-mwrd-sun text-mwrd-sun" aria-hidden="true" />
                  {quote.rating}
                </span>
              </div>
              <CardTitle>{quote.finalPrice}</CardTitle>
              <CardDescription>{localize(quote.validity, i18n.language)}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="rounded-md border bg-background/70 p-3 text-sm">
                <span className="text-muted-foreground">{t("quotes:lead_time")}</span>
                <p className="mt-1 font-semibold">{localize(quote.leadTime, i18n.language)}</p>
              </div>
              <Button type="button" variant={index === 1 ? "default" : "outline"}>
                {t("quotes:select_quote")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </PortalShell>
  );
}
