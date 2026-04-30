import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

function localizePair(ar: string | undefined | null, en: string | undefined | null, language: string) {
  return language === "ar" ? ar || en || "" : en || ar || "";
}

function formatCurrency(amount: number, language: string) {
  return new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2
  }).format(amount);
}

function orderTone(status: string): "info" | "warning" | "danger" | "neutral" {
  if (status === "completed" || status === "receiptConfirmed" || status === "delivered") return "info";
  if (status === "disputed") return "danger";
  if (status === "delayed" || status === "pending") return "warning";
  return "neutral";
}

function orderLabel(status: string, language: string) {
  const map: Record<string, { en: string; ar: string }> = {
    pending: { en: "Pending", ar: "بانتظار التأكيد" },
    confirmed: { en: "Confirmed", ar: "مؤكد" },
    processing: { en: "Processing", ar: "قيد التجهيز" },
    shipped: { en: "Shipped", ar: "تم الشحن" },
    delivered: { en: "Delivered", ar: "تم التسليم" },
    receiptConfirmed: { en: "Receipt confirmed", ar: "تم تأكيد الاستلام" },
    completed: { en: "Completed", ar: "مكتمل" },
    disputed: { en: "Disputed", ar: "متنازع عليه" },
    delayed: { en: "Delayed", ar: "متأخر" }
  };
  return localize(map[status] ?? { en: status, ar: status }, language);
}

function disputeTone(status: string): "info" | "warning" | "danger" | "neutral" {
  if (status === "resolved" || status === "closed") return "info";
  if (status === "open") return "warning";
  return "neutral";
}

