import { useQuery } from "convex/react";
import { Check, PackageSearch, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardToolbar, StatStrip } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";
import { useRfqCart } from "@/features/rfq/hooks/use-rfq-cart";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";

function localizePair(ar: string | undefined, en: string | undefined, language: string) {
  return language === "ar" ? ar || en || "" : en || ar || "";
}

export function ClientCatalogPage() {
  const { t, i18n } = useTranslation(["common", "catalog"]);
  const navItems = useClientNav();
  const { user } = useAuth();
  const navigate = useNavigate();
  const cart = useRfqCart();
  const [searchValue, setSearchValue] = useState("");
  const products = useQuery(api.catalog.listVisibleProducts, isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip");
  const language = i18n.language;
  const cartProductIds = useMemo(() => new Set(cart.items.map((item) => item.productId).filter(Boolean) as Id<"products">[]), [cart.items]);
  const productRows = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    const source = products ?? [];

    if (!normalizedSearch) {
      return source;
    }

    return source.filter((product) => {
      return [product.sku, product.nameAr, product.nameEn, product.specificationsAr, product.specificationsEn, product.category.nameAr, product.category.nameEn].some((value) => value?.toLowerCase().includes(normalizedSearch));
    });
  }, [products, searchValue]);
  const categoryCount = new Set((products ?? []).map((product) => product.category._id)).size;
  const bilingualCount = (products ?? []).filter((product) => product.nameAr && product.nameEn).length;

  return (
    <PortalShell
      title={t("catalog:title")}
      description={t("catalog:description")}
      navItems={navItems}
      primaryActionLabel={cart.items.length > 0 ? localize({ en: `Review RFQ (${cart.items.length})`, ar: `مراجعة الطلب (${cart.items.length})` }, language) : t("actions.new_rfq", { ns: "common" })}
      primaryActionIcon={<Plus className="size-4" aria-hidden="true" />}
      onPrimaryAction={() => navigate("/client/rfqs")}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Catalog groups", ar: "مجموعات الكتالوج" }, language), value: String(categoryCount), detail: t("catalog:no_prices") },
          { label: localize({ en: "Ready for RFQ", ar: "جاهز لطلب التسعير" }, language), value: String(products?.length ?? 0), detail: localize({ en: "Client-visible catalog items", ar: "بنود كتالوج ظاهرة للعميل" }, language), trendTone: "positive" },
          { label: localize({ en: "Bilingual items", ar: "بنود ثنائية اللغة" }, language), value: String(bilingualCount), detail: localize({ en: "Arabic and English names", ar: "أسماء عربية وإنجليزية" }, language), trendTone: "neutral" },
          { label: localize({ en: "Public prices", ar: "أسعار عامة" }, language), value: "0", detail: localize({ en: "Quotes are priced after RFQ", ar: "يتم التسعير بعد طلب التسعير" }, language) }
        ]}
      />

      <DashboardToolbar
        searchPlaceholder={t("catalog:search_placeholder")}
        searchValue={searchValue}
        onSearchChange={(event) => setSearchValue(event.target.value)}
      />

      {productRows.length > 0 ? (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {productRows.map((product) => (
            <article key={product._id} className="flex min-h-[21rem] flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-card">
              <div className="flex items-center justify-between px-5 pt-5">
                <span className="h-1.5 w-8 rounded-full bg-muted-foreground/40" />
                <span className="text-xs font-semibold text-muted-foreground">{product.sku}</span>
              </div>
              <div className="mx-5 mt-3 grid flex-1 place-items-center rounded-lg bg-muted/55 p-8">
                <span className="grid size-24 place-items-center rounded-full bg-card text-primary shadow-card">
                  <PackageSearch className="size-12" aria-hidden="true" />
                </span>
              </div>
              <div className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{localizePair(product.nameAr, product.nameEn, language)}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{localizePair(product.specificationsAr ?? product.descriptionAr, product.specificationsEn ?? product.descriptionEn, language)}</p>
                  </div>
                  <Badge variant="info">{localizePair(product.category.nameAr, product.category.nameEn, language)}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{t("catalog:no_prices")}</span>
                </div>
                {cartProductIds.has(product._id) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => cart.removeItem(product._id)}
                  >
                    <Check className="size-4" aria-hidden="true" />
                    {localize({ en: "Added — remove", ar: "تمت الإضافة — حذف" }, language)}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      cart.addItem({
                        productId: product._id,
                        sku: product.sku,
                        nameAr: product.nameAr,
                        nameEn: product.nameEn,
                        specificationsAr: product.specificationsAr,
                        specificationsEn: product.specificationsEn
                      })
                    }
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {t("catalog:add_to_rfq")}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="grid min-h-72 place-items-center rounded-lg border border-dashed border-border/80 bg-card p-8 text-center shadow-card">
          <div className="flex max-w-md flex-col items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
              <PackageSearch className="size-7" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold">{products === undefined ? localize({ en: "Loading catalog...", ar: "جار تحميل الكتالوج..." }, language) : t("catalog:empty")}</h2>
            <p className="text-sm text-muted-foreground">{localize({ en: "Admin-created visible items will appear here without prices or supplier identity.", ar: "ستظهر هنا البنود التي تعتمدها الإدارة بدون أسعار أو هوية مورد." }, language)}</p>
          </div>
        </section>
      )}
    </PortalShell>
  );
}
