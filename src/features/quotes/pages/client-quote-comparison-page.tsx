import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowUpDown, CheckCircle2, FileText, Loader2, Star } from "lucide-react";
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
  const selectQuote = useMutation(api.quotes.selectQuote);
  const generatePo = useMutation(api.purchaseOrders.generatePoFromSelectedQuote);
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [pendingId, setPendingId] = useState<Id<"supplierQuotes"> | null>(null);
  const [isGeneratingPo, setIsGeneratingPo] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function handleGeneratePo() {
    if (!isBetterAuthConfigured || !user || !rfqId) return;
    setMessage(null);
    setIsGeneratingPo(true);
    try {
      const purchaseOrderId = await generatePo({
        actorUserId: user.id as Id<"users">,
        rfqId: rfqId as Id<"rfqs">
      });
      navigate(`/client/orders/po/${purchaseOrderId}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({ tone: "error", text: text || localize({ en: "Could not generate PO.", ar: "تعذر إنشاء أمر الشراء." }, language) });
    } finally {
      setIsGeneratingPo(false);
    }
  }

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

  const lowestPrice = useMemo(() => sortedQuotes.length > 0 ? Math.min(...sortedQuotes.map((quote) => quote.clientTotal)) : 0, [sortedQuotes]);

  async function handleSelect(quoteId: Id<"supplierQuotes">) {
    if (!isBetterAuthConfigured || !user || !rfqId) return;
    setMessage(null);
    setPendingId(quoteId);
    try {
      await selectQuote({
        actorUserId: user.id as Id<"users">,
        rfqId: rfqId as Id<"rfqs">,
        quoteId
      });
      trackEvent("quote_selected", { rfq_id: rfqId, quote_id: quoteId });
      setMessage({ tone: "success", text: localize({ en: "Quote selected. RFQ is now locked.", ar: "تم اختيار العرض. تم قفل الطلب." }, language) });
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({ tone: "error", text: text || localize({ en: "Could not select the quote.", ar: "تعذر اختيار العرض." }, language) });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <PortalShell
      title={localize({ en: "Quote comparison", ar: "مقارنة العروض" }, language)}
      description={localize({ en: "Compare anonymous released quotes and lock your selection.", ar: "قارن العروض المجهولة المصدرة وقفل اختيارك." }, language)}
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
              {(
                [
                  { key: "price" as const, en: "Lowest price", ar: "أقل سعر" },
                  { key: "lead" as const, en: "Fastest delivery", ar: "أسرع تسليم" },
                  { key: "validity" as const, en: "Earliest expiry", ar: "أقرب انتهاء" }
                ]
              ).map((option) => (
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
              const isSelected = quote.status === "selected";
              const isLowest = quote.clientTotal === lowestPrice;
              return (
                <article
                  key={quote._id}
                  className={cn(
                    "flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-card",
                    isSelected ? "border-primary/60" : "border-border/70"
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
                      <span className="text-muted-foreground">{localize({ en: "Partial fulfillment", ar: "التنفيذ الجزئي" }, language)}</span>
                      <p className="mt-1 font-semibold">
                        {quote.supportsPartialFulfillment
                          ? localize({ en: "Allowed", ar: "مسموح" }, language)
                          : localize({ en: "Not allowed", ar: "غير مسموح" }, language)}
                      </p>
                    </div>
                  </div>
                  {isSelected ? (
                    <StatusBadge tone="info">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      {localize({ en: "Selected", ar: "مختار" }, language)}
                    </StatusBadge>
                  ) : (
                    <Button
                      type="button"
                      disabled={data.locked || pendingId === quote._id || !isBetterAuthConfigured}
                      onClick={() => void handleSelect(quote._id)}
                    >
                      {pendingId === quote._id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
                      {localize({ en: "Select this quote", ar: "اختر هذا العرض" }, language)}
                    </Button>
                  )}
                </article>
              );
            })}
          </section>

          <DashboardCard title={localize({ en: "Per-line comparison", ar: "مقارنة لكل بند" }, language)}>
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
                    return line ? (
                      <span>
                        {formatCurrency(line.clientFinalUnitPrice, language)}
                        <span className="ms-1 text-xs text-muted-foreground">
                          ({formatCurrency(line.clientFinalTotalPrice, language)})
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
