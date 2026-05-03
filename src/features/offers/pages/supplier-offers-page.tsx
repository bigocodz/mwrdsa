import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Loader2, PackagePlus, PackageSearch, Send, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useSupplierNav } from "@/features/supplier/hooks/use-supplier-nav";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type SubmitMessage = { tone: "success" | "error"; text: string };

const selectClassName = "flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const textareaClassName = "min-h-20 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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

function statusTone(status: string): "info" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "info";
  if (status === "pendingApproval" || status === "pending") return "warning";
  if (status === "rejected" || status === "suspended") return "danger";
  return "neutral";
}

function statusLabel(status: string, language: string) {
  const labels: Record<string, { en: string; ar: string }> = {
    draft: { en: "Draft", ar: "مسودة" },
    pendingApproval: { en: "Pending approval", ar: "بانتظار الموافقة" },
    pending: { en: "Pending", ar: "بانتظار المراجعة" },
    approved: { en: "Approved", ar: "معتمد" },
    rejected: { en: "Rejected", ar: "مرفوض" },
    suspended: { en: "Suspended", ar: "معلق" }
  };
  return localize(labels[status] ?? { en: status, ar: status }, language);
}

function messageClassName(tone: SubmitMessage["tone"]) {
  return cn("rounded-lg border px-3 py-2 text-sm font-semibold", tone === "success" ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive");
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

export function SupplierOffersPage() {
  const { t, i18n } = useTranslation("common");
  const language = i18n.language;
  const navItems = useSupplierNav();
  const { user } = useAuth();
  const queryArgs = useMemo(() => (isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip"), [user]);
  const categories = useQuery(api.offers.listActiveCategoriesForSupplier, queryArgs);
  const {
    results: products,
    status: productStatus,
    loadMore: loadMoreProducts
  } = usePaginatedQuery(api.offers.listProductsForSupplierOffersPaginated, queryArgs, { initialNumItems: 40 });
  const {
    results: offers,
    status: offerStatus,
    loadMore: loadMoreOffers
  } = usePaginatedQuery(api.offers.listSupplierOffersForActorPaginated, queryArgs, { initialNumItems: 30 });
  const {
    results: productRequests,
    status: requestStatus,
    loadMore: loadMoreRequests
  } = usePaginatedQuery(api.offers.listProductAdditionRequestsForSupplierPaginated, queryArgs, { initialNumItems: 20 });
  const upsertSupplierOffer = useMutation(api.offers.upsertSupplierOffer);
  const submitProductAdditionRequest = useMutation(api.offers.submitProductAdditionRequest);
  const [searchValue, setSearchValue] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<Id<"products"> | null>(null);
  const [offerForm, setOfferForm] = useState({
    supplierSku: "",
    packType: "each",
    minOrderQuantity: "1",
    unitCost: "",
    leadTimeDays: "7",
    availableQuantity: "",
    autoQuoteEnabled: true,
    reviewWindowMinutes: "30"
  });
  const [requestForm, setRequestForm] = useState({
    categoryId: "",
    sku: "",
    nameAr: "",
    nameEn: "",
    specificationsAr: "",
    specificationsEn: "",
    packType: "each"
  });
  const [offerMessage, setOfferMessage] = useState<SubmitMessage | null>(null);
  const [requestMessage, setRequestMessage] = useState<SubmitMessage | null>(null);
  const [isSavingOffer, setIsSavingOffer] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const isLoadingProducts = productStatus === "LoadingFirstPage";
  const canLoadMoreProducts = productStatus === "CanLoadMore";
  const isLoadingMoreProducts = productStatus === "LoadingMore";
  const canLoadMoreOffers = offerStatus === "CanLoadMore";
  const isLoadingMoreOffers = offerStatus === "LoadingMore";
  const canLoadMoreRequests = requestStatus === "CanLoadMore";
  const isLoadingMoreRequests = requestStatus === "LoadingMore";

  const selectedProduct = useMemo(() => products.find((product) => product._id === selectedProductId) ?? null, [products, selectedProductId]);
  const productRows = useMemo(() => {
    const search = searchValue.trim().toLowerCase();
    if (!search) return products;
    return products.filter((product) =>
      [product.sku, product.nameAr, product.nameEn, product.specificationsAr, product.specificationsEn, product.category?.nameAr, product.category?.nameEn].some((value) => value?.toLowerCase().includes(search))
    );
  }, [products, searchValue]);

  const totals = useMemo(() => {
    return {
      products: products.length,
      offers: offers.length,
      pending: offers.filter((offer) => offer.status === "pendingApproval").length,
      autoQuote: offers.filter((offer) => offer.autoQuoteEnabled && offer.status === "approved").length
    };
  }, [offers, products.length]);

  function handleSelectProduct(product: (typeof products)[number]) {
    setSelectedProductId(product._id);
    const existing = product.existingOffer;
    setOfferForm({
      supplierSku: "",
      packType: existing?.packType ?? "each",
      minOrderQuantity: String(existing?.minOrderQuantity ?? 1),
      unitCost: existing?.unitCost ? String(existing.unitCost) : "",
      leadTimeDays: String(existing?.leadTimeDays ?? 7),
      availableQuantity: existing?.availableQuantity === undefined ? "" : String(existing.availableQuantity),
      autoQuoteEnabled: existing?.autoQuoteEnabled ?? true,
      reviewWindowMinutes: String(existing?.reviewWindowMinutes ?? 30)
    });
    setOfferMessage(null);
  }

  async function handleSaveOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isBetterAuthConfigured || !user || !selectedProduct) return;
    setIsSavingOffer(true);
    setOfferMessage(null);
    try {
      await upsertSupplierOffer({
        actorUserId: user.id as Id<"users">,
        productId: selectedProduct._id,
        supplierSku: offerForm.supplierSku.trim() || undefined,
        packType: offerForm.packType.trim(),
        minOrderQuantity: Number(offerForm.minOrderQuantity),
        unitCost: Number(offerForm.unitCost),
        leadTimeDays: Number(offerForm.leadTimeDays),
        availableQuantity: optionalNumber(offerForm.availableQuantity),
        autoQuoteEnabled: offerForm.autoQuoteEnabled,
        reviewWindowMinutes: Number(offerForm.reviewWindowMinutes)
      });
      setOfferMessage({ tone: "success", text: localize({ en: "Offer submitted for admin approval.", ar: "تم إرسال العرض لموافقة الإدارة." }, language) });
    } catch (error) {
      setOfferMessage({ tone: "error", text: error instanceof Error ? error.message : localize({ en: "Could not submit offer.", ar: "تعذر إرسال العرض." }, language) });
    } finally {
      setIsSavingOffer(false);
    }
  }

  async function handleSubmitProductRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isBetterAuthConfigured || !user) return;
    setIsSubmittingRequest(true);
    setRequestMessage(null);
    try {
      await submitProductAdditionRequest({
        actorUserId: user.id as Id<"users">,
        categoryId: requestForm.categoryId ? (requestForm.categoryId as Id<"categories">) : undefined,
        sku: requestForm.sku.trim() || undefined,
        nameAr: requestForm.nameAr.trim(),
        nameEn: requestForm.nameEn.trim(),
        specificationsAr: requestForm.specificationsAr.trim() || undefined,
        specificationsEn: requestForm.specificationsEn.trim() || undefined,
        packType: requestForm.packType.trim()
      });
      setRequestForm({ categoryId: requestForm.categoryId, sku: "", nameAr: "", nameEn: "", specificationsAr: "", specificationsEn: "", packType: "each" });
      setRequestMessage({ tone: "success", text: localize({ en: "Product request submitted.", ar: "تم إرسال طلب المنتج." }, language) });
    } catch (error) {
      setRequestMessage({ tone: "error", text: error instanceof Error ? error.message : localize({ en: "Could not submit product request.", ar: "تعذر إرسال طلب المنتج." }, language) });
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  return (
    <PortalShell title={t("navigation.offers")} description={localize({ en: "Manage supplier rate cards against the MWRD master catalog", ar: "إدارة عروض الموردين على كتالوج مورد الرئيسي" }, language)} navItems={navItems}>
      <StatStrip
        stats={[
          { label: localize({ en: "Loaded products", ar: "منتجات محملة" }, language), value: String(totals.products), detail: localize({ en: "Master catalog", ar: "الكتالوج الرئيسي" }, language) },
          { label: localize({ en: "Supplier offers", ar: "عروض المورد" }, language), value: String(totals.offers), detail: localize({ en: "Own rate cards", ar: "قوائم أسعار خاصة" }, language), trendTone: "positive" },
          { label: localize({ en: "Pending approval", ar: "بانتظار الموافقة" }, language), value: String(totals.pending), detail: localize({ en: "Admin review", ar: "مراجعة الإدارة" }, language), trendTone: "neutral" },
          { label: localize({ en: "Auto-quote ready", ar: "جاهزة للتسعير الآلي" }, language), value: String(totals.autoQuote), detail: localize({ en: "Approved toggles", ar: "عروض معتمدة ومفعلة" }, language), trendTone: "positive" }
        ]}
      />

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="flex flex-col gap-5">
          <DashboardToolbar
            searchPlaceholder={localize({ en: "Search master catalog...", ar: "ابحث في الكتالوج الرئيسي..." }, language)}
            searchValue={searchValue}
            onSearchChange={(event) => setSearchValue(event.target.value)}
          />

          <DashboardCard title={localize({ en: "Master catalog", ar: "الكتالوج الرئيسي" }, language)} description={localize({ en: "Attach your private cost, MOQ, lead time, and auto-quote setting to approved MWRD products.", ar: "أضف التكلفة الخاصة والحد الأدنى وزمن التوريد وإعداد التسعير الآلي لمنتجات مورد المعتمدة." }, language)}>
            <DataTable
              rows={productRows}
              emptyLabel={isLoadingProducts ? localize({ en: "Loading products...", ar: "جار تحميل المنتجات..." }, language) : localize({ en: "No products found.", ar: "لا توجد منتجات." }, language)}
              getRowKey={(product) => product._id}
              columns={[
                { header: "SKU", cell: (product) => <span className="font-semibold">{product.sku}</span> },
                { header: localize({ en: "Product", ar: "المنتج" }, language), cell: (product) => <span>{localizePair(product.nameAr, product.nameEn, language)}</span> },
                { header: localize({ en: "Category", ar: "الفئة" }, language), cell: (product) => <span className="text-muted-foreground">{localizePair(product.category?.nameAr, product.category?.nameEn, language)}</span> },
                {
                  header: localize({ en: "Offer", ar: "العرض" }, language),
                  cell: (product) => product.existingOffer ? <StatusBadge tone={statusTone(product.existingOffer.status)}>{statusLabel(product.existingOffer.status, language)}</StatusBadge> : <Badge variant="outline">{localize({ en: "Not selling", ar: "غير معروض" }, language)}</Badge>
                },
                {
                  header: localize({ en: "Action", ar: "الإجراء" }, language),
                  className: "text-end",
                  cell: (product) => (
                    <Button type="button" size="sm" variant={selectedProductId === product._id ? "default" : "outline"} onClick={() => handleSelectProduct(product)}>
                      <PackagePlus className="size-4" aria-hidden="true" />
                      {product.existingOffer ? localize({ en: "Edit offer", ar: "تعديل العرض" }, language) : localize({ en: "Sell this", ar: "بيع هذا المنتج" }, language)}
                    </Button>
                  )
                }
              ]}
            />
            {canLoadMoreProducts || isLoadingMoreProducts ? (
              <div className="mt-4 flex justify-center">
                <Button type="button" variant="outline" disabled={isLoadingMoreProducts} onClick={() => loadMoreProducts(40)}>
                  {isLoadingMoreProducts ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PackageSearch className="size-4" aria-hidden="true" />}
                  {localize({ en: "Load more products", ar: "تحميل المزيد من المنتجات" }, language)}
                </Button>
              </div>
            ) : null}
          </DashboardCard>

          <DashboardCard title={localize({ en: "My submitted offers", ar: "عروضي المقدمة" }, language)}>
            <DataTable
              rows={offers}
              emptyLabel={offerStatus === "LoadingFirstPage" ? localize({ en: "Loading offers...", ar: "جار تحميل العروض..." }, language) : localize({ en: "No supplier offers yet.", ar: "لا توجد عروض مورد بعد." }, language)}
              getRowKey={(offer) => offer._id}
              columns={[
                { header: "SKU", cell: (offer) => <span className="font-semibold">{offer.product?.sku ?? "—"}</span> },
                { header: localize({ en: "Product", ar: "المنتج" }, language), cell: (offer) => <span>{localizePair(offer.product?.nameAr, offer.product?.nameEn, language)}</span> },
                { header: localize({ en: "Unit cost", ar: "تكلفة الوحدة" }, language), cell: (offer) => <span className="font-semibold">{formatCurrency(offer.unitCost, language)}</span> },
                { header: localize({ en: "MOQ", ar: "الحد الأدنى" }, language), cell: (offer) => <span className="text-muted-foreground">{offer.minOrderQuantity}</span> },
                { header: localize({ en: "Lead time", ar: "زمن التوريد" }, language), cell: (offer) => <span>{`${offer.leadTimeDays} ${localize({ en: "d", ar: "يوم" }, language)}`}</span> },
                { header: localize({ en: "Status", ar: "الحالة" }, language), cell: (offer) => <StatusBadge tone={statusTone(offer.status)}>{statusLabel(offer.status, language)}</StatusBadge> }
              ]}
            />
            {canLoadMoreOffers || isLoadingMoreOffers ? (
              <div className="mt-4 flex justify-center">
                <Button type="button" variant="outline" disabled={isLoadingMoreOffers} onClick={() => loadMoreOffers(30)}>
                  {isLoadingMoreOffers ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <SlidersHorizontal className="size-4" aria-hidden="true" />}
                  {localize({ en: "Load more offers", ar: "تحميل المزيد من العروض" }, language)}
                </Button>
              </div>
            ) : null}
          </DashboardCard>
        </div>

        <div className="flex flex-col gap-5">
          <DashboardCard title={selectedProduct ? localizePair(selectedProduct.nameAr, selectedProduct.nameEn, language) : localize({ en: "Supplier offer", ar: "عرض المورد" }, language)} description={localize({ en: "Private supplier cost is visible to admin only and never shown in the client catalog.", ar: "تكلفة المورد الخاصة تظهر للإدارة فقط ولا تظهر في كتالوج العميل." }, language)}>
            {selectedProduct ? (
              <form className="flex flex-col gap-4" onSubmit={handleSaveOffer}>
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {localize({ en: "Supplier SKU", ar: "رمز المورد" }, language)}
                  <Input value={offerForm.supplierSku} placeholder="Optional" onChange={(event) => setOfferForm((current) => ({ ...current, supplierSku: event.target.value }))} />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-semibold">
                    {localize({ en: "Unit cost", ar: "تكلفة الوحدة" }, language)}
                    <Input required inputMode="decimal" value={offerForm.unitCost} onChange={(event) => setOfferForm((current) => ({ ...current, unitCost: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold">
                    {localize({ en: "MOQ", ar: "الحد الأدنى" }, language)}
                    <Input required inputMode="numeric" value={offerForm.minOrderQuantity} onChange={(event) => setOfferForm((current) => ({ ...current, minOrderQuantity: event.target.value }))} />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-semibold">
                    {localize({ en: "Lead time days", ar: "أيام التوريد" }, language)}
                    <Input required inputMode="numeric" value={offerForm.leadTimeDays} onChange={(event) => setOfferForm((current) => ({ ...current, leadTimeDays: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold">
                    {localize({ en: "Available quantity", ar: "الكمية المتاحة" }, language)}
                    <Input inputMode="numeric" value={offerForm.availableQuantity} onChange={(event) => setOfferForm((current) => ({ ...current, availableQuantity: event.target.value }))} />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-semibold">
                    {localize({ en: "Pack type", ar: "نوع العبوة" }, language)}
                    <Input required value={offerForm.packType} onChange={(event) => setOfferForm((current) => ({ ...current, packType: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold">
                    {localize({ en: "Review window minutes", ar: "نافذة المراجعة بالدقائق" }, language)}
                    <Input required inputMode="numeric" value={offerForm.reviewWindowMinutes} onChange={(event) => setOfferForm((current) => ({ ...current, reviewWindowMinutes: event.target.value }))} />
                  </label>
                </div>
                <label className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/45 p-3 text-sm font-semibold">
                  <input className="mt-1 size-4 rounded border-input accent-primary" type="checkbox" checked={offerForm.autoQuoteEnabled} onChange={(event) => setOfferForm((current) => ({ ...current, autoQuoteEnabled: event.target.checked }))} />
                  <span className="flex flex-col gap-1">
                    <span>{localize({ en: "Enable auto-quote when approved", ar: "تفعيل التسعير الآلي عند الاعتماد" }, language)}</span>
                    <span className="text-xs font-medium text-muted-foreground">{localize({ en: "Future auto-quote engine can use this offer after admin approval.", ar: "سيستخدم محرك التسعير الآلي هذا العرض بعد موافقة الإدارة." }, language)}</span>
                  </span>
                </label>
                {offerMessage ? <p className={messageClassName(offerMessage.tone)}>{offerMessage.text}</p> : null}
                <Button type="submit" disabled={isSavingOffer || !isBetterAuthConfigured}>
                  {isSavingOffer ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                  {localize({ en: "Submit for approval", ar: "إرسال للموافقة" }, language)}
                </Button>
              </form>
            ) : (
              <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-border/80 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                {localize({ en: "Choose a master catalog product to create or edit your supplier offer.", ar: "اختر منتجاً من الكتالوج الرئيسي لإنشاء أو تعديل عرض المورد." }, language)}
              </div>
            )}
          </DashboardCard>

          <DashboardCard title={localize({ en: "Request product addition", ar: "طلب إضافة منتج" }, language)} description={localize({ en: "Ask admin to add products missing from the master catalog.", ar: "اطلب من الإدارة إضافة منتجات غير موجودة في الكتالوج الرئيسي." }, language)}>
            <form className="flex flex-col gap-4" onSubmit={handleSubmitProductRequest}>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                {localize({ en: "Category", ar: "الفئة" }, language)}
                <select className={selectClassName} value={requestForm.categoryId} onChange={(event) => setRequestForm((current) => ({ ...current, categoryId: event.target.value }))}>
                  <option value="">{localize({ en: "Choose category", ar: "اختر الفئة" }, language)}</option>
                  {(categories ?? []).map((category) => (
                    <option key={category._id} value={category._id}>{localizePair(category.nameAr, category.nameEn, language)}</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {localize({ en: "Arabic name", ar: "الاسم العربي" }, language)}
                  <Input required value={requestForm.nameAr} onChange={(event) => setRequestForm((current) => ({ ...current, nameAr: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {localize({ en: "English name", ar: "الاسم الإنجليزي" }, language)}
                  <Input required value={requestForm.nameEn} onChange={(event) => setRequestForm((current) => ({ ...current, nameEn: event.target.value }))} />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  SKU
                  <Input value={requestForm.sku} onChange={(event) => setRequestForm((current) => ({ ...current, sku: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {localize({ en: "Pack type", ar: "نوع العبوة" }, language)}
                  <Input required value={requestForm.packType} onChange={(event) => setRequestForm((current) => ({ ...current, packType: event.target.value }))} />
                </label>
              </div>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                {localize({ en: "English specs", ar: "المواصفات الإنجليزية" }, language)}
                <textarea className={textareaClassName} value={requestForm.specificationsEn} onChange={(event) => setRequestForm((current) => ({ ...current, specificationsEn: event.target.value }))} />
              </label>
              {requestMessage ? <p className={messageClassName(requestMessage.tone)}>{requestMessage.text}</p> : null}
              <Button type="submit" disabled={isSubmittingRequest || !isBetterAuthConfigured}>
                {isSubmittingRequest ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PackagePlus className="size-4" aria-hidden="true" />}
                {localize({ en: "Submit product request", ar: "إرسال طلب المنتج" }, language)}
              </Button>
            </form>
          </DashboardCard>

          <DashboardCard title={localize({ en: "Product requests", ar: "طلبات المنتجات" }, language)}>
            <DataTable
              rows={productRequests}
              emptyLabel={requestStatus === "LoadingFirstPage" ? localize({ en: "Loading requests...", ar: "جار تحميل الطلبات..." }, language) : localize({ en: "No product requests yet.", ar: "لا توجد طلبات منتجات بعد." }, language)}
              getRowKey={(request) => request._id}
              columns={[
                { header: localize({ en: "Product", ar: "المنتج" }, language), cell: (request) => <span className="font-semibold">{localizePair(request.nameAr, request.nameEn, language)}</span> },
                { header: localize({ en: "Category", ar: "الفئة" }, language), cell: (request) => <span className="text-muted-foreground">{localizePair(request.category?.nameAr, request.category?.nameEn, language) || "—"}</span> },
                { header: localize({ en: "Status", ar: "الحالة" }, language), cell: (request) => <StatusBadge tone={statusTone(request.status)}>{statusLabel(request.status, language)}</StatusBadge> }
              ]}
            />
            {canLoadMoreRequests || isLoadingMoreRequests ? (
              <div className="mt-4 flex justify-center">
                <Button type="button" variant="outline" disabled={isLoadingMoreRequests} onClick={() => loadMoreRequests(20)}>
                  {isLoadingMoreRequests ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PackageSearch className="size-4" aria-hidden="true" />}
                  {localize({ en: "Load more requests", ar: "تحميل المزيد من الطلبات" }, language)}
                </Button>
              </div>
            ) : null}
          </DashboardCard>
        </div>
      </section>
    </PortalShell>
  );
}