export function ClientOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation("common");
  const navItems = useClientNav();
  const { user } = useAuth();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user && orderId ? { actorUserId: user.id as Id<"users">, orderId: orderId as Id<"orders"> } : "skip";
  const detail = useQuery(api.orders.getOrderDetailForActor, queryArgs);
  const disputes = useQuery(api.orders.listDisputesForOrder, queryArgs);
  const updateStatus = useMutation(api.orders.updateOrderStatus);
  const openDispute = useMutation(api.orders.openDispute);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isOpeningDispute, setIsOpeningDispute] = useState(false);
  const [disputeSubject, setDisputeSubject] = useState("");
  const [disputeDescription, setDisputeDescription] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function handleConfirmReceipt() {
    if (!isBetterAuthConfigured || !user || !orderId) return;
    setMessage(null);
    setIsConfirming(true);
    try {
      await updateStatus({
        actorUserId: user.id as Id<"users">,
        orderId: orderId as Id<"orders">,
        status: "receiptConfirmed"
      });
      trackEvent("delivery_confirmed", { order_id: orderId });
      setMessage({ tone: "success", text: localize({ en: "Receipt confirmed.", ar: "تم تأكيد الاستلام." }, language) });
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({ tone: "error", text: text || localize({ en: "Could not confirm receipt.", ar: "تعذر تأكيد الاستلام." }, language) });
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleOpenDispute() {
    if (!isBetterAuthConfigured || !user || !orderId) return;
    setMessage(null);
    if (!disputeSubject.trim() || !disputeDescription.trim()) {
      setMessage({ tone: "error", text: localize({ en: "Subject and description are required.", ar: "الموضوع والوصف مطلوبان." }, language) });
      return;
    }
    setIsOpeningDispute(true);
    try {
      await openDispute({
        actorUserId: user.id as Id<"users">,
        orderId: orderId as Id<"orders">,
        subject: disputeSubject.trim(),
        description: disputeDescription.trim()
      });
      setDisputeSubject("");
      setDisputeDescription("");
      setMessage({ tone: "success", text: localize({ en: "Dispute opened. Routed to admin.", ar: "تم فتح النزاع. تم توجيهه للإدارة." }, language) });
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({ tone: "error", text: text || localize({ en: "Could not open the dispute.", ar: "تعذر فتح النزاع." }, language) });
    } finally {
      setIsOpeningDispute(false);
    }
  }

  return (
    <PortalShell
      title={localize({ en: "Order tracking", ar: "متابعة الطلب" }, language)}
      description={localize({ en: "Track delivery, confirm receipt, or open a dispute.", ar: "تابع التسليم وأكد الاستلام أو افتح نزاعاً." }, language)}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Back to orders", ar: "العودة إلى الطلبات" }, language)}
      primaryActionIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
      onPrimaryAction={() => navigate("/client/orders")}
    >
      {detail === undefined ? (
        <DashboardCard title={localize({ en: "Loading...", ar: "جار التحميل..." }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Loading order...", ar: "جار تحميل الطلب..." }, language)}</p>
        </DashboardCard>
      ) : detail === null ? (
        <DashboardCard title={localize({ en: "Not found", ar: "غير موجود" }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Order not found.", ar: "الطلب غير موجود." }, language)}</p>
        </DashboardCard>
      ) : (
        <>
          {message ? (
            <p
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-semibold",
                message.tone === "success"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              )}
            >
              {message.text}
            </p>
          ) : null}

          <DashboardCard title={`${localize({ en: "Order", ar: "طلب" }, language)} ${detail._id.slice(-6).toUpperCase()}`}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Anonymous supplier", ar: "مورد مجهول" }, language)}</span>
                <Badge variant="outline">{detail.supplierAnonymousId}</Badge>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Status", ar: "الحالة" }, language)}</span>
                <StatusBadge tone={orderTone(detail.status)}>{orderLabel(detail.status, language)}</StatusBadge>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Items", ar: "البنود" }, language)}</span>
                <span className="text-sm font-semibold">{detail.lineItems.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Total", ar: "الإجمالي" }, language)}</span>
                <span className="text-lg font-semibold">{formatCurrency(detail.lineItems.reduce((sum, item) => sum + item.clientFinalTotalPrice, 0), language)}</span>
              </div>
            </div>

            {detail.status === "delivered" ? (
              <div className="mt-5 border-t border-border/70 pt-4">
                <Button type="button" disabled={isConfirming} onClick={() => void handleConfirmReceipt()}>
                  {isConfirming ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
                  {localize({ en: "Confirm receipt", ar: "تأكيد الاستلام" }, language)}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {localize({ en: "Confirming receipt closes the order successfully.", ar: "تأكيد الاستلام يغلق الطلب بنجاح." }, language)}
                </p>
              </div>
            ) : null}
          </DashboardCard>

          <DashboardCard title={localize({ en: "Line items", ar: "بنود الطلب" }, language)}>
            <DataTable
              rows={detail.lineItems}
              emptyLabel={localize({ en: "No line items.", ar: "لا توجد بنود." }, language)}
              getRowKey={(item) => item._id}
              columns={[
                {
                  header: localize({ en: "Item", ar: "البند" }, language),
                  cell: (item) => (
                    <div className="flex flex-col">
                      <span className="font-semibold">{item.product ? localizePair(item.product.nameAr, item.product.nameEn, language) : localizePair(item.descriptionAr, item.descriptionEn, language) || localize({ en: "Custom item", ar: "بند مخصص" }, language)}</span>
                      {item.product ? <span className="text-xs text-muted-foreground">{item.product.sku}</span> : null}
                    </div>
                  )
                },
                { header: localize({ en: "Qty", ar: "الكمية" }, language), cell: (item) => <span>{`${item.quantity} ${item.unit}`}</span> },
                { header: localize({ en: "Unit price", ar: "سعر الوحدة" }, language), cell: (item) => <span>{formatCurrency(item.clientFinalUnitPrice, language)}</span> },
                { header: localize({ en: "Line total", ar: "إجمالي البند" }, language), cell: (item) => <span className="font-semibold">{formatCurrency(item.clientFinalTotalPrice, language)}</span> }
              ]}
            />
          </DashboardCard>

          <DashboardCard title={localize({ en: "Delivery timeline", ar: "السجل الزمني للتسليم" }, language)}>
            {detail.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{localize({ en: "No events yet.", ar: "لا توجد أحداث بعد." }, language)}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {detail.events.map((event) => (
                  <li key={event._id} className="flex flex-col gap-1 border-s-2 border-primary/40 ps-3">
                    <StatusBadge tone={orderTone(event.status)}>{orderLabel(event.status, language)}</StatusBadge>
                    {event.notes ? <span className="text-sm">{event.notes}</span> : null}
                    <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </DashboardCard>

          <DashboardCard
            title={localize({ en: "Disputes", ar: "النزاعات" }, language)}
            description={localize({ en: "Open a dispute if there is a delivery or quality issue. Disputes route to admin.", ar: "افتح نزاعاً إذا كان هناك مشكلة في التسليم أو الجودة. توجَّه النزاعات للإدارة." }, language)}
          >
            <div className="flex flex-col gap-4">
              {disputes && disputes.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {disputes.map((dispute) => (
                    <li key={dispute._id} className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/30 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">{dispute.subject}</span>
                        <StatusBadge tone={disputeTone(dispute.status)}>{dispute.status}</StatusBadge>
                      </div>
                      <p className="text-sm text-muted-foreground">{dispute.description}</p>
                      <span className="text-xs text-muted-foreground">{new Date(dispute.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {detail.status !== "completed" ? (
                <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {localize({ en: "Subject", ar: "الموضوع" }, language)}
                    <Input value={disputeSubject} onChange={(event) => setDisputeSubject(event.target.value)} disabled={isOpeningDispute} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {localize({ en: "Description", ar: "الوصف" }, language)}
                    <Input value={disputeDescription} onChange={(event) => setDisputeDescription(event.target.value)} disabled={isOpeningDispute} />
                  </label>
                  <div className="flex items-end">
                    <Button type="button" variant="outline" disabled={isOpeningDispute} onClick={() => void handleOpenDispute()}>
                      {isOpeningDispute ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <AlertTriangle className="size-4" aria-hidden="true" />}
                      {localize({ en: "Open dispute", ar: "فتح نزاع" }, language)}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{localize({ en: "Order is closed; disputes can no longer be opened.", ar: "تم إغلاق الطلب؛ لا يمكن فتح نزاعات." }, language)}</p>
              )}
            </div>
          </DashboardCard>
        </>
      )}
    </PortalShell>
  );
}
