import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, PauseCircle, Send, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminNav } from "@/features/admin/hooks/use-admin-nav";
import { localize } from "@/features/rfq/data/client-workflow-data";
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

function quoteTone(status: string): "info" | "warning" | "danger" | "neutral" {
  if (status === "approvedForRelease" || status === "released" || status === "selected") return "info";
  if (status === "rejected") return "danger";
  if (status === "held") return "warning";
  return "neutral";
}

function quoteLabel(status: string, language: string) {
  const map: Record<string, { en: string; ar: string }> = {
    submitted: { en: "Submitted", ar: "مرسل" },
    underReview: { en: "Under review", ar: "قيد المراجعة" },
    approvedForRelease: { en: "Approved", ar: "موافق عليه" },
    released: { en: "Released", ar: "تم الإصدار" },
    selected: { en: "Selected", ar: "مختار" },
    rejected: { en: "Rejected", ar: "مرفوض" },
    held: { en: "On hold", ar: "معلق" },
    expired: { en: "Expired", ar: "منتهي" },
    lost: { en: "Lost", ar: "خاسر" }
  };
  return localize(map[status] ?? { en: status, ar: status }, language);
}

export function AdminRfqPricingPage() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation("common");
  const navItems = useAdminNav();
  const { user } = useAuth();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user && rfqId ? { actorUserId: user.id as Id<"users">, rfqId: rfqId as Id<"rfqs"> } : "skip";
  const aggregation = useQuery(api.quotes.listSubmittedQuotesForRfq, queryArgs);
  const setDecision = useMutation(api.quotes.setQuoteDecision);
  const releaseQuotes = useMutation(api.quotes.releaseApprovedQuotes);

  const [marginInputs, setMarginInputs] = useState<Record<string, string>>({});
  const [reasonInputs, setReasonInputs] = useState<Record<string, string>>({});
  const [pendingDecisionId, setPendingDecisionId] = useState<Id<"supplierQuotes"> | null>(null);
  const [isReleasing, setIsReleasing] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!aggregation) return;
    const next: Record<string, string> = {};
    for (const quote of aggregation.quotes) {
      next[quote._id] = String(quote.currentMarginPercent || 0);
    }
    setMarginInputs((current) => ({ ...next, ...current }));
  }, [aggregation]);

  const approvedCount = useMemo(() => (aggregation?.quotes ?? []).filter((quote) => quote.status === "approvedForRelease").length, [aggregation]);

  async function handleDecision(quoteId: Id<"supplierQuotes">, decision: "approvedForRelease" | "held" | "rejected") {
    if (!isBetterAuthConfigured || !user) return;
    setMessage(null);
    setPendingDecisionId(quoteId);
    try {
      const margin = Number(marginInputs[quoteId]);
      const reason = reasonInputs[quoteId]?.trim();
      if (decision === "approvedForRelease") {
        if (!Number.isFinite(margin) || margin < 0) {
          throw new Error(localize({ en: "Enter a valid margin percent.", ar: "أدخل نسبة هامش صحيحة." }, language));
        }
      }
      if (decision === "rejected" && !reason) {
        throw new Error(localize({ en: "Rejection reason is required.", ar: "سبب الرفض مطلوب." }, language));
      }
      await setDecision({
        actorUserId: user.id as Id<"users">,
        quoteId,
        decision,
        ...(decision === "approvedForRelease" ? { marginPercent: margin } : {}),
        ...(reason ? { reason } : {})
      });
      setMessage({
        tone: "success",
        text:
          decision === "approvedForRelease"
            ? localize({ en: "Quote approved.", ar: "تم اعتماد العرض." }, language)
            : decision === "held"
              ? localize({ en: "Quote placed on hold.", ar: "تم تعليق العرض." }, language)
              : localize({ en: "Quote rejected.", ar: "تم رفض العرض." }, language)
      });
      setReasonInputs((current) => ({ ...current, [quoteId]: "" }));
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({ tone: "error", text: text || localize({ en: "Could not update the quote.", ar: "تعذر تحديث العرض." }, language) });
    } finally {
      setPendingDecisionId(null);
    }
  }

  async function handleRelease() {
    if (!isBetterAuthConfigured || !user || !rfqId) return;
    setMessage(null);
    setIsReleasing(true);
    try {
      const result = await releaseQuotes({ actorUserId: user.id as Id<"users">, rfqId: rfqId as Id<"rfqs"> });
      trackEvent("quotes_released", { rfq_id: rfqId, released_count: result.releasedCount });
      setMessage({
        tone: "success",
        text: localize(
          {
            en: `Released ${result.releasedCount} quote(s) to client.`,
            ar: `تم إصدار ${result.releasedCount} عرضاً للعميل.`
          },
          language
        )
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({ tone: "error", text: text || localize({ en: "Could not release quotes.", ar: "تعذر إصدار العروض." }, language) });
    } finally {
      setIsReleasing(false);
    }
  }

  return (
    <PortalShell
      title={localize({ en: "Quote pricing", ar: "تسعير العروض" }, language)}
      description={localize({ en: "Apply margins, decide, and release to the client.", ar: "تطبيق الهوامش واتخاذ القرار وإصدار العروض للعميل." }, language)}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Back to operations", ar: "العودة إلى العمليات" }, language)}
      primaryActionIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
      onPrimaryAction={() => navigate("/admin/operations")}
    >
      {aggregation === undefined ? (
        <DashboardCard title={localize({ en: "Loading...", ar: "جار التحميل..." }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Loading quotes...", ar: "جار تحميل العروض..." }, language)}</p>
        </DashboardCard>
      ) : aggregation === null ? (
        <DashboardCard title={localize({ en: "Not found", ar: "غير موجود" }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "RFQ not found.", ar: "الطلب غير موجود." }, language)}</p>
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
            title={`${localize({ en: "RFQ", ar: "طلب" }, language)} ${aggregation.rfq._id.slice(-6).toUpperCase()}`}
            description={aggregation.rfq.notes ?? localize({ en: "No client notes provided.", ar: "لا توجد ملاحظات من العميل." }, language)}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Client", ar: "العميل" }, language)}</span>
                <Badge variant="outline">{aggregation.rfq.clientAnonymousId}</Badge>
                <span className="text-xs text-muted-foreground">{aggregation.rfq.clientName}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Status", ar: "الحالة" }, language)}</span>
                <span className="text-sm font-semibold">{aggregation.rfq.status}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Required by", ar: "مطلوب بحلول" }, language)}</span>
                <span className="text-sm">{aggregation.rfq.requiredDeliveryDate ?? localize({ en: "Not specified", ar: "غير محدد" }, language)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Quotes", ar: "العروض" }, language)}</span>
                <span className="text-sm font-semibold">{aggregation.quotes.length}</span>
                <span className="text-xs text-muted-foreground">
                  {approvedCount} {localize({ en: "approved", ar: "موافق عليها" }, language)}
                </span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" disabled={isReleasing || approvedCount === 0 || !isBetterAuthConfigured} onClick={() => void handleRelease()}>
                {isReleasing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                {localize({ en: "Release approved quotes", ar: "إصدار العروض المعتمدة" }, language)}
              </Button>
              {approvedCount === 0 ? (
                <span className="text-xs text-muted-foreground">{localize({ en: "Approve at least one quote to enable release.", ar: "اعتمد عرضاً واحداً على الأقل لتمكين الإصدار." }, language)}</span>
              ) : null}
            </div>
          </DashboardCard>

          <DashboardCard title={localize({ en: "Line items", ar: "بنود الطلب" }, language)}>
            <DataTable
              rows={aggregation.lineItems}
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
                { header: localize({ en: "Quantity", ar: "الكمية" }, language), cell: (item) => <span>{`${item.quantity} ${item.unit}`}</span> }
              ]}
            />
          </DashboardCard>

          <DashboardCard title={localize({ en: "Supplier quotes", ar: "عروض الموردين" }, language)} description={localize({ en: "Supplier identities and raw prices stay internal.", ar: "تبقى هويات الموردين والأسعار الأساسية داخلياً." }, language)}>
            {aggregation.quotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{localize({ en: "No quotes submitted yet.", ar: "لا توجد عروض مرسلة بعد." }, language)}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {aggregation.quotes.map((quote) => {
                  const margin = Number(marginInputs[quote._id] ?? 0);
                  const projectedClientTotal = Number.isFinite(margin) ? quote.supplierTotal * (1 + margin / 100) : quote.supplierTotal;
                  const isPending = pendingDecisionId === quote._id;
                  const isFinalized = quote.status === "released" || quote.status === "selected";
                  return (
                    <div key={quote._id} className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">{quote.supplierName}</span>
                          <span className="text-xs text-muted-foreground">
                            {quote.supplierAnonymousId} · {localize({ en: "Lead time", ar: "زمن التسليم" }, language)} {quote.leadTimeDays}{" "}
                            {localize({ en: "days", ar: "يوم" }, language)} · {localize({ en: "Valid until", ar: "صالح حتى" }, language)} {quote.validUntil}
                          </span>
                        </div>
                        <StatusBadge tone={quoteTone(quote.status)}>{quoteLabel(quote.status, language)}</StatusBadge>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Supplier total", ar: "إجمالي المورد" }, language)}</span>
                          <span className="text-lg font-semibold">{formatCurrency(quote.supplierTotal, language)}</span>
                        </div>
                        <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Client total (projected)", ar: "إجمالي العميل (متوقع)" }, language)}</span>
                          <span className="text-lg font-semibold">{formatCurrency(projectedClientTotal, language)}</span>
                          {quote.status === "approvedForRelease" || quote.status === "released" ? (
                            <span className="text-xs text-muted-foreground">
                              {localize({ en: "Frozen at", ar: "ثُبّت عند" }, language)} {formatCurrency(quote.clientTotal, language)}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Margin overrides", ar: "تعديلات الهامش" }, language)}</span>
                          <span className="text-lg font-semibold">{quote.overrideCount}</span>
                          <span className="text-xs text-muted-foreground">
                            {localize({ en: "Current", ar: "الحالي" }, language)}: {quote.currentMarginPercent}%
                          </span>
                        </div>
                      </div>

                      {!isFinalized ? (
                        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto]">
                          <label className="flex flex-col gap-1.5 text-sm font-medium">
                            {localize({ en: "Margin %", ar: "الهامش %" }, language)}
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={marginInputs[quote._id] ?? ""}
                              onChange={(event) => setMarginInputs((current) => ({ ...current, [quote._id]: event.target.value }))}
                              disabled={isPending}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm font-medium">
                            {localize({ en: "Reason (required when changing margin or rejecting)", ar: "السبب (مطلوب عند تغيير الهامش أو الرفض)" }, language)}
                            <Input
                              value={reasonInputs[quote._id] ?? ""}
                              onChange={(event) => setReasonInputs((current) => ({ ...current, [quote._id]: event.target.value }))}
                              disabled={isPending}
                            />
                          </label>
                          <div className="flex items-end">
                            <Button type="button" disabled={isPending} onClick={() => void handleDecision(quote._id, "approvedForRelease")}>
                              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                              {localize({ en: "Approve", ar: "اعتماد" }, language)}
                            </Button>
                          </div>
                          <div className="flex items-end">
                            <Button type="button" variant="outline" disabled={isPending} onClick={() => void handleDecision(quote._id, "held")}>
                              <PauseCircle className="size-4" aria-hidden="true" />
                              {localize({ en: "Hold", ar: "تعليق" }, language)}
                            </Button>
                          </div>
                          <div className="flex items-end">
                            <Button type="button" variant="ghost" disabled={isPending} onClick={() => void handleDecision(quote._id, "rejected")}>
                              <X className="size-4" aria-hidden="true" />
                              {localize({ en: "Reject", ar: "رفض" }, language)}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {localize({ en: "This quote has been released and is locked.", ar: "تم إصدار هذا العرض وأصبح مقفلاً." }, language)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </DashboardCard>
        </>
      )}
    </PortalShell>
  );
}
