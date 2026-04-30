import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, Copy, FileSpreadsheet, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";
import { useRfqCart } from "@/features/rfq/hooks/use-rfq-cart";
import { parseRfqCsv, type CsvParseError } from "@/features/rfq/lib/csv-import";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const lineItemSchema = z.object({
  productId: z.string().optional(),
  descriptionAr: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  quantity: z.number().min(1, { message: "min" }),
  unit: z.string().trim().min(1, { message: "required" })
});

const rfqFormSchema = z
  .object({
    isNonCatalog: z.boolean(),
    requiredDeliveryDate: z.string().optional(),
    notes: z.string().trim().max(500).optional(),
    lineItems: z.array(lineItemSchema).min(1)
  })
  .superRefine((value, ctx) => {
    value.lineItems.forEach((item, index) => {
      const hasProduct = item.productId && item.productId.length > 0;
      const hasDescription = (item.descriptionAr ?? "").trim().length > 0 || (item.descriptionEn ?? "").trim().length > 0;
      if (!hasProduct && !hasDescription) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lineItems", index, "descriptionEn"],
          message: "needsItem"
        });
      }
    });
  });

type RfqFormValues = z.infer<typeof rfqFormSchema>;
type SubmitMessage = { tone: "success" | "error"; text: string };

const textareaClassName = "min-h-20 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const selectClassName = "flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function messageClassName(tone: SubmitMessage["tone"]) {
  return cn("rounded-lg border px-3 py-2 text-sm font-semibold", tone === "success" ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive");
}

function localizePair(ar: string | undefined | null, en: string | undefined | null, language: string) {
  return language === "ar" ? ar || en || "" : en || ar || "";
}

function formatDate(timestamp: number, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

function emptyLineItem(): RfqFormValues["lineItems"][number] {
  return {
    productId: "",
    descriptionAr: "",
    descriptionEn: "",
    quantity: 1,
    unit: "unit"
  };
}

export function ClientRfqsPage() {
  const { t, i18n } = useTranslation(["common", "rfq"]);
  const navItems = useClientNav();
  const { user } = useAuth();
  const cart = useRfqCart();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip";
  const rfqs = useQuery(api.rfqs.listRfqsForActor, queryArgs);
  const visibleProducts = useQuery(api.catalog.listVisibleProducts, queryArgs);
  const createRfq = useMutation(api.rfqs.createRfq);
  const submitRfq = useMutation(api.rfqs.submitRfq);
  const [searchValue, setSearchValue] = useState("");
  const [submitMessage, setSubmitMessage] = useState<SubmitMessage | null>(null);
  const [pendingSubmitId, setPendingSubmitId] = useState<Id<"rfqs"> | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvMessage, setCsvMessage] = useState<{ tone: "success" | "error"; text: string; errors?: CsvParseError[] } | null>(null);

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<RfqFormValues>({
    resolver: zodResolver(rfqFormSchema),
    defaultValues: {
      isNonCatalog: false,
      requiredDeliveryDate: "",
      notes: "",
      lineItems: [emptyLineItem()]
    }
  });

  const { append, fields, remove } = useFieldArray({ control, name: "lineItems" });
  const isNonCatalog = useWatch({ control, name: "isNonCatalog" });

  useEffect(() => {
    if (cart.items.length === 0) {
      return;
    }
    const allCustom = cart.items.every((item) => !item.productId);
    reset({
      isNonCatalog: allCustom,
      requiredDeliveryDate: "",
      notes: "",
      lineItems: cart.items.map((item) => ({
        productId: item.productId ?? "",
        descriptionAr: item.descriptionAr ?? item.specificationsAr ?? "",
        descriptionEn: item.descriptionEn ?? item.specificationsEn ?? "",
        quantity: item.quantity,
        unit: item.unit
      }))
    });
  }, [cart.items, reset]);

  const normalizedSearch = searchValue.trim().toLowerCase();
  const rfqRows = useMemo(() => {
    const source = rfqs ?? [];
    if (!normalizedSearch) {
      return source;
    }
    return source.filter((rfq) => [rfq._id, rfq.status, rfq.notes ?? ""].some((value) => value?.toString().toLowerCase().includes(normalizedSearch)));
  }, [rfqs, normalizedSearch]);

  const totalRfqs = rfqs?.length ?? 0;
  const draftCount = (rfqs ?? []).filter((rfq) => rfq.status === "draft").length;
  const submittedCount = (rfqs ?? []).filter((rfq) => ["submitted", "matching", "assigned", "quoting", "adminReview"].includes(rfq.status)).length;
  const releasedCount = (rfqs ?? []).filter((rfq) => ["released", "selected", "poGenerated"].includes(rfq.status)).length;

  const handleCreate = handleSubmit(async (values, event) => {
    setSubmitMessage(null);

    if (!isBetterAuthConfigured || !user) {
      setSubmitMessage({
        tone: "error",
        text: localize({ en: "Connect to Convex auth before saving RFQs.", ar: "اربط مصادقة Convex قبل حفظ طلبات التسعير." }, language)
      });
      return;
    }

    const submitter = (event?.nativeEvent && (event.nativeEvent as SubmitEvent).submitter) as HTMLButtonElement | null;
    const action = submitter?.dataset.action ?? "draft";

    try {
      const rfqId = await createRfq({
        actorUserId: user.id as Id<"users">,
        isNonCatalog: values.isNonCatalog,
        requiredDeliveryDate: values.requiredDeliveryDate || undefined,
        notes: values.notes || undefined,
        lineItems: values.lineItems.map((item) => ({
          productId: item.productId ? (item.productId as Id<"products">) : undefined,
          descriptionAr: item.descriptionAr || undefined,
          descriptionEn: item.descriptionEn || undefined,
          quantity: item.quantity,
          unit: item.unit
        }))
      });

      if (action === "submit") {
        await submitRfq({ rfqId, actorUserId: user.id as Id<"users"> });
        setSubmitMessage({ tone: "success", text: localize({ en: "RFQ submitted to MWRD.", ar: "تم إرسال طلب التسعير إلى مورد." }, language) });
      } else {
        setSubmitMessage({ tone: "success", text: localize({ en: "RFQ saved as draft.", ar: "تم حفظ طلب التسعير كمسودة." }, language) });
      }

      cart.clear();
      reset({
        isNonCatalog: values.isNonCatalog,
        requiredDeliveryDate: "",
        notes: "",
        lineItems: [emptyLineItem()]
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setSubmitMessage({
        tone: "error",
        text: message || localize({ en: "Could not save the RFQ.", ar: "تعذر حفظ طلب التسعير." }, language)
      });
    }
  });

  async function handleCsvImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setCsvMessage(null);
    try {
      const text = await file.text();
      const products = visibleProducts ?? [];
      const { rows, errors } = parseRfqCsv(text, products);
      if (rows.length === 0) {
        setCsvMessage({
          tone: "error",
          text: localize({ en: "No valid rows found in the CSV.", ar: "لم يتم العثور على صفوف صالحة في الملف." }, language),
          errors
        });
        return;
      }
      cart.replaceAll(
        rows.map((row) => ({
          productId: row.productId,
          sku: row.sku,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          descriptionAr: row.descriptionAr,
          descriptionEn: row.descriptionEn,
          quantity: row.quantity,
          unit: row.unit
        }))
      );
      setCsvMessage({
        tone: "success",
        text: localize(
          {
            en: `Imported ${rows.length} row(s)${errors.length > 0 ? `, skipped ${errors.length}` : ""}.`,
            ar: `تم استيراد ${rows.length} صفًا${errors.length > 0 ? `، تم تخطي ${errors.length}` : ""}.`
          },
          language
        ),
        errors
      });
    } catch {
      setCsvMessage({ tone: "error", text: localize({ en: "Could not read the CSV file.", ar: "تعذر قراءة ملف CSV." }, language) });
    } finally {
      if (csvInputRef.current) {
        csvInputRef.current.value = "";
      }
    }
  }

  function csvErrorLabel(reason: CsvParseError["reason"]) {
    switch (reason) {
      case "missing_quantity":
        return localize({ en: "missing quantity", ar: "كمية مفقودة" }, language);
      case "invalid_quantity":
        return localize({ en: "invalid quantity", ar: "كمية غير صالحة" }, language);
      case "missing_item":
        return localize({ en: "missing item details", ar: "تفاصيل البند مفقودة" }, language);
      case "unknown_sku":
        return localize({ en: "unknown SKU", ar: "رمز SKU غير معروف" }, language);
      default:
        return reason;
    }
  }

  async function handleSubmitDraft(rfqId: Id<"rfqs">) {
    if (!isBetterAuthConfigured || !user) {
      return;
    }
    setPendingSubmitId(rfqId);
    setSubmitMessage(null);
    try {
      await submitRfq({ rfqId, actorUserId: user.id as Id<"users"> });
      setSubmitMessage({ tone: "success", text: localize({ en: "RFQ submitted to MWRD.", ar: "تم إرسال طلب التسعير إلى مورد." }, language) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setSubmitMessage({
        tone: "error",
        text: message || localize({ en: "Could not submit the RFQ.", ar: "تعذر إرسال طلب التسعير." }, language)
      });
    } finally {
      setPendingSubmitId(null);
    }
  }

  return (
    <PortalShell
      title={t("rfq:pages.rfqs_title")}
      description={t("rfq:pages.rfqs_description")}
      navItems={navItems}
      primaryActionLabel={t("actions.new_rfq", { ns: "common" })}
      primaryActionIcon={<Plus className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Total RFQs", ar: "إجمالي الطلبات" }, language), value: String(totalRfqs), detail: localize({ en: "All statuses", ar: "كل الحالات" }, language) },
          { label: localize({ en: "Draft", ar: "مسودات" }, language), value: String(draftCount), detail: localize({ en: "Not yet submitted", ar: "لم ترسل بعد" }, language) },
          { label: localize({ en: "In review", ar: "قيد المراجعة" }, language), value: String(submittedCount), detail: localize({ en: "Submitted to MWRD", ar: "أرسلت إلى مورد" }, language), trendTone: "positive" },
          { label: localize({ en: "Released", ar: "معروضة" }, language), value: String(releasedCount), detail: localize({ en: "Quotes released or selected", ar: "عروض مصدرة أو مختارة" }, language), trendTone: "positive" }
        ]}
      />

      <DashboardToolbar
        searchPlaceholder={localize({ en: "Search RFQs...", ar: "ابحث في طلبات التسعير..." }, language)}
        searchValue={searchValue}
        onSearchChange={(event) => setSearchValue(event.target.value)}
      />

      <DashboardCard
        title={localize({ en: "Bulk import (CSV)", ar: "استيراد جماعي (CSV)" }, language)}
        description={localize(
          {
            en: "Columns: sku, quantity, unit, description_ar, description_en. SKUs must match the visible catalog; rows without an SKU need a description.",
            ar: "الأعمدة: sku, quantity, unit, description_ar, description_en. يجب أن تطابق رموز SKU الكتالوج الظاهر؛ الصفوف بدون SKU تحتاج إلى وصف."
          },
          language
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={csvInputRef} className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => void handleCsvImport(event)} />
            <Button type="button" variant="outline" onClick={() => csvInputRef.current?.click()}>
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              {localize({ en: "Choose CSV file", ar: "اختر ملف CSV" }, language)}
            </Button>
            <span className="text-xs text-muted-foreground">
              {localize({ en: "Imported rows replace the current cart and prefill the form below.", ar: "الصفوف المستوردة تستبدل السلة الحالية وتعبئ النموذج أدناه." }, language)}
            </span>
          </div>
          {csvMessage ? (
            <div className={messageClassName(csvMessage.tone)}>
              <p>{csvMessage.text}</p>
              {csvMessage.errors && csvMessage.errors.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-xs font-medium">
                  {csvMessage.errors.slice(0, 5).map((error) => (
                    <li key={`${error.rowNumber}-${error.reason}`}>
                      {localize({ en: "Row", ar: "الصف" }, language)} {error.rowNumber}: {csvErrorLabel(error.reason)}
                    </li>
                  ))}
                  {csvMessage.errors.length > 5 ? (
                    <li>
                      {localize({ en: `+ ${csvMessage.errors.length - 5} more`, ar: `+ ${csvMessage.errors.length - 5} أخرى` }, language)}
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </DashboardCard>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <DashboardCard title={t("rfq:pages.my_rfqs")} description={t("rfq:pages.my_rfqs_description")}>
          <DataTable
            rows={rfqRows}
            emptyLabel={rfqs === undefined ? localize({ en: "Loading RFQs...", ar: "جار تحميل الطلبات..." }, language) : localize({ en: "No RFQs yet.", ar: "لا توجد طلبات بعد." }, language)}
            getRowKey={(rfq) => rfq._id}
            columns={[
              {
                header: "ID",
                cell: (rfq) => (
                  <Link to={`/client/rfqs/${rfq._id}`} className="font-semibold text-primary hover:underline">
                    {rfq._id.slice(-6).toUpperCase()}
                  </Link>
                )
              },
              { header: localize({ en: "Items", ar: "البنود" }, language), cell: (rfq) => <span className="text-muted-foreground">{`${rfq.lineItemCount} × ${rfq.totalQuantity}`}</span> },
              {
                header: localize({ en: "Status", ar: "الحالة" }, language),
                cell: (rfq) => <StatusBadge tone={rfq.status === "draft" ? "neutral" : rfq.status === "expired" || rfq.status === "cancelled" ? "danger" : "info"}>{t(`rfq:status.${rfq.status}` as const)}</StatusBadge>
              },
              {
                header: localize({ en: "Created", ar: "تاريخ الإنشاء" }, language),
                cell: (rfq) => (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="size-4" aria-hidden="true" />
                    {formatDate(rfq.createdAt, language)}
                  </span>
                )
              },
              {
                header: localize({ en: "Action", ar: "الإجراء" }, language),
                className: "text-end",
                cell: (rfq) => (
                  <div className="inline-flex items-center justify-end gap-2">
                    {rfq.status === "draft" ? (
                      <Button type="button" size="sm" variant="outline" disabled={pendingSubmitId === rfq._id} onClick={() => void handleSubmitDraft(rfq._id)}>
                        {pendingSubmitId === rfq._id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                        {t("rfq:form.submit")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title={localize({ en: "Repeat as new RFQ", ar: "تكرار كطلب جديد" }, language)}
                      onClick={() => {
                        cart.replaceAll(
                          rfq.lineItems.map((item) => ({
                            productId: item.product?._id,
                            sku: item.product?.sku,
                            nameAr: item.product?.nameAr,
                            nameEn: item.product?.nameEn,
                            descriptionAr: item.descriptionAr,
                            descriptionEn: item.descriptionEn,
                            quantity: item.quantity,
                            unit: item.unit
                          }))
                        );
                      }}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                      {localize({ en: "Repeat", ar: "تكرار" }, language)}
                    </Button>
                  </div>
                )
              }
            ]}
          />
        </DashboardCard>

        <DashboardCard title={t("rfq:pages.create_rfq")} description={t("rfq:pages.create_rfq_description")}>
          <form className="flex flex-col gap-4" onSubmit={handleCreate}>
            <label className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/45 p-3 text-sm font-semibold">
              <input className="mt-1 size-4 rounded border-input accent-primary" type="checkbox" {...register("isNonCatalog")} />
              <span className="flex flex-col gap-1">
                <span>{t("rfq:form.is_non_catalog")}</span>
                <span className="text-xs font-medium text-muted-foreground">
                  {localize({ en: "Use when items are not in the controlled catalog.", ar: "استخدم عندما لا تكون البنود في الكتالوج المضبوط." }, language)}
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-3">
              {fields.map((field, index) => {
                const lineErrors = errors.lineItems?.[index];
                return (
                  <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">
                        {localize({ en: "Line item", ar: "بند" }, language)} {index + 1}
                      </span>
                      {fields.length > 1 ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => remove(index)}>
                          <Trash2 className="size-4" aria-hidden="true" />
                          {t("rfq:form.remove_item")}
                        </Button>
                      ) : null}
                    </div>

                    {!isNonCatalog ? (
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        {localize({ en: "Catalog product", ar: "منتج من الكتالوج" }, language)}
                        <select className={cn(selectClassName)} disabled={!visibleProducts || visibleProducts.length === 0} {...register(`lineItems.${index}.productId` as const)}>
                          <option value="">{localize({ en: "Select a catalog product", ar: "اختر منتجاً من الكتالوج" }, language)}</option>
                          {(visibleProducts ?? []).map((product) => (
                            <option key={product._id} value={product._id}>
                              {product.sku} — {localizePair(product.nameAr, product.nameEn, language)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        {localize({ en: "Arabic description", ar: "الوصف العربي" }, language)}
                        <textarea className={cn(textareaClassName)} placeholder={t("rfq:form.item_placeholder")} {...register(`lineItems.${index}.descriptionAr` as const)} />
                      </label>
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        {localize({ en: "English description", ar: "الوصف الإنجليزي" }, language)}
                        <textarea className={cn(textareaClassName)} placeholder={t("rfq:form.item_placeholder")} {...register(`lineItems.${index}.descriptionEn` as const)} />
                      </label>
                    </div>
                    {lineErrors?.descriptionEn?.message === "needsItem" ? (
                      <p className="text-xs font-semibold text-destructive">
                        {localize({ en: "Pick a catalog product or add a description.", ar: "اختر منتجاً من الكتالوج أو أضف وصفاً." }, language)}
                      </p>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        {t("rfq:form.quantity")}
                        <Input type="number" min="1" step="1" aria-invalid={Boolean(lineErrors?.quantity)} {...register(`lineItems.${index}.quantity` as const, { valueAsNumber: true })} />
                      </label>
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        {t("rfq:form.unit")}
                        <Input placeholder={t("rfq:form.unit_placeholder")} aria-invalid={Boolean(lineErrors?.unit)} {...register(`lineItems.${index}.unit` as const)} />
                      </label>
                    </div>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => append(emptyLineItem())}>
                <Plus className="size-4" aria-hidden="true" />
                {t("rfq:form.add_line")}
              </Button>
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("rfq:form.delivery_date")}
              <Input type="date" {...register("requiredDeliveryDate")} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("rfq:form.notes")}
              <textarea className={cn(textareaClassName)} placeholder={t("rfq:form.notes_placeholder")} {...register("notes")} />
            </label>

            <div className="rounded-lg bg-muted/65 p-3 text-sm text-muted-foreground">
              {localize({ en: "Supplier identity remains hidden until MWRD releases eligible quotes.", ar: "تبقى هوية المورد مخفية حتى تصدر مورد العروض المؤهلة." }, language)}
            </div>

            {submitMessage ? <p className={messageClassName(submitMessage.tone)}>{submitMessage.text}</p> : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" data-action="draft" variant="outline" disabled={isSubmitting || !isBetterAuthConfigured} className="flex-1">
                {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {t("rfq:form.save_draft")}
              </Button>
              <Button type="submit" data-action="submit" disabled={isSubmitting || !isBetterAuthConfigured} className="flex-1">
                {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                {t("rfq:form.submit")}
              </Button>
            </div>
          </form>
        </DashboardCard>
      </section>
    </PortalShell>
  );
}
