import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowUpDown, CheckCircle2, FileText, Loader2, Lock, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type SortKey = "price" | "lead" | "validity";

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

export function ClientQuoteComparisonPage() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation(["common", "quotes"]);
  const navItems = useClientNav();
  const { user } = useAuth();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user && rfqId ? { actorUserId: user.id as Id<"users">, rfqId: rfqId as Id<"rfqs"> } : "skip";
  const data = useQuery(api.quotes.getRfqQuoteComparison, queryArgs);
  const selectAwardsByLineItem = useMutation(api.quotes.selectAwardsByLineItem);
  const generatePo = useMutation(api.purchaseOrders.generatePoFromSelectedQuote);
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [overrides, setOverrides] = useState<Record<string, Id<"supplierQuotes">>>({});
  const [isLocking, setIsLocking] = useState(false);
  const [isGeneratingPo, setIsGeneratingPo] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const sortedQuotes = useMemo(() => {
    const source = data?.quotes ?? [];
    const copy = [...source];
    if (sortKey === "price") {
      copy.sort((a, b) => a.clientTotal - b.clientTotal);
    } else if (sortKey === "lead") {
      copy.sort((a, b) => a.leadTimeDays - b.leadTimeDays);
    } else {
      copy.sort((a, b) => a.validUntil.localeCompare(b.validUntil));
    }
    return copy;
  }, [data, sortKey]);

  const awards = useMemo<Record<string, Id<"supplierQuotes">>>(() => {
    if (!data?.lineItems) return {};
    const next: Record<string, Id<"supplierQuotes">> = {};
    for (const item of data.lineItems) {
      const override = overrides[item._id];
      if (override) {
        next[item._id] = override;
        continue;
      }
      const eligible = (data.quotes ?? [])
        .map((quote) => {
          const line = quote.lineItems.find((entry) => entry.rfqLineItemId === item._id);
          return line ? { quoteId: quote._id, total: line.clientFinalTotalPrice ?? Number.POSITIVE_INFINITY } : null;
        })
        .filter((entry): entry is { quoteId: Id<"supplierQuotes">; total: number } => entry !== null)
        .sort((a, b) => a.total - b.total);
      if (eligible.length > 0) {
        next[item._id] = eligible[0].quoteId;
      }
    }
    return next;
  }, [data, overrides]);

  const lowestPrice = useMemo(
    () => (sortedQuotes.length > 0 ? Math.min(...sortedQuotes.map((quote) => quote.clientTotal)) : 0),
    [sortedQuotes]
  );

  const awardSummary = useMemo(() => {
    if (!data) {
      return { uniqueQuoteCount: 0, lineItemCount: 0, total: 0, isFullyAssigned: false, isSplit: false };
    }
    const lineItemCount = data.lineItems.length;
    const assignedIds = data.lineItems
      .map((item) => awards[item._id])
      .filter((value): value is Id<"supplierQuotes"> => Boolean(value));
    const uniqueQuoteCount = new Set(assignedIds).size;
    let total = 0;
    for (const item of data.lineItems) {
      const quoteId = awards[item._id];
      if (!quoteId) continue;
      const quote = data.quotes.find((entry) => entry._id === quoteId);
      const line = quote?.lineItems.find((entry) => entry.rfqLineItemId === item._id);
      total += line?.clientFinalTotalPrice ?? 0;
    }
    return {
      uniqueQuoteCount,
      lineItemCount,
      total,
      isFullyAssigned: lineItemCount > 0 && assignedIds.length === lineItemCount,
      isSplit: uniqueQuoteCount > 1
    };
  }, [data, awards]);

  function handleAwardLineItem(lineItemId: Id<"rfqLineItems">, quoteId: Id<"supplierQuotes">) {
    setOverrides((prev) => ({ ...prev, [lineItemId]: quoteId }));
  }

  function handleAwardAllToQuote(quoteId: Id<"supplierQuotes">) {
    if (!data) return;
    const quote = data.quotes.find((entry) => entry._id === quoteId);
    if (!quote) return;
    const next: Record<string, Id<"supplierQuotes">> = {};
    for (const item of data.lineItems) {
      if (quote.lineItems.some((line) => line.rfqLineItemId === item._id)) {
        next[item._id] = quoteId;
      }
    }
    setOverrides(next);
  }

  async function handleLockAwards() {
    if (!isBetterAuthConfigured || !user || !rfqId || !data) return;
    if (!awardSummary.isFullyAssigned) return;
    setMessage(null);
    setIsLocking(true);
    try {
      const payload = data.lineItems.map((item) => ({
        rfqLineItemId: item._id,
        quoteId: awards[item._id]
      }));
      const result = await selectAwardsByLineItem({
        actorUserId: user.id as Id<"users">,
        rfqId: rfqId as Id<"rfqs">,
        awards: payload
      });
      trackEvent(result.isSplit ? "quote_split_awarded" : "quote_selected", {
        rfq_id: rfqId,
        unique_supplier_count: result.awardedQuoteIds.length
      });
      setMessage({
        tone: "success",
        text: result.isSplit
          ? localize(
              {
                en: `Award split across ${result.awardedQuoteIds.length} suppliers — RFQ locked.`,
                ar: `تم توزيع الجائزة على ${result.awardedQuoteIds.length} موردين — تم قفل الطلب.`
              },
              language
            )
          : localize({ en: "Quote selected. RFQ is now locked.", ar: "تم اختيار العرض. تم قفل الطلب." }, language)
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({
        tone: "error",
        text: text || localize({ en: "Could not lock awards.", ar: "تعذر تأكيد التوزيع." }, language)
      });
    } finally {
      setIsLocking(false);
    }
  }

  async function handleGeneratePo() {
    if (!isBetterAuthConfigured || !user || !rfqId) return;
    setMessage(null);
    setIsGeneratingPo(true);
    try {
      const result = await generatePo({
        actorUserId: user.id as Id<"users">,
        rfqId: rfqId as Id<"rfqs">,
        idempotencyKey: crypto.randomUUID()
      });
      const firstId = result.purchaseOrderIds[0];
      if (firstId) {
        navigate(`/client/orders/po/${firstId}`);
      } else {
        navigate("/client/orders");
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({
        tone: "error",
        text: text || localize({ en: "Could not generate PO.", ar: "تعذر إنشاء أمر الشراء." }, language)
      });
    } finally {
      setIsGeneratingPo(false);
    }
  }

  return (
    <PortalShell
      title={localize({ en: "Quote comparison", ar: "مقارنة العروض" }, language)}
      description={localize(
        { en: "Compare anonymous released quotes and award per line item.", ar: "قارن العروض المجهولة المصدرة ووزّع لكل بند." },
        language
      )}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Back to quotes", ar: "العودة إلى العروض" }, language)}
      primaryActionIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
      onPrimaryAction={() => navigate("/client/quotes")}
    >
      {data === undefined ? (
        <DashboardCard title={localize({ en: "Loading...", ar: "جار التحميل..." }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Loading quotes...", ar: "جار تحميل العروض..." }, language)}</p>
        </DashboardCard>
      ) : data === null || !data.rfq ? (
        <DashboardCard title={localize({ en: "Not available", ar: "غير متاح" }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "No released quotes for this RFQ yet.", ar: "لا توجد عروض مصدرة لهذا الطلب بعد." }, language)}</p>
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
            title={`${localize({ en: "RFQ", ar: "طلب" }, language)} ${data.rfq._id.slice(-6).toUpperCase()}`}
            description={data.rfq.notes ?? localize({ en: "No notes provided.", ar: "لا توجد ملاحظات." }, language)}
          >
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone={data.locked ? "info" : "warning"}>
                {data.locked
                  ? localize({ en: "Locked — selection captured", ar: "مقفل — تم تسجيل الاختيار" }, language)
                  : localize({ en: "Awaiting decision", ar: "بانتظار القرار" }, language)}
              </StatusBadge>
              <span className="text-sm text-muted-foreground">
                {sortedQuotes.length} {localize({ en: "anonymous quotes", ar: "عروض مجهولة" }, language)}
              </span>
              {data.rfq.requiredDeliveryDate ? (
                <span className="text-sm text-muted-foreground">
                  {localize({ en: "Required by", ar: "مطلوب بحلول" }, language)}: {data.rfq.requiredDeliveryDate}
                </span>
              ) : null}
              {data.rfq.status === "selected" ? (
                <Button type="button" disabled={isGeneratingPo} onClick={() => void handleGeneratePo()}>
                  {isGeneratingPo ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
                  {localize({ en: "Generate PO", ar: "إنشاء أمر شراء" }, language)}
                </Button>
              ) : data.rfq.status === "poGenerated" ? (
                <span className="text-sm font-semibold text-primary">
                  {localize({ en: "PO already generated — see Orders.", ar: "تم إنشاء أمر الشراء — راجع الطلبات." }, language)}
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <ArrowUpDown className="size-4" aria-hidden="true" />
                {localize({ en: "Sort by", ar: "ترتيب حسب" }, language)}
              </span>
              {([
                { key: "price" as const, en: "Lowest price", ar: "أقل سعر" },
                { key: "lead" as const, en: "Fastest delivery", ar: "أسرع تسليم" },
                { key: "validity" as const, en: "Earliest expiry", ar: "أقرب انتهاء" }
              ]).map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="sm"
                  variant={sortKey === option.key ? "default" : "outline"}
                  onClick={() => setSortKey(option.key)}
                >
                  {localize(option, language)}
                </Button>
              ))}
            </div>
          </DashboardCard>

          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {sortedQuotes.map((quote) => {
              const isLowest = quote.clientTotal === lowestPrice;
              const linesAwardedToQuote = data.lineItems.filter((item) => awards[item._id] === quote._id).length;
              const isFullBasketSelected = !data.locked && linesAwardedToQuote === data.lineItems.length && data.lineItems.length > 0;
              return (
                <article
                  key={quote._id}
                  className={cn(
                    "flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-card",
                    linesAwardedToQuote > 0 ? "border-primary/60" : "border-border/70"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={isLowest ? "info" : "outline"}>{quote.supplierAnonymousId}</Badge>
                    {isLowest ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-mwrd-sun">
                        <Star className="size-4 fill-mwrd-sun text-mwrd-sun" aria-hidden="true" />
                        {localize({ en: "Best price", ar: "أفضل سعر" }, language)}
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Final client price", ar: "السعر النهائي للعميل" }, language)}</p>
                    <p className="mt-1 text-3xl font-semibold">{formatCurrency(quote.clientTotal, language)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {localize({ en: "Valid until", ar: "صالح حتى" }, language)}: {quote.validUntil}
                    </p>
                  </div>
                  <div className="grid gap-2 text-sm">
                    <div className="rounded-lg bg-muted/40 p-3">
                      <span className="text-muted-foreground">{localize({ en: "Lead time", ar: "زمن التسليم" }, language)}</span>
                      <p className="mt-1 font-semibold">{quote.leadTimeDays} {localize({ en: "days", ar: "يوم" }, language)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <span className="text-muted-foreground">{localize({ en: "Lines awarded", ar: "البنود الموزّعة" }, language)}</span>
                      <p className="mt-1 font-semibold">
                        {linesAwardedToQuote} / {data.lineItems.length}
                      </p>
                    </div>
                  </div>
                  {quote.status === "selected" ? (
                    <StatusBadge tone="info">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      {localize({ en: "Selected", ar: "مختار" }, language)}
                    </StatusBadge>
                  ) : (
                    <Button
                      type="button"
                      variant={isFullBasketSelected ? "default" : "outline"}
                      disabled={data.locked || !isBetterAuthConfigured}
                      onClick={() => handleAwardAllToQuote(quote._id)}
                    >
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      {localize({ en: "Award all lines to this supplier", ar: "اعتمد كل البنود لهذا المورد" }, language)}
                    </Button>
                  )}
                </article>
              );
            })}
          </section>

          <DashboardCard
            title={localize({ en: "Award by line item", ar: "تخصيص لكل بند" }, language)}
            description={localize(
              { en: "Pick the best supplier per line, or award all to one.", ar: "اختر المورد الأفضل لكل بند، أو اعتمد الكل لمورد واحد." },
              language
            )}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold">
                {localize({ en: "Awarded total", ar: "إجمالي التوزيع" }, language)}: {formatCurrency(awardSummary.total, language)}
              </span>
              <StatusBadge tone={awardSummary.isSplit ? "warning" : "info"}>
                {awardSummary.isSplit
                  ? localize({ en: "Split award", ar: "توزيع متعدد الموردين" }, language)
                  : localize({ en: "Single supplier award", ar: "مورد واحد" }, language)}
              </StatusBadge>
              <span className="text-muted-foreground">
                {awardSummary.uniqueQuoteCount} {localize({ en: "supplier(s)", ar: "مورد" }, language)} · {awardSummary.lineItemCount} {localize({ en: "lines", ar: "بنود" }, language)}
              </span>
              {!data.locked ? (
                <Button
                  type="button"
                  className="ms-auto"
                  disabled={!awardSummary.isFullyAssigned || isLocking}
                  onClick={() => void handleLockAwards()}
                >
                  {isLocking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Lock className="size-4" aria-hidden="true" />}
                  {localize({ en: "Lock awards", ar: "تأكيد التوزيع" }, language)}
                </Button>
              ) : null}
            </div>
            <DataTable
              rows={data.lineItems}
              emptyLabel={localize({ en: "No line items.", ar: "لا توجد بنود." }, language)}
              getRowKey={(item) => item._id}
              columns={[
                {
                  header: localize({ en: "Item", ar: "البند" }, language),
                  cell: (item) => (
                    <div className="flex flex-col">
                      <span className="font-semibold">{item.product ? localizePair(item.product.nameAr, item.product.nameEn, language) : localizePair(item.descriptionAr, item.descriptionEn, language) || localize({ en: "Custom item", ar: "بند مخصص" }, language)}</span>
                      <span className="text-xs text-muted-foreground">{`${item.quantity} ${item.unit}`}</span>
                    </div>
                  )
                },
                ...sortedQuotes.map((quote) => ({
                  header: quote.supplierAnonymousId,
                  cell: (item: typeof data.lineItems[number]) => {
                    const line = quote.lineItems.find((entry) => entry.rfqLineItemId === item._id);
                    if (!line) {
                      return <span className="text-xs text-muted-foreground">—</span>;
                    }
                    const isAwarded = awards[item._id] === quote._id;
                    return (
                      <button
                        type="button"
                        disabled={data.locked || !isBetterAuthConfigured}
                        onClick={() => handleAwardLineItem(item._id, quote._id)}
                        className={cn(
                          "flex w-full flex-col items-start gap-1 rounded-md border px-2 py-1.5 text-start transition",
                          isAwarded
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-transparent hover:border-border/60",
                          (data.locked || !isBetterAuthConfigured) && "cursor-default opacity-70"
                        )}
                      >
                        <span className="font-medium">{formatCurrency(line.clientFinalUnitPrice, language)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatCurrency(line.clientFinalTotalPrice, language)}
                        </span>
                      </button>
                    );
                  }
                }))
              ]}
            />
          </DashboardCard>
        </>
      )}
    </PortalShell>
  );
}
