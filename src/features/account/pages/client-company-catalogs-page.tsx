import { useMutation, useQuery } from "convex/react";
import { BookMarked, Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

type CompanyCatalog = {
  _id: Id<"companyCatalogs">;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  isActive: boolean;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
};

export function ClientCompanyCatalogsPage() {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const navItems = useClientNav();
  const { user } = useAuth();
  const queryArgs = useMemo(
    () => (isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip"),
    [user]
  );
  const catalogs = useQuery(api.companyCatalogs.listCompanyCatalogs, queryArgs);
  const createCatalog = useMutation(api.companyCatalogs.createCompanyCatalog);
  const deleteCatalog = useMutation(api.companyCatalogs.deleteCompanyCatalog);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await createCatalog({
        actorUserId: user.id as Id<"users">,
        nameAr: form.nameAr,
        nameEn: form.nameEn,
        descriptionAr: form.descriptionAr || undefined,
        descriptionEn: form.descriptionEn || undefined
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: Id<"companyCatalogs">) {
    if (!user) return;
    await deleteCatalog({ actorUserId: user.id as Id<"users">, companyCatalogId: id });
  }

  return (
    <PortalShell
      title={localize({ en: "Company Catalogs", ar: "كتالوجات الشركة" }, language)}
      description={localize(
        { en: "Curated product lists for your organisation's approved items.", ar: "قوائم منتجات مختارة للعناصر المعتمدة في مؤسستك." },
        language
      )}
      navItems={navItems}
      primaryActionLabel={localize({ en: "New catalog", ar: "كتالوج جديد" }, language)}
      primaryActionIcon={<Plus className="size-4" aria-hidden="true" />}
      onPrimaryAction={() => {
        setForm({ nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "" });
        setError(null);
        setOpen(true);
      }}
    >
      {catalogs === undefined ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>{localize({ en: "Loading…", ar: "جارٍ التحميل…" }, language)}</span>
        </div>
      ) : catalogs.length === 0 ? (
        <DashboardCard title={localize({ en: "No catalogs yet", ar: "لا توجد كتالوجات بعد" }, language)}>
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <BookMarked className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {localize(
                { en: "Create company catalogs to define approved product sets for your teams.", ar: "أنشئ كتالوجات للشركة لتحديد مجموعات المنتجات المعتمدة لفرقك." },
                language
              )}
            </p>
            <Button
              size="sm"
              onClick={() => {
                setForm({ nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "" });
                setError(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" />
              {localize({ en: "Create catalog", ar: "إنشاء كتالوج" }, language)}
            </Button>
          </div>
        </DashboardCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(catalogs as CompanyCatalog[]).map((catalog) => (
            <div key={catalog._id} className="group relative rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <BookMarked className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold leading-tight">
                      {localize({ en: catalog.nameEn, ar: catalog.nameAr }, language)}
                    </p>
                    {(catalog.descriptionEn || catalog.descriptionAr) && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {localize({ en: catalog.descriptionEn ?? "", ar: catalog.descriptionAr ?? "" }, language)}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={() => void handleDelete(catalog._id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {catalog.itemCount} {localize({ en: "products", ar: "منتج" }, language)}
                </Badge>
                <StatusBadge tone={catalog.isActive ? "positive" : "neutral"}>
                  {catalog.isActive
                    ? localize({ en: "Active", ar: "نشط" }, language)
                    : localize({ en: "Inactive", ar: "غير نشط" }, language)}
                </StatusBadge>
              </div>
              <div className="mt-4">
                <Link
                  to={`/client/account/company-catalogs/${catalog._id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {localize({ en: "View & manage →", ar: "عرض وإدارة →" }, language)}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{localize({ en: "New company catalog", ar: "كتالوج جديد" }, language)}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-name-en">{localize({ en: "Name (English)", ar: "الاسم (إنجليزي)" }, language)} *</Label>
                <Input
                  id="cc-name-en"
                  value={form.nameEn}
                  onChange={(e) => setForm((p) => ({ ...p, nameEn: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-name-ar">{localize({ en: "Name (Arabic)", ar: "الاسم (عربي)" }, language)} *</Label>
                <Input
                  id="cc-name-ar"
                  dir="rtl"
                  value={form.nameAr}
                  onChange={(e) => setForm((p) => ({ ...p, nameAr: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="cc-desc-en">{localize({ en: "Description (English)", ar: "الوصف (إنجليزي)" }, language)}</Label>
                <Input
                  id="cc-desc-en"
                  value={form.descriptionEn}
                  onChange={(e) => setForm((p) => ({ ...p, descriptionEn: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="cc-desc-ar">{localize({ en: "Description (Arabic)", ar: "الوصف (عربي)" }, language)}</Label>
                <Input
                  id="cc-desc-ar"
                  dir="rtl"
                  value={form.descriptionAr}
                  onChange={(e) => setForm((p) => ({ ...p, descriptionAr: e.target.value }))}
                />
              </div>
            </div>
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
