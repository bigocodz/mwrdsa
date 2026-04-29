import { CalendarDays, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clientRfqs, localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";

export function ClientRfqsPage() {
  const { t, i18n } = useTranslation(["common", "rfq"]);
  const navItems = useClientNav();

  return (
    <PortalShell title={t("rfq:pages.rfqs_title")} description={t("rfq:pages.rfqs_description")} navItems={navItems}>
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>{t("rfq:pages.my_rfqs")}</CardTitle>
            <CardDescription>{t("rfq:pages.my_rfqs_description")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {clientRfqs.map((rfq) => (
              <div key={rfq.id} className="grid gap-3 rounded-md border bg-background/60 p-3 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{rfq.id}</p>
                    <Badge variant="outline">{localize(rfq.status, i18n.language)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {localize(rfq.department, i18n.language)} · {localize(rfq.items, i18n.language)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  {rfq.requestedDate}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader>
            <CardTitle>{t("rfq:pages.create_rfq")}</CardTitle>
            <CardDescription>{t("rfq:pages.create_rfq_description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3">
              <label className="grid gap-2 text-sm font-medium">
                {t("rfq:form.item")}
                <Input placeholder={t("rfq:form.item_placeholder")} />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                {t("rfq:form.quantity")}
                <Input type="number" min="1" placeholder="10" />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                {t("rfq:form.delivery_date")}
                <Input type="date" />
              </label>
              <Button type="button" className="mt-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("rfq:form.save_draft")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </PortalShell>
  );
}
