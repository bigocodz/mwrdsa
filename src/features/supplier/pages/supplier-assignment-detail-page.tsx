import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, FileCheck2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useSupplierNav } from "@/features/supplier/hooks/use-supplier-nav";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const lineSchema = z.object({
  rfqLineItemId: z.string(),
  unitPrice: z.number().min(0)
});

const formSchema = z.object({
  leadTimeDays: z.number().int().min(1),
  validUntil: z.string().min(1),
  supportsPartialFulfillment: z.boolean(),
  lines: z.array(lineSchema).min(1)
});

type FormValues = z.infer<typeof formSchema>;

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

function formatDate(timestamp: number, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

export function SupplierAssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation("common");
  const navItems = useSupplierNav();
  const { user } = useAuth();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user && assignmentId ? { actorUserId: user.id as Id<"users">, assignmentId: assignmentId as Id<"supplierRfqAssignments"> } : "skip";
  const detail = useQuery(api.quotes.getSupplierAssignmentDetail, queryArgs);
  const existingQuote = useQuery(api.quotes.getQuoteForAssignment, queryArgs);
  const submitQuote = useMutation(api.quotes.submitSupplierQuote);
  const [submitMessage, setSubmitMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leadTimeDays: 7,
      validUntil: "",
      supportsPartialFulfillment: false,
      lines: []
    }
  });

  useEffect(() => {
    if (!detail) {
      return;
    }
    reset({
      leadTimeDays: 7,
      validUntil: "",
      supportsPartialFulfillment: false,
      lines: detail.lineItems.map((item) => ({ rfqLineItemId: item._id, unitPrice: 0 }))
    });
  }, [detail, reset]);

  const watchedLines = useWatch({ control, name: "lines" });

  const totals = useMemo(() => {
    if (!detail || !watchedLines) {
      return { lineTotals: [] as number[], grand: 0 };
    }
    const lineTotals = detail.lineItems.map((item, index) => {
      const unit = Number(watchedLines[index]?.unitPrice) || 0;
      return unit * item.quantity;
    });
    const grand = lineTotals.reduce((sum, value) => sum + value, 0);
    return { lineTotals, grand };
  }, [detail, watchedLines]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitMessage(null);
    if (!isBetterAuthConfigured || !user || !assignmentId || !detail) {
      return;
    }
    try {
      const lineItems = detail.lineItems.map((item, index) => {
        const unitPrice = Number(values.lines[index]?.unitPrice) || 0;
        return {
          rfqLineItemId: item._id,
          supplierUnitPrice: unitPrice,
          supplierTotalPrice: unitPrice * item.quantity
        };
      });
      await submitQuote({
        actorUserId: user.id as Id<"users">,
        assignmentId: assignmentId as Id<"supplierRfqAssignments">,
        leadTimeDays: values.leadTimeDays,
        validUntil: values.validUntil,
        supportsPartialFulfillment: values.supportsPartialFulfillment,
        lineItems
      });
      setSubmitMessage({ tone: "success", text: localize({ en: "Quote submitted to MWRD review.", ar: "تم إرسال العرض إلى مراجعة مورد." }, language) });
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setSubmitMessage({ tone: "error", text: text || localize({ en: "Could not submit the quote.", ar: "تعذر إرسال العرض." }, language) });
    }
  });

  return (
    <PortalShell
      title={localize({ en: "RFQ assignment", ar: "تعيين طلب التسعير" }, language)}
      description={localize({ en: "Anonymous RFQ details and quote submission", ar: "تفاصيل طلب مجهول وإرسال العرض" }, language)}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Back to inbox", ar: "العودة إلى صندوق الوارد" }, language)}
      primaryActionIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
      onPrimaryAction={() => navigate("/supplier/rfqs")}
    >
      {detail === undefined ? (
        <DashboardCard title={localize({ en: "Loading...", ar: "جار التحميل..." }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Loading assignment...", ar: "جار تحميل التعيين..." }, language)}</p>
        </DashboardCard>
      ) : detail === null ? (
        <DashboardCard title={localize({ en: "Not found", ar: "غير موجود" }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "This assignment does not exist or you cannot access it.", ar: "هذا التعيين غير موجود أو لا يمكنك الوصول إليه." }, language)}</p>
        </DashboardCard>
      ) : (
        <section className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="flex flex-col gap-5">
            <DashboardCard title={`${localize({ en: "RFQ", ar: "طلب" }, language)} ${detail.rfq._id.slice(-6).toUpperCase()}`} description={detail.rfq.notes ?? localize({ en: "No client notes provided.", ar: "لا توجد ملاحظات من العميل." }, language)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Anonymous client", ar: "عميل مجهول" }, language)}</span>
                  <Badge variant="outline">{detail.rfq.clientAnonymousId}</Badge>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Type", ar: "النوع" }, language)}</span>
                  <span className="text-sm font-semibold">{detail.rfq.isNonCatalog ? localize({ en: "Non-catalog", ar: "خارج الكتالوج" }, language) : localize({ en: "Catalog", ar: "كتالوج" }, language)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Required by", ar: "مطلوب بحلول" }, language)}</span>
                  <span className="text-sm">{detail.rfq.requiredDeliveryDate ?? localize({ en: "Not specified", ar: "غير محدد" }, language)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Response deadline", ar: "موعد الرد" }, language)}</span>
                  <span className="text-sm">{formatDate(detail.responseDeadline, language)}</span>
                </div>
              </div>
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
                  { header: localize({ en: "Quantity", ar: "الكمية" }, language), cell: (item) => <span>{`${item.quantity} ${item.unit}`}</span> }
                ]}
              />
            </DashboardCard>
          </div>

          <DashboardCard
            title={localize({ en: "Submit quote", ar: "إرسال عرض" }, language)}
            description={localize({ en: "Pricing stays internal. MWRD applies margin before releasing to the client.", ar: "يبقى التسعير داخلياً. تضيف مورد الهامش قبل الإصدار للعميل." }, language)}
          >
            {existingQuote ? (
              <div className="flex flex-col gap-2">
                <StatusBadge tone="info">{localize({ en: "Quote already submitted", ar: "تم إرسال العرض" }, language)}</StatusBadge>
                <p className="text-sm text-muted-foreground">
                  {localize({ en: "Lead time", ar: "زمن التسليم" }, language)}: {existingQuote.leadTimeDays} {localize({ en: "days", ar: "يوم" }, language)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {localize({ en: "Valid until", ar: "صالح حتى" }, language)}: {existingQuote.validUntil}
                </p>
                <p className="text-sm font-semibold">
                  {localize({ en: "Supplier total", ar: "إجمالي المورد" }, language)}: {formatCurrency(existingQuote.lineItems.reduce((sum, item) => sum + item.supplierTotalPrice, 0), language)}
                </p>
              </div>
            ) : detail.status !== "accepted" ? (
              <p className="text-sm text-muted-foreground">{localize({ en: "Accept the assignment from the inbox before submitting a quote.", ar: "اقبل التعيين من صندوق الوارد قبل إرسال العرض." }, language)}</p>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                <div className="flex flex-col gap-3">
                  {detail.lineItems.map((item, index) => (
                    <div key={item._id} className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{item.product ? localizePair(item.product.nameAr, item.product.nameEn, language) : localizePair(item.descriptionAr, item.descriptionEn, language) || localize({ en: "Custom item", ar: "بند مخصص" }, language)}</span>
                        <span className="text-xs text-muted-foreground">{`${item.quantity} ${item.unit}`}</span>
                      </div>
                      <input type="hidden" {...register(`lines.${index}.rfqLineItemId` as const)} value={item._id} />
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        {localize({ en: "Unit price (SAR)", ar: "سعر الوحدة (ريال)" }, language)}
                        <Input type="number" min="0" step="0.01" aria-invalid={Boolean(errors.lines?.[index]?.unitPrice)} {...register(`lines.${index}.unitPrice` as const, { valueAsNumber: true })} />
                      </label>
                      <span className="text-xs text-muted-foreground">
                        {localize({ en: "Line total", ar: "إجمالي البند" }, language)}: {formatCurrency(totals.lineTotals[index] ?? 0, language)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {localize({ en: "Lead time (days)", ar: "زمن التسليم (أيام)" }, language)}
                    <Input type="number" min="1" step="1" aria-invalid={Boolean(errors.leadTimeDays)} {...register("leadTimeDays", { valueAsNumber: true })} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {localize({ en: "Valid until", ar: "صالح حتى" }, language)}
                    <Input type="date" aria-invalid={Boolean(errors.validUntil)} {...register("validUntil")} />
                  </label>
                </div>

                <label className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/45 p-3 text-sm font-semibold">
                  <input type="checkbox" className="mt-1 size-4 rounded border-input accent-primary" {...register("supportsPartialFulfillment")} />
                  <span className="flex flex-col gap-1">
                    <span>{localize({ en: "Supports partial fulfillment", ar: "يدعم التنفيذ الجزئي" }, language)}</span>
                    <span className="text-xs font-medium text-muted-foreground">{localize({ en: "Allow MWRD to award only some line items.", ar: "اسمح لمورد بمنح بعض البنود فقط." }, language)}</span>
                  </span>
                </label>

                <p className="text-sm font-semibold">
                  {localize({ en: "Supplier total", ar: "إجمالي المورد" }, language)}: {formatCurrency(totals.grand, language)}
                </p>

                {submitMessage ? (
                  <p
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-semibold",
                      submitMessage.tone === "success"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    )}
                  >
                    {submitMessage.text}
                  </p>
                ) : null}

                <Button type="submit" disabled={isSubmitting || !isBetterAuthConfigured}>
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="size-4" aria-hidden="true" />}
                  {localize({ en: "Submit quote", ar: "إرسال العرض" }, language)}
                </Button>
              </form>
            )}
          </DashboardCard>
        </section>
      )}
    </PortalShell>
  );
}
