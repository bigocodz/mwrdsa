import { CheckCircle2, Circle, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clientOrders, localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";

export function ClientOrdersPage() {
  const { t, i18n } = useTranslation(["common", "orders"]);
  const navItems = useClientNav();

  return (
    <PortalShell title={t("orders:title")} description={t("orders:description")} navItems={navItems}>
      <section className="grid gap-4 xl:grid-cols-2">
        {clientOrders.map((order) => (
          <Card key={order.id} className="bg-white">
            <CardHeader>
              <div className="mb-2 flex items-center justify-between gap-3">
                <Badge variant="info">{order.supplierAnonymousId}</Badge>
                <Badge variant="outline">{localize(order.status, i18n.language)}</Badge>
              </div>
              <CardTitle>{order.id}</CardTitle>
              <CardDescription>{localize(order.eta, i18n.language)}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 rounded-md border bg-background/70 p-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="text-sm">{t("orders:steps.po_sent")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="text-sm">{localize(order.currentStep, i18n.language)}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Circle className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm">{t("orders:steps.receipt_confirmation")}</span>
                </div>
              </div>
              <Button type="button" variant="outline">{t("orders:confirm_receipt")}</Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </PortalShell>
  );
}
