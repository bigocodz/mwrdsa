import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Eye, EyeOff, FolderPlus, Loader2, PackagePlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DashboardCard, DashboardToolbar, DataTable, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const categoryFormSchema = z.object({
  nameAr: z.string().trim().min(2),
  nameEn: z.string().trim().min(2),
  parentCategoryId: z.string()
});

const productFormSchema = z.object({
  categoryId: z.string().min(1),
  sku: z.string().trim().min(2),
  nameAr: z.string().trim().min(2),
  nameEn: z.string().trim().min(2),
  specificationsAr: z.string().trim().max(160).optional(),
  specificationsEn: z.string().trim().max(160).optional(),
  descriptionAr: z.string().trim().max(280).optional(),
  descriptionEn: z.string().trim().max(280).optional(),
  isVisible: z.boolean()
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;
type ProductFormValues = z.infer<typeof productFormSchema>;
type SubmitMessage = { tone: "success" | "error"; text: string };

const fieldError = {
  ar: { en: "Arabic text is required.", ar: "النص العربي مطلوب." },
  en: { en: "English text is required.", ar: "النص الإنجليزي مطلوب." },
  sku: { en: "Enter a SKU with at least two characters.", ar: "أدخل رمز SKU من حرفين على الأقل." },
  category: { en: "Select a category.", ar: "اختر فئة." },
  length: { en: "Keep this field shorter.", ar: "اجعل هذا الحقل أقصر." }
} as const;

const selectClassName = "flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const textareaClassName = "min-h-24 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function localizePair(ar: string | undefined, en: string | undefined, language: string) {
  return language === "ar" ? ar || en || "" : en || ar || "";
}

function formatDate(timestamp: number, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

function messageClassName(tone: SubmitMessage["tone"]) {
  return cn("rounded-lg border px-3 py-2 text-sm font-semibold", tone === "success" ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive");
}

export function CatalogManagementPage() {
  const { i18n } = useTranslation("admin");
  const { user } = useAuth();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip";
  const categories = useQuery(api.catalog.listCategoriesForAdmin, queryArgs);
  const products = useQuery(api.catalog.listProductsForAdmin, queryArgs);
  const createCategory = useMutation(api.catalog.createCategory);
  const createProduct = useMutation(api.catalog.createProduct);
  const updateProductVisibility = useMutation(api.catalog.updateProductVisibility);
  const [searchValue, setSearchValue] = useState("");
  const [categoryMessage, setCategoryMessage] = useState<SubmitMessage | null>(null);
  const [productMessage, setProductMessage] = useState<SubmitMessage | null>(null);
  const [pendingProductId, setPendingProductId] = useState<Id<"products"> | null>(null);

  const {
    formState: { errors: categoryErrors, isSubmitting: isSubmittingCategory },
    handleSubmit: handleSubmitCategory,
    register: registerCategory,
    reset: resetCategory
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      nameAr: "",
      nameEn: "",
      parentCategoryId: ""
    }
  });

  const {
    formState: { errors: productErrors, isSubmitting: isSubmittingProduct },
    handleSubmit: handleSubmitProduct,
    register: registerProduct,
    reset: resetProduct
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      categoryId: "",
      sku: "",
      nameAr: "",
      nameEn: "",
      specificationsAr: "",
      specificationsEn: "",
      descriptionAr: "",
      descriptionEn: "",
      isVisible: true
    }
  });

  const activeCategories = useMemo(() => (categories ?? []).filter((category) => category.isActive), [categories]);
  const categoryById = useMemo(() => new Map((categories ?? []).map((category) => [category._id, category])), [categories]);
  const normalizedSearch = searchValue.trim().toLowerCase();

  const categoryRows = useMemo(() => {
    const source = categories ?? [];
    if (!normalizedSearch) {
      return source;
    }

    return source.filter((category) => {
      const parentCategory = category.parentCategoryId ? categoryById.get(category.parentCategoryId) : null;
      return [category.nameAr, category.nameEn, category._id, parentCategory?.nameAr, parentCategory?.nameEn].some((value) => value?.toLowerCase().includes(normalizedSearch));
    });
  }, [categories, categoryById, normalizedSearch]);

  const productRows = useMemo(() => {
    const source = products ?? [];
    if (!normalizedSearch) {
      return source;
    }

    return source.filter((product) => {
      return [product.sku, product.nameAr, product.nameEn, product.specificationsAr, product.specificationsEn, product.category?.nameAr, product.category?.nameEn].some((value) => value?.toLowerCase().includes(normalizedSearch));
    });
  }, [normalizedSearch, products]);

  const totalProducts = products?.length ?? 0;
  const visibleProducts = (products ?? []).filter((product) => product.isVisible).length;
  const hiddenProducts = totalProducts - visibleProducts;

  const handleCreateCategory = handleSubmitCategory(async (values) => {
    setCategoryMessage(null);

    if (!isBetterAuthConfigured || !user) {
      setCategoryMessage({
        tone: "error",
        text: localize({ en: "Connect to Convex auth before creating categories.", ar: "اربط مصادقة Convex قبل إنشاء الفئات." }, language)
      });
      return;
    }

    try {
      await createCategory({
        actorUserId: user.id as Id<"users">,
        nameAr: values.nameAr.trim(),
        nameEn: values.nameEn.trim(),
        ...(values.parentCategoryId ? { parentCategoryId: values.parentCategoryId as Id<"categories"> } : {})
      });
      resetCategory({ nameAr: "", nameEn: "", parentCategoryId: "" });
      setCategoryMessage({
        tone: "success",
        text: localize({ en: "Category created.", ar: "تم إنشاء الفئة." }, language)
      });
    } catch {
      setCategoryMessage({
        tone: "error",
        text: localize({ en: "Could not create the category.", ar: "تعذر إنشاء الفئة." }, language)
      });
    }
  });

  const handleCreateProduct = handleSubmitProduct(async (values) => {
    setProductMessage(null);

    if (!isBetterAuthConfigured || !user) {
      setProductMessage({
        tone: "error",
        text: localize({ en: "Connect to Convex auth before creating products.", ar: "اربط مصادقة Convex قبل إنشاء المنتجات." }, language)
      });
      return;
    }

    try {
      await createProduct({
        actorUserId: user.id as Id<"users">,
        categoryId: values.categoryId as Id<"categories">,
        sku: values.sku.trim(),
        nameAr: values.nameAr.trim(),
        nameEn: values.nameEn.trim(),
        descriptionAr: optionalText(values.descriptionAr),
        descriptionEn: optionalText(values.descriptionEn),
        specificationsAr: optionalText(values.specificationsAr),
        specificationsEn: optionalText(values.specificationsEn),
        isVisible: values.isVisible
      });
      resetProduct({
        categoryId: values.categoryId,
        sku: "",
        nameAr: "",
        nameEn: "",
        specificationsAr: "",
        specificationsEn: "",
        descriptionAr: "",
        descriptionEn: "",
        isVisible: true
      });
      setProductMessage({
        tone: "success",
        text: localize({ en: "Product created.", ar: "تم إنشاء المنتج." }, language)
      });
    } catch {
      setProductMessage({
        tone: "error",
        text: localize({ en: "Could not create the product. Check that the SKU is unique.", ar: "تعذر إنشاء المنتج. تأكد أن رمز SKU غير مكرر." }, language)
      });
    }
  });

  async function handleToggleProductVisibility(productId: Id<"products">, isVisible: boolean) {
    if (!isBetterAuthConfigured || !user) {
      return;
    }

    setPendingProductId(productId);
    setProductMessage(null);

    try {
      await updateProductVisibility({
        actorUserId: user.id as Id<"users">,
        productId,
        isVisible
      });
      setProductMessage({
        tone: "success",
        text: isVisible ? localize({ en: "Product is visible in the client catalog.", ar: "أصبح المنتج ظاهرا في كتالوج العميل." }, language) : localize({ en: "Product is hidden from the client catalog.", ar: "تم إخفاء المنتج من كتالوج العميل." }, language)
      });
    } catch {
      setProductMessage({
        tone: "error",
        text: localize({ en: "Could not update product visibility.", ar: "تعذر تحديث ظهور المنتج." }, language)
      });
    } finally {
      setPendingProductId(null);
    }
  }

  return (
    <>
      <StatStrip
        stats={[
          { label: localize({ en: "Categories", ar: "الفئات" }, language), value: String(categories?.length ?? 0), detail: localize({ en: "Arabic and English labels", ar: "تسميات عربية وإنجليزية" }, language) },
          { label: localize({ en: "Client-visible items", ar: "بنود ظاهرة للعميل" }, language), value: String(visibleProducts), detail: localize({ en: "Shown without catalog prices", ar: "تظهر بدون أسعار كتالوج" }, language), trendTone: "positive" },
          { label: localize({ en: "Admin-only items", ar: "بنود للإدارة فقط" }, language), value: String(hiddenProducts), detail: localize({ en: "Hidden from client catalog", ar: "مخفية من كتالوج العميل" }, language), trendTone: "neutral" },
          { label: localize({ en: "Public prices", ar: "أسعار عامة" }, language), value: "0", detail: localize({ en: "Pricing happens after RFQ", ar: "التسعير بعد طلب التسعير" }, language) }
        ]}
      />

      <section className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="flex flex-col gap-5">
          <DashboardCard
            title={localize({ en: "Create category", ar: "إنشاء فئة" }, language)}
            description={localize({ en: "Adds controlled catalog groups with bilingual names.", ar: "يضيف مجموعات كتالوج مضبوطة بأسماء ثنائية اللغة." }, language)}
          >
            <form className="flex flex-col gap-4" onSubmit={handleCreateCategory}>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                {localize({ en: "Arabic name", ar: "الاسم العربي" }, language)}
                <Input aria-invalid={Boolean(categoryErrors.nameAr)} placeholder={localize({ en: "Office supplies", ar: "المستلزمات المكتبية" }, language)} {...registerCategory("nameAr")} />
                {categoryErrors.nameAr ? <span className="text-xs font-semibold text-destructive">{localize(fieldError.ar, language)}</span> : null}
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                {localize({ en: "English name", ar: "الاسم الإنجليزي" }, language)}
                <Input aria-invalid={Boolean(categoryErrors.nameEn)} placeholder="Office supplies" {...registerCategory("nameEn")} />
                {categoryErrors.nameEn ? <span className="text-xs font-semibold text-destructive">{localize(fieldError.en, language)}</span> : null}
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                {localize({ en: "Parent category", ar: "الفئة الرئيسية" }, language)}
                <select className={cn(selectClassName)} {...registerCategory("parentCategoryId")}>
                  <option value="">{localize({ en: "No parent category", ar: "بدون فئة رئيسية" }, language)}</option>
                  {activeCategories.map((category) => (
                    <option key={category._id} value={category._id}>
                      {localizePair(category.nameAr, category.nameEn, language)}
                    </option>
                  ))}
                </select>
              </label>
              {categoryMessage ? <p className={messageClassName(categoryMessage.tone)}>{categoryMessage.text}</p> : null}
              <Button type="submit" disabled={isSubmittingCategory || !isBetterAuthConfigured}>
                {isSubmittingCategory ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FolderPlus className="size-4" aria-hidden="true" />}
                {localize({ en: "Create category", ar: "إنشاء فئة" }, language)}
              </Button>
            </form>
          </DashboardCard>

          <DashboardCard
            title={localize({ en: "Create product", ar: "إنشاء منتج" }, language)}
            description={localize({ en: "Adds catalog items without client-visible prices.", ar: "يضيف بنود كتالوج بدون أسعار ظاهرة للعميل." }, language)}
          >
            <form className="flex flex-col gap-4" onSubmit={handleCreateProduct}>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                {localize({ en: "Category", ar: "الفئة" }, language)}
                <select className={cn(selectClassName)} aria-invalid={Boolean(productErrors.categoryId)} disabled={activeCategories.length === 0} {...registerProduct("categoryId")}>
                  <option value="">{localize({ en: "Select category", ar: "اختر الفئة" }, language)}</option>
                  {activeCategories.map((category) => (
                    <option key={category._id} value={category._id}>
                      {localizePair(category.nameAr, category.nameEn, language)}
                    </option>
                  ))}
                </select>
                {productErrors.categoryId ? <span className="text-xs font-semibold text-destructive">{localize(fieldError.category, language)}</span> : null}
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                SKU
                <Input aria-invalid={Boolean(productErrors.sku)} placeholder="MWRD-IT-001" {...registerProduct("sku")} />
                {productErrors.sku ? <span className="text-xs font-semibold text-destructive">{localize(fieldError.sku, language)}</span> : null}
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {localize({ en: "Arabic name", ar: "الاسم العربي" }, language)}
                  <Input aria-invalid={Boolean(productErrors.nameAr)} placeholder={localize({ en: "Laptop", ar: "حاسوب محمول" }, language)} {...registerProduct("nameAr")} />
                  {productErrors.nameAr ? <span className="text-xs font-semibold text-destructive">{localize(fieldError.ar, language)}</span> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {localize({ en: "English name", ar: "الاسم الإنجليزي" }, language)}
                  <Input aria-invalid={Boolean(productErrors.nameEn)} placeholder="Laptop" {...registerProduct("nameEn")} />
                  {productErrors.nameEn ? <span className="text-xs font-semibold text-destructive">{localize(fieldError.en, language)}</span> : null}
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {localize({ en: "Arabic specs", ar: "المواصفات العربية" }, language)}
                  <Input aria-invalid={Boolean(productErrors.specificationsAr)} placeholder={localize({ en: "Processor, memory, size", ar: "المعالج والذاكرة والحجم" }, language)} {...registerProduct("specificationsAr")} />
                  {productErrors.specificationsAr ? <span className="text-xs font-semibold text-destructive">{localize(fieldError.length, language)}</span> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {localize({ en: "English specs", ar: "المواصفات الإنجليزية" }, language)}
                  <Input aria-invalid={Boolean(productErrors.specificationsEn)} placeholder="Processor, memory, size" {...registerProduct("specificationsEn")} />
                  {productErrors.specificationsEn ? <span className="text-xs font-semibold text-destructive">{localize(fieldError.length, language)}</span> : null}
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {localize({ en: "Arabic description", ar: "الوصف العربي" }, language)}
                  <textarea className={cn(textareaClassName)} aria-invalid={Boolean(productErrors.descriptionAr)} placeholder={localize({ en: "Optional description", ar: "وصف اختياري" }, language)} {...registerProduct("descriptionAr")} />
                  {productErrors.descriptionAr ? <span className="text-xs font-semibold text-destructive">{localize(fieldError.length, language)}</span> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {localize({ en: "English description", ar: "الوصف الإنجليزي" }, language)}
                  <textarea className={cn(textareaClassName)} aria-invalid={Boolean(productErrors.descriptionEn)} placeholder="Optional description" {...registerProduct("descriptionEn")} />
                  {productErrors.descriptionEn ? <span className="text-xs font-semibold text-destructive">{localize(fieldError.length, language)}</span> : null}
                </label>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/45 p-3 text-sm font-semibold">
                <input className="mt-1 size-4 rounded border-input accent-primary" type="checkbox" {...registerProduct("isVisible")} />
                <span className="flex flex-col gap-1">
                  <span>{localize({ en: "Visible in client catalog", ar: "ظاهر في كتالوج العميل" }, language)}</span>
                  <span className="text-xs font-medium text-muted-foreground">{localize({ en: "The item appears without price or supplier identity.", ar: "يظهر البند بدون سعر أو هوية مورد." }, language)}</span>
                </span>
              </label>
              {productMessage ? <p className={messageClassName(productMessage.tone)}>{productMessage.text}</p> : null}
              <Button type="submit" disabled={isSubmittingProduct || !isBetterAuthConfigured || activeCategories.length === 0}>
                {isSubmittingProduct ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PackagePlus className="size-4" aria-hidden="true" />}
                {localize({ en: "Create product", ar: "إنشاء منتج" }, language)}
              </Button>
            </form>
          </DashboardCard>
        </div>

        <div className="flex flex-col gap-5">
          <DashboardToolbar
            searchPlaceholder={localize({ en: "Search catalog...", ar: "ابحث في الكتالوج..." }, language)}
            searchValue={searchValue}
            onSearchChange={(event) => setSearchValue(event.target.value)}
          />

          <DashboardCard title={localize({ en: "Categories", ar: "الفئات" }, language)}>
            <DataTable
              rows={categoryRows}
              emptyLabel={categories === undefined ? localize({ en: "Loading categories...", ar: "جار تحميل الفئات..." }, language) : localize({ en: "No categories found.", ar: "لا توجد فئات." }, language)}
              getRowKey={(category) => category._id}
              columns={[
                { header: localize({ en: "Name", ar: "الاسم" }, language), cell: (category) => <span className="font-semibold">{localizePair(category.nameAr, category.nameEn, language)}</span> },
                {
                  header: localize({ en: "Parent", ar: "الرئيسية" }, language),
                  cell: (category) => {
                    const parentCategory = category.parentCategoryId ? categoryById.get(category.parentCategoryId) : null;
                    return <span className="text-muted-foreground">{parentCategory ? localizePair(parentCategory.nameAr, parentCategory.nameEn, language) : localize({ en: "Root", ar: "رئيسية" }, language)}</span>;
                  }
                },
                {
                  header: localize({ en: "Status", ar: "الحالة" }, language),
                  cell: (category) => <StatusBadge tone={category.isActive ? "info" : "neutral"}>{category.isActive ? localize({ en: "Active", ar: "نشطة" }, language) : localize({ en: "Inactive", ar: "غير نشطة" }, language)}</StatusBadge>
                },
                { header: localize({ en: "Created", ar: "تاريخ الإنشاء" }, language), cell: (category) => <span className="text-muted-foreground">{formatDate(category.createdAt, language)}</span> }
              ]}
            />
          </DashboardCard>

          <DashboardCard title={localize({ en: "Products", ar: "المنتجات" }, language)}>
            <DataTable
              rows={productRows}
              emptyLabel={products === undefined ? localize({ en: "Loading products...", ar: "جار تحميل المنتجات..." }, language) : localize({ en: "No products found.", ar: "لا توجد منتجات." }, language)}
              getRowKey={(product) => product._id}
              columns={[
                { header: "SKU", cell: (product) => <span className="font-semibold">{product.sku}</span> },
                { header: localize({ en: "Name", ar: "الاسم" }, language), cell: (product) => <span>{localizePair(product.nameAr, product.nameEn, language)}</span> },
                { header: localize({ en: "Category", ar: "الفئة" }, language), cell: (product) => <span className="text-muted-foreground">{localizePair(product.category?.nameAr, product.category?.nameEn, language)}</span> },
                {
                  header: localize({ en: "Visibility", ar: "الظهور" }, language),
                  cell: (product) => <StatusBadge tone={product.isVisible ? "info" : "neutral"}>{product.isVisible ? localize({ en: "Client catalog", ar: "كتالوج العميل" }, language) : localize({ en: "Admin only", ar: "للإدارة فقط" }, language)}</StatusBadge>
                },
                {
                  header: localize({ en: "Action", ar: "الإجراء" }, language),
                  className: "text-end",
                  cell: (product) => (
                    <Button type="button" size="sm" variant="outline" disabled={pendingProductId === product._id} onClick={() => void handleToggleProductVisibility(product._id, !product.isVisible)}>
                      {pendingProductId === product._id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : product.isVisible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                      {product.isVisible ? localize({ en: "Hide", ar: "إخفاء" }, language) : localize({ en: "Show", ar: "إظهار" }, language)}
                    </Button>
                  )
                }
              ]}
            />
          </DashboardCard>
        </div>
      </section>
    </>
  );
}
