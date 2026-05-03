import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { CalendarDays, Clock, Copy, FileSpreadsheet, Loader2, PackageSearch, Plus, Save, Send, Trash2 } from "lucide-react";
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
    department: z.string().trim().max(120).optional(),
    branch: z.string().trim().max(120).optional(),
    costCenter: z.string().trim().max(120).optional(),
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
  const queryArgs = useMemo(() => (isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip"), [user]);
  const {
    results: rfqs,
    status: rfqStatus,
    loadMore: loadMoreRfqs
  } = usePaginatedQuery(api.rfqs.listRfqsForActorPaginated, queryArgs, { initialNumItems: 40 });
  const {
    results: visibleProducts,
    status: productStatus,
    loadMore: loadMoreProducts
  } = usePaginatedQuery(api.catalog.listVisibleProductsPaginated, queryArgs, { initialNumItems: 80 });
  const savedCarts = useQuery(api.rfqs.listSavedRfqCartsForActor, queryArgs);
  const createRfq = useMutation(api.rfqs.createRfq);
  const submitRfq = useMutation(api.rfqs.submitRfq);
  const saveSavedRfqCart = useMutation(api.rfqs.saveSavedRfqCartForActor);
  const deleteSavedRfqCart = useMutation(api.rfqs.deleteSavedRfqCartForActor);
  const [searchValue, setSearchValue] = useState("");
  const [submitMessage, setSubmitMessage] = useState<SubmitMessage | null>(null);
  const [savedCartMessage, setSavedCartMessage] = useState<SubmitMessage | null>(null);
  const [savedCartName, setSavedCartName] = useState("");
  const [isSavingCart, setIsSavingCart] = useState(false);
  const [pendingSubmitId, setPendingSubmitId] = useState<Id<"rfqs"> | null>(null);
  const [pendingSavedCartId, setPendingSavedCartId] = useState<Id<"savedRfqCarts"> | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextCartHydrationRef = useRef(false);
  const [csvMessage, setCsvMessage] = useState<{ tone: "success" | "error"; text: string; errors?: CsvParseError[] } | null>(null);
  const isLoadingRfqs = rfqStatus === "LoadingFirstPage";
  const canLoadMoreRfqs = rfqStatus === "CanLoadMore";
  const isLoadingMoreRfqs = rfqStatus === "LoadingMore";
  const canLoadMoreProducts = productStatus === "CanLoadMore";
  const isLoadingMoreProducts = productStatus === "LoadingMore";
  const isLoadingSavedCarts = savedCarts === undefined && isBetterAuthConfigured && Boolean(user);
  const savedCartRows = savedCarts ?? [];

  const {
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    reset
  } = useForm<RfqFormValues>({
    resolver: zodResolver(rfqFormSchema),
    defaultValues: {
      isNonCatalog: false,
      requiredDeliveryDate: "",
      department: "",
      branch: "",
      costCenter: "",
      notes: "",
      lineItems: [emptyLineItem()]
    }
  });

  const { append, fields, remove } = useFieldArray({ control, name: "lineItems" });
  const isNonCatalog = useWatch({ control, name: "isNonCatalog" });

  useEffect(() => {
    if (skipNextCartHydrationRef.current) {
      skipNextCartHydrationRef.current = false;
      return;
    }
    if (cart.items.length === 0) {
      return;
    }
    const allCustom = cart.items.every((item) => !item.productId);
    reset({
      isNonCatalog: allCustom,
      requiredDeliveryDate: "",
      department: "",
      branch: "",
      costCenter: "",
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

  const productLookup = useMemo(() => new Map(visibleProducts.map((product) => [product._id, product])), [visibleProducts]);
  const normalizedSearch = searchValue.trim().toLowerCase();
  const rfqRows = useMemo(() => {
    const source = rfqs ?? [];
    if (!normalizedSearch) {
      return source;
    }
    return source.filter((rfq) =>
      [rfq._id, rfq.status, rfq.department ?? "", rfq.branch ?? "", rfq.costCenter ?? "", rfq.notes ?? ""].some((value) =>
        value?.toString().toLowerCase().includes(normalizedSearch)
      )
    );
  }, [rfqs, normalizedSearch]);

  const totalRfqs = rfqs.length;
  const draftCount = rfqs.filter((rfq) => rfq.status === "draft").length;
  const submittedCount = rfqs.filter((rfq) => ["submitted", "matching", "assigned", "quoting", "adminReview"].includes(rfq.status)).length;
  const releasedCount = rfqs.filter((rfq) => ["released", "selected", "poGenerated"].includes(rfq.status)).length;

  function buildCurrentSavedCartItems(values: RfqFormValues) {
    return values.lineItems.map((item) => {
      const productId = item.productId ? (item.productId as Id<"products">) : undefined;
      const product = productId ? productLookup.get(productId) : undefined;
      return {
        productId,
        sku: product?.sku,
        nameAr: product?.nameAr,
        nameEn: product?.nameEn,
        specificationsAr: product?.specificationsAr,
        specificationsEn: product?.specificationsEn,
        descriptionAr: item.descriptionAr || undefined,
        descriptionEn: item.descriptionEn || undefined,
        quantity: item.quantity,
        unit: item.unit
      };
    });
  }

  async function handleSaveCurrentCart() {
    setSavedCartMessage(null);

    if (!isBetterAuthConfigured || !user) {
      setSavedCartMessage({
        tone: "error",
        text: localize({ en: "Connect to Convex auth before saving carts.", ar: "اربط مصادقة Convex قبل حفظ السلال." }, language)
      });
      return;
    }

    const parsed = rfqFormSchema.safeParse(getValues());
    if (!parsed.success) {
      setSavedCartMessage({
        tone: "error",
        text: localize({ en: "Add at least one complete line item before saving this cart.", ar: "أضف بنداً مكتملاً واحداً على الأقل قبل حفظ السلة." }, language)
      });
      return;
    }

    setIsSavingCart(true);
    try {
      await saveSavedRfqCart({
        actorUserId: user.id as Id<"users">,
        name: savedCartName || undefined,
        requiredDeliveryDate: parsed.data.requiredDeliveryDate || undefined,
        department: parsed.data.department || undefined,
        branch: parsed.data.branch || undefined,
        costCenter: parsed.data.costCenter || undefined,
        notes: parsed.data.notes || undefined,
        isNonCatalog: parsed.data.isNonCatalog,
        items: buildCurrentSavedCartItems(parsed.data)
      });
      setSavedCartName("");
      setSavedCartMessage({
        tone: "success",
        text: localize({ en: "RFQ cart saved for 7 days.", ar: "تم حفظ سلة طلب التسعير لمدة 7 أيام." }, language)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setSavedCartMessage({
        tone: "error",
        text: message || localize({ en: "Could not save this RFQ cart.", ar: "تعذر حفظ سلة طلب التسعير." }, language)
      });
    } finally {
      setIsSavingCart(false);
    }
  }

  function handleLoadSavedCart(savedCart: (typeof savedCartRows)[number]) {
    const lineItems = savedCart.items.map((item) => ({
      productId: item.productId ?? "",
      descriptionAr: item.descriptionAr ?? item.specificationsAr ?? "",
      descriptionEn: item.descriptionEn ?? item.specificationsEn ?? "",
      quantity: item.quantity,
      unit: item.unit
    }));

    skipNextCartHydrationRef.current = true;
    cart.replaceAll(
      savedCart.items.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        specificationsAr: item.specificationsAr,
        specificationsEn: item.specificationsEn,
        descriptionAr: item.descriptionAr,
        descriptionEn: item.descriptionEn,
        quantity: item.quantity,
        unit: item.unit
      }))
    );
    reset({
      isNonCatalog: savedCart.isNonCatalog,
      requiredDeliveryDate: savedCart.requiredDeliveryDate ?? "",
      department: savedCart.department ?? "",
      branch: savedCart.branch ?? "",
      costCenter: savedCart.costCenter ?? "",
      notes: savedCart.notes ?? "",
      lineItems: lineItems.length > 0 ? lineItems : [emptyLineItem()]
    });
    setSavedCartMessage({
      tone: "success",
      text: localize({ en: "Saved cart loaded into the RFQ form.", ar: "تم تحميل السلة المحفوظة في نموذج طلب التسعير." }, language)
    });
  }

  async function handleDeleteSavedCart(savedCartId: Id<"savedRfqCarts">) {
    if (!isBetterAuthConfigured || !user) {
      return;
    }
    setPendingSavedCartId(savedCartId);
    setSavedCartMessage(null);
    try {
      await deleteSavedRfqCart({ actorUserId: user.id as Id<"users">, savedCartId });
      setSavedCartMessage({
        tone: "success",
        text: localize({ en: "Saved cart deleted.", ar: "تم حذف السلة المحفوظة." }, language)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setSavedCartMessage({
        tone: "error",
        text: message || localize({ en: "Could not delete the saved cart.", ar: "تعذر حذف السلة المحفوظة." }, language)
      });
    } finally {
      setPendingSavedCartId(null);
    }
  }

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
        department: values.department || undefined,
        branch: values.branch || undefined,
        costCenter: values.costCenter || undefined,
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
        department: "",
        branch: "",
        costCenter: "",
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
      const { rows, errors } = parseRfqCsv(text, visibleProducts);
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

      <DashboardCard
        title={localize({ en: "Saved RFQ carts", ar: "سلال طلبات التسعير المحفوظة" }, language)}
        description={localize({ en: "Park reusable RFQ carts for 7 days before turning them into drafts or submissions.", ar: "احفظ سلال طلبات التسعير القابلة لإعادة الاستخدام لمدة 7 أيام قبل تحويلها إلى مسودات أو إرسالها." }, language)}
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              value={savedCartName}
              maxLength={80}
              placeholder={localize({ en: "Optional cart name", ar: "اسم اختياري للسلة" }, language)}
              onChange={(event) => setSavedCartName(event.target.value)}
            />
            <Button type="button" disabled={isSavingCart || !isBetterAuthConfigured} onClick={() => void handleSaveCurrentCart()}>
              {isSavingCart ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              {localize({ en: "Save current cart", ar: "حفظ السلة الحالية" }, language)}
            </Button>
          </div>

          {savedCartMessage ? <p className={messageClassName(savedCartMessage.tone)}>{savedCartMessage.text}</p> : null}

          <div className="grid gap-2">
            {isLoadingSavedCarts ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-sm font-medium text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {localize({ en: "Loading saved carts...", ar: "جار تحميل السلال المحفوظة..." }, language)}
              </div>
            ) : savedCartRows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-sm font-medium text-muted-foreground">
                {localize({ en: "No saved carts yet.", ar: "لا توجد سلال محفوظة بعد." }, language)}
              </p>
            ) : (
              savedCartRows.map((savedCart) => (
                <div key={savedCart._id} className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card px-3 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold">{savedCart.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
                      <span>
                        {savedCart.itemCount} {localize({ en: "item(s)", ar: "بند" }, language)} · {savedCart.totalQuantity} {localize({ en: "qty", ar: "كمية" }, language)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {localize({ en: "Expires", ar: "تنتهي" }, language)} {formatDate(savedCart.expiresAt, language)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => handleLoadSavedCart(savedCart)}>
                      <Copy className="size-4" aria-hidden="true" />
                      {localize({ en: "Load", ar: "تحميل" }, language)}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={pendingSavedCartId === savedCart._id} onClick={() => void handleDeleteSavedCart(savedCart._id)}>
                      {pendingSavedCartId === savedCart._id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                      {localize({ en: "Delete", ar: "حذف" }, language)}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DashboardCard>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <DashboardCard title={t("rfq:pages.my_rfqs")} description={t("rfq:pages.my_rfqs_description")}>
          <DataTable
            rows={rfqRows}
            emptyLabel={isLoadingRfqs ? localize({ en: "Loading RFQs...", ar: "جار تحميل الطلبات..." }, language) : localize({ en: "No RFQs yet.", ar: "لا توجد طلبات بعد." }, language)}
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
                header: localize({ en: "Department", ar: "القسم" }, language),
                cell: (rfq) => <span className="text-muted-foreground">{rfq.department ?? localize({ en: "Not specified", ar: "غير محدد" }, language)}</span>
              },
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
          {canLoadMoreRfqs || isLoadingMoreRfqs ? (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="outline" size="sm" disabled={isLoadingMoreRfqs} onClick={() => loadMoreRfqs(40)}>
                {isLoadingMoreRfqs ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CalendarDays className="size-4" aria-hidden="true" />}
                {localize({ en: "Load more RFQs", ar: "تحميل المزيد من الطلبات" }, language)}
              </Button>
            </div>
          ) : null}
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
                        <select className={cn(selectClassName)} disabled={visibleProducts.length === 0} {...register(`lineItems.${index}.productId` as const)}>
                          <option value="">{localize({ en: "Select a catalog product", ar: "اختر منتجاً من الكتالوج" }, language)}</option>
                          {visibleProducts.map((product) => (
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
              {canLoadMoreProducts || isLoadingMoreProducts ? (
                <Button type="button" variant="outline" size="sm" disabled={isLoadingMoreProducts} onClick={() => loadMoreProducts(80)}>
                  {isLoadingMoreProducts ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PackageSearch className="size-4" aria-hidden="true" />}
                  {localize({ en: "Load more catalog items", ar: "تحميل المزيد من بنود الكتالوج" }, language)}
                </Button>
              ) : null}
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("rfq:form.delivery_date")}
              <Input type="date" {...register("requiredDeliveryDate")} />
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {localize({ en: "Department", ar: "القسم" }, language)}
                <Input placeholder={localize({ en: "Facilities", ar: "المرافق" }, language)} {...register("department")} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {localize({ en: "Branch", ar: "الفرع" }, language)}
                <Input placeholder={localize({ en: "Riyadh HQ", ar: "فرع الرياض" }, language)} {...register("branch")} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {localize({ en: "Cost center", ar: "مركز التكلفة" }, language)}
                <Input placeholder={localize({ en: "CC-100", ar: "CC-100" }, language)} {...register("costCenter")} />
              </label>
            </div>
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
