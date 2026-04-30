import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, MoveUpRight } from "lucide-react";
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
import { useSupplierNav } from "@/features/supplier/hooks/use-supplier-nav";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Status = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "receiptConfirmed" | "completed" | "disputed" | "delayed";

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

export function SupplierOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation("common");
  const navItems = useSupplierNav();
  const { user } = useAuth();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user && orderId ? { actorUserId: user.id as Id<"users">, orderId: orderId as Id<"orders"> } : "skip";
  const detail = useQuery(api.orders.getOrderDetailForActor, queryArgs);
  const updateStatus = useMutation(api.orders.updateOrderStatus);
  const [notes, setNotes] = useState("");
  const [pendingStatus, setPendingStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function handleTransition(nextStatus: Status) {
    if (!isBetterAuthConfigured || !user || !orderId) return;
    setMessage(null);
    setPendingStatus(nextStatus);
    try {
      await updateStatus({
        actorUserId: user.id as Id<"users">,
        orderId: orderId as Id<"orders">,
        status: nextStatus,
        ...(notes.trim() ? { notes: notes.trim() } : {})
      });
      trackEvent("order_status_updated", { order_id: orderId, status: nextStatus });
      setNotes("");
      setMessage({
        tone: "success",
        text: localize({ en: `Order moved to ${nextStatus}.`, ar: `تم تحديث الطلب إلى ${nextStatus}.` }, language)
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({ tone: "error", text: text || localize({ en: "Could not update the order.", ar: "تعذر تحديث الطلب." }, language) });
    } finally {
      setPendingStatus(null);
    }
  }

  return (
    <PortalShell
      title={localize({ en: "Order detail", ar: "تفاصيل الطلب" }, language)}
      description={localize({ en: "Confirm, fulfill, and update the supplier order.", ar: "تأكيد وتنفيذ وتحديث طلب المورد." }, language)}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Back to orders", ar: "العودة إلى الطلبات" }, language)}
      primaryActionIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
      onPrimaryAction={() => navigate("/supplier/orders")}
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
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Anonymous client", ar: "عميل مجهول" }, language)}</span>
                <Badge variant="outline">{detail.clientAnonymousId}</Badge>
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

            {detail.perspective === "supplier" && detail.allowedTransitions.length > 0 ? (
              <div className="mt-5 flex flex-col gap-3 border-t border-border/70 pt-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {localize({ en: "Notes (optional)", ar: "ملاحظات (اختياري)" }, language)}
                  <Input value={notes} onChange={(event) => setNotes(event.target.value)} disabled={pendingStatus !== null} />
                </label>
                <div className="flex flex-wrap gap-2">
                  {detail.allowedTransitions.map((status) => (
                    <Button
                      key={status}
                      type="button"
                      size="sm"
                      variant={status === "delayed" || status === "disputed" ? "outline" : "default"}
                      disabled={pendingStatus !== null}
                      onClick={() => void handleTransition(status as Status)}
                    >
                      {pendingStatus === status ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MoveUpRight className="size-4" aria-hidden="true" />}
                      {orderLabel(status, language)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : detail.perspective === "supplier" ? (
              <p className="mt-5 border-t border-border/70 pt-4 text-sm text-muted-foreground">
                {localize({ en: "No further status updates available — awaiting client confirmation.", ar: "لا توجد تحديثات إضافية — بانتظار تأكيد العميل." }, language)}
              </p>
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

          <DashboardCard title={localize({ en: "Status timeline", ar: "السجل الزمني للحالة" }, language)}>
            {detail.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{localize({ en: "No status events yet.", ar: "لا توجد أحداث حالة بعد." }, language)}</p>
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
        </>
      )}
    </PortalShell>
  );
}
