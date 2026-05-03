import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, RotateCw, Send, ShieldCheck, X } from "lucide-react";
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

function poTone(status: string): "info" | "warning" | "danger" | "neutral" {
  if (status === "approved" || status === "sentToSupplier") return "info";
  if (status === "rejected") return "danger";
  if (status === "pendingApproval" || status === "returnedForChanges") return "warning";
  return "neutral";
}

function poLabel(status: string, language: string) {
  const map: Record<string, { en: string; ar: string }> = {
    draft: { en: "Draft", ar: "مسودة" },
    pendingApproval: { en: "Pending approval", ar: "بانتظار الموافقة" },
    approved: { en: "Approved", ar: "معتمد" },
    sentToSupplier: { en: "Sent to supplier", ar: "أُرسل للمورد" },
    rejected: { en: "Rejected", ar: "مرفوض" },
    returnedForChanges: { en: "Returned for changes", ar: "مُعاد للتعديل" }
  };
  return localize(map[status] ?? { en: status, ar: status }, language);
}

export function ClientPurchaseOrderPage() {
  const { purchaseOrderId } = useParams<{ purchaseOrderId: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation("common");
  const navItems = useClientNav();
  const { user, hasRole } = useAuth();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user && purchaseOrderId ? { actorUserId: user.id as Id<"users">, purchaseOrderId: purchaseOrderId as Id<"purchaseOrders"> } : "skip";
  const detail = useQuery(api.purchaseOrders.getPurchaseOrderDetail, queryArgs);
  const decide = useMutation(api.purchaseOrders.decidePurchaseOrder);
  const sendToSupplier = useMutation(api.purchaseOrders.sendPurchaseOrderToSupplier);
  const [reason, setReason] = useState("");
  const [pendingDecision, setPendingDecision] = useState<"approved" | "rejected" | "returnedForChanges" | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const canApprove = hasRole(["superAdmin", "orgAdmin", "procurementManager", "financeApprover", "departmentHead"]);

  async function handleDecide(decision: "approved" | "rejected" | "returnedForChanges") {
    if (!isBetterAuthConfigured || !user || !purchaseOrderId) return;
    setMessage(null);
    if (decision !== "approved" && !reason.trim()) {
      setMessage({ tone: "error", text: localize({ en: "Reason is required.", ar: "السبب مطلوب." }, language) });
      return;
    }
    setPendingDecision(decision);
    try {
      await decide({
        actorUserId: user.id as Id<"users">,
        purchaseOrderId: purchaseOrderId as Id<"purchaseOrders">,
        decision,
        ...(reason.trim() ? { reason: reason.trim() } : {})
      });
      if (decision === "approved") {
        trackEvent("po_approved", { purchase_order_id: purchaseOrderId });
      }
      setMessage({
        tone: "success",
        text:
          decision === "approved"
            ? localize({ en: "Purchase order approved.", ar: "تم اعتماد أمر الشراء." }, language)
            : decision === "rejected"
              ? localize({ en: "Purchase order rejected.", ar: "تم رفض أمر الشراء." }, language)
              : localize({ en: "Purchase order returned for changes.", ar: "أُعيد أمر الشراء للتعديل." }, language)
      });
      setReason("");
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({ tone: "error", text: text || localize({ en: "Could not record the decision.", ar: "تعذر تسجيل القرار." }, language) });
    } finally {
      setPendingDecision(null);
    }
  }

  async function handleSendToSupplier() {
    if (!isBetterAuthConfigured || !user || !purchaseOrderId) return;
    setMessage(null);
    setIsSending(true);
    try {
      await sendToSupplier({ actorUserId: user.id as Id<"users">, purchaseOrderId: purchaseOrderId as Id<"purchaseOrders"> });
      setMessage({ tone: "success", text: localize({ en: "Purchase order sent to supplier.", ar: "تم إرسال أمر الشراء للمورد." }, language) });
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({ tone: "error", text: text || localize({ en: "Could not send the purchase order.", ar: "تعذر إرسال أمر الشراء." }, language) });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <PortalShell
      title={localize({ en: "Purchase order", ar: "أمر شراء" }, language)}
      description={localize({ en: "Approve, reject, or return the purchase order before it goes to the supplier.", ar: "اعتمد أو ارفض أو أعد أمر الشراء قبل إرساله للمورد." }, language)}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Back to orders", ar: "العودة إلى الطلبات" }, language)}
      primaryActionIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
      onPrimaryAction={() => navigate("/client/orders")}
    >
      {detail === undefined ? (
        <DashboardCard title={localize({ en: "Loading...", ar: "جار التحميل..." }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Loading purchase order...", ar: "جار تحميل أمر الشراء..." }, language)}</p>
        </DashboardCard>
      ) : detail === null ? (
        <DashboardCard title={localize({ en: "Not found", ar: "غير موجود" }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Purchase order not found.", ar: "أمر الشراء غير موجود." }, language)}</p>
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

          <DashboardCard
            title={`${localize({ en: "PO", ar: "أمر شراء" }, language)} ${detail._id.slice(-6).toUpperCase()}`}
            description={detail.rfq?.notes ?? localize({ en: "No notes provided.", ar: "لا توجد ملاحظات." }, language)}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Supplier", ar: "المورد" }, language)}</span>
                <Badge variant="outline">{detail.supplierAnonymousId}</Badge>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Status", ar: "الحالة" }, language)}</span>
                <StatusBadge tone={poTone(detail.status)}>{poLabel(detail.status, language)}</StatusBadge>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Total", ar: "الإجمالي" }, language)}</span>
                <span className="text-lg font-semibold">{formatCurrency(detail.clientTotal, language)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Lead time / valid until", ar: "زمن التسليم / صالح حتى" }, language)}</span>
                <span className="text-sm">{detail.leadTimeDays} {localize({ en: "days", ar: "يوم" }, language)} · {detail.validUntil}</span>
              </div>
            </div>

            {detail.status === "pendingApproval" && canApprove ? (
              <div className="mt-5 flex flex-col gap-3 border-t border-border/70 pt-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {localize({ en: "Reason (required for reject/return)", ar: "السبب (مطلوب للرفض أو الإعادة)" }, language)}
                  <Input value={reason} onChange={(event) => setReason(event.target.value)} disabled={pendingDecision !== null} />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" disabled={pendingDecision !== null} onClick={() => void handleDecide("approved")} className="flex-1">
                    {pendingDecision === "approved" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                    {localize({ en: "Approve", ar: "اعتماد" }, language)}
                  </Button>
                  <Button type="button" variant="outline" disabled={pendingDecision !== null} onClick={() => void handleDecide("returnedForChanges")} className="flex-1">
                    <RotateCw className="size-4" aria-hidden="true" />
                    {localize({ en: "Return", ar: "إعادة" }, language)}
                  </Button>
                  <Button type="button" variant="ghost" disabled={pendingDecision !== null} onClick={() => void handleDecide("rejected")} className="flex-1">
                    <X className="size-4" aria-hidden="true" />
                    {localize({ en: "Reject", ar: "رفض" }, language)}
                  </Button>
                </div>
              </div>
            ) : null}

            {detail.status === "approved" && canApprove ? (
              <div className="mt-5 border-t border-border/70 pt-4">
                <Button type="button" disabled={isSending} onClick={() => void handleSendToSupplier()}>
                  {isSending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                  {localize({ en: "Send to supplier", ar: "إرسال للمورد" }, language)}
                </Button>
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

          <DashboardCard title={localize({ en: "Approval chain", ar: "سلسلة الموافقات" }, language)}>
            {detail.approvalTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{localize({ en: "No approval chain configured.", ar: "لم يتم تكوين سلسلة الموافقات." }, language)}</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {detail.approvalTasks.map((task) => (
                  <li key={task._id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">
                        {`${task.orderInChain + 1}. ${task.approverName}`}
                      </span>
                      <span className="text-xs text-muted-foreground">{task.approverEmail}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-semibold uppercase">{task.status}</span>
                      {task.decidedAt ? (
                        <span className="text-xs text-muted-foreground">{new Date(task.decidedAt).toLocaleString()}</span>
                      ) : null}
                    </div>
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
