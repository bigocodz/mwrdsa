import { useMutation, useQuery } from "convex/react";
import { Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";

type BundleItem = {
  _id: Id<"bundleItems">;
  productId: Id<"products">;
  product: { _id: Id<"products">; sku: string; nameAr: string; nameEn: string } | null;
  quantity: number;
  unit: string;
  notes?: string;
};

type Bundle = {
  _id: Id<"bundles">;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  isActive: boolean;
  itemCount: number;
  items: BundleItem[];
  createdAt: number;
  updatedAt: number;
};

export function ClientBundlesPage() {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const navItems = useClientNav();
  const { user } = useAuth();
  const queryArgs = useMemo(
    () => (isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip"),
    [user]
  );
  const bundles = useQuery(api.bundles.listBundles, queryArgs);
  const createBundle = useMutation(api.bundles.createBundle);
  const deleteBundle = useMutation(api.bundles.deleteBundle);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Id<"bundles"> | null>(null);
  const [form, setForm] = useState({ nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setForm({ nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "" });
    setError(null);
    setOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await createBundle({
        actorUserId: user.id as Id<"users">,
        nameAr: form.nameAr,
        nameEn: form.nameEn,
        descriptionAr: form.descriptionAr || undefined,
        descriptionEn: form.descriptionEn || undefined,
        items: [] // Items added after creation via edit flow
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: Id<"bundles">) {
    if (!user) return;
    await deleteBundle({ actorUserId: user.id as Id<"users">, bundleId: id });
  }

  return (
    <PortalShell
      title={localize({ en: "Essentials Packs", ar: "حزم المشتريات" }, language)}
      description={localize(
        { en: "Pre-configured product bundles for fast RFQ creation.", ar: "حزم منتجات مسبقة التكوين لإنشاء طلبات التسعير بسرعة." },
        language
      )}
      navItems={navItems}
      primaryActionLabel={localize({ en: "New bundle", ar: "حزمة جديدة" }, language)}
      primaryActionIcon={<Plus className="size-4" aria-hidden="true" />}
      onPrimaryAction={openCreate}
    >
      {bundles === undefined ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>{localize({ en: "Loading…", ar: "جارٍ التحميل…" }, language)}</span>
        </div>
      ) : bundles.length === 0 ? (
        <DashboardCard title={localize({ en: "No bundles yet", ar: "لا توجد حزم بعد" }, language)}>
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Package className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {localize(
                { en: "Create essentials packs to quickly build RFQs from standard product sets.", ar: "أنشئ حزم أساسيات لبناء طلبات التسعير بسرعة من مجموعات المنتجات المعتمدة." },
                language
              )}
            </p>
            <Button onClick={openCreate} size="sm">
              <Plus className="size-4" />
              {localize({ en: "Create bundle", ar: "إنشاء حزمة" }, language)}
            </Button>
          </div>
        </DashboardCard>
      ) : (
        <div className="flex flex-col gap-4">
          {(bundles as Bundle[]).map((bundle) => (
            <div key={bundle._id} className="rounded-xl border bg-card shadow-sm">
              <div
                className="flex cursor-pointer items-center justify-between gap-4 p-5"
                onClick={() => setExpanded(expanded === bundle._id ? null : bundle._id)}
              >
                <div className="flex items-center gap-3">
                  <Package className="size-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">
                      {localize({ en: bundle.nameEn, ar: bundle.nameAr }, language)}
                    </p>
                    {(bundle.descriptionEn || bundle.descriptionAr) && (
                      <p className="text-sm text-muted-foreground">
                        {localize({ en: bundle.descriptionEn ?? "", ar: bundle.descriptionAr ?? "" }, language)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">
                    {bundle.itemCount} {localize({ en: "items", ar: "منتج" }, language)}
                  </Badge>
                  <StatusBadge tone={bundle.isActive ? "positive" : "neutral"}>
                    {bundle.isActive
                      ? localize({ en: "Active", ar: "نشط" }, language)
                      : localize({ en: "Inactive", ar: "غير نشط" }, language)}
                  </StatusBadge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(bundle._id);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>

              {expanded === bundle._id && bundle.items.length > 0 && (
                <div className="border-t px-5 pb-5 pt-4">
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-start font-medium">
                            {localize({ en: "Product", ar: "المنتج" }, language)}
                          </th>
                          <th className="px-3 py-2 text-start font-medium">
                            {localize({ en: "SKU", ar: "الرمز" }, language)}
                          </th>
                          <th className="px-3 py-2 text-start font-medium">
                            {localize({ en: "Qty", ar: "الكمية" }, language)}
                          </th>
                          <th className="px-3 py-2 text-start font-medium">
                            {localize({ en: "Unit", ar: "الوحدة" }, language)}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {bundle.items.map((item) => (
                          <tr key={item._id} className="border-t">
                            <td className="px-3 py-2">
                              {item.product
                                ? localize({ en: item.product.nameEn, ar: item.product.nameAr }, language)
                                : localize({ en: "Unknown product", ar: "منتج غير معروف" }, language)}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                              {item.product?.sku ?? "—"}
                            </td>
                            <td className="px-3 py-2">{item.quantity}</td>
                            <td className="px-3 py-2">{item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{localize({ en: "New bundle", ar: "حزمة جديدة" }, language)}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bundle-name-en">{localize({ en: "Name (English)", ar: "الاسم (إنجليزي)" }, language)} *</Label>
                <Input
                  id="bundle-name-en"
                  value={form.nameEn}
                  onChange={(e) => setForm((p) => ({ ...p, nameEn: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bundle-name-ar">{localize({ en: "Name (Arabic)", ar: "الاسم (عربي)" }, language)} *</Label>
                <Input
                  id="bundle-name-ar"
                  dir="rtl"
                  value={form.nameAr}
                  onChange={(e) => setForm((p) => ({ ...p, nameAr: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="bundle-desc-en">{localize({ en: "Description (English)", ar: "الوصف (إنجليزي)" }, language)}</Label>
                <Input
                  id="bundle-desc-en"
                  value={form.descriptionEn}
                  onChange={(e) => setForm((p) => ({ ...p, descriptionEn: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="bundle-desc-ar">{localize({ en: "Description (Arabic)", ar: "الوصف (عربي)" }, language)}</Label>
                <Input
                  id="bundle-desc-ar"
                  dir="rtl"
                  value={form.descriptionAr}
                  onChange={(e) => setForm((p) => ({ ...p, descriptionAr: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {localize(
                { en: "You can add products to the bundle after creating it.", ar: "يمكنك إضافة المنتجات للحزمة بعد إنشائها." },
                language
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                {localize({ en: "Cancel", ar: "إلغاء" }, language)}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {localize({ en: "Create", ar: "إنشاء" }, language)}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PortalShell>
  );
}
