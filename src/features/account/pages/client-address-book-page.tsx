import { useMutation, useQuery } from "convex/react";
import { Loader2, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Address = {
  _id: Id<"addresses">;
  label: string;
  recipientName: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
};

type FormState = {
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

const emptyForm: FormState = {
  label: "",
  recipientName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "Saudi Arabia",
  isDefault: false
};

export function ClientAddressBookPage() {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const navItems = useClientNav();
  const { user } = useAuth();
  const queryArgs = useMemo(
    () => (isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip"),
    [user]
  );
  const addresses = useQuery(api.addresses.listAddresses, queryArgs);
  const createAddress = useMutation(api.addresses.createAddress);
  const updateAddress = useMutation(api.addresses.updateAddress);
  const deleteAddress = useMutation(api.addresses.deleteAddress);
  const setDefault = useMutation(api.addresses.setDefaultAddress);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  }

  function openEdit(addr: Address) {
    setEditing(addr);
    setForm({
      label: addr.label,
      recipientName: addr.recipientName,
      phone: addr.phone ?? "",
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2 ?? "",
      city: addr.city,
      region: addr.region ?? "",
      postalCode: addr.postalCode ?? "",
      country: addr.country,
      isDefault: addr.isDefault
    });
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !isBetterAuthConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        actorUserId: user.id as Id<"users">,
        label: form.label,
        recipientName: form.recipientName,
        phone: form.phone || undefined,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2 || undefined,
        city: form.city,
        region: form.region || undefined,
        postalCode: form.postalCode || undefined,
        country: form.country,
        isDefault: form.isDefault
      };
      if (editing) {
        await updateAddress({ ...payload, addressId: editing._id });
      } else {
        await createAddress(payload);
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: Id<"addresses">) {
    if (!user) return;
    await deleteAddress({ actorUserId: user.id as Id<"users">, addressId: id });
  }

  async function handleSetDefault(id: Id<"addresses">) {
    if (!user) return;
    await setDefault({ actorUserId: user.id as Id<"users">, addressId: id });
  }

  return (
    <PortalShell
      title={localize({ en: "Address Book", ar: "دفتر العناوين" }, language)}
      description={localize(
        { en: "Manage delivery addresses for your RFQs and purchase orders.", ar: "أدر عناوين التسليم لطلبات تسعيرك وأوامر الشراء." },
        language
      )}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Add address", ar: "إضافة عنوان" }, language)}
      primaryActionIcon={<Plus className="size-4" aria-hidden="true" />}
      onPrimaryAction={openCreate}
    >
      {addresses === undefined ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>{localize({ en: "Loading…", ar: "جارٍ التحميل…" }, language)}</span>
        </div>
      ) : addresses.length === 0 ? (
        <DashboardCard
          title={localize({ en: "No addresses yet", ar: "لا توجد عناوين بعد" }, language)}
        >
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <MapPin className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {localize(
                { en: "Add delivery addresses to speed up RFQ creation.", ar: "أضف عناوين التسليم لتسريع إنشاء طلبات التسعير." },
                language
              )}
            </p>
            <Button onClick={openCreate} size="sm">
              <Plus className="size-4" />
              {localize({ en: "Add address", ar: "إضافة عنوان" }, language)}
            </Button>
          </div>
        </DashboardCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(addresses as Address[]).map((addr) => (
            <div
              key={addr._id}
              className={cn(
                "relative rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md",
                addr.isDefault && "ring-2 ring-primary/40"
              )}
            >
              {addr.isDefault && (
                <span className="absolute end-3 top-3 flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  <Star className="size-3 fill-primary" />
                  {localize({ en: "Default", ar: "الافتراضي" }, language)}
                </span>
              )}
              <div className="mb-3 flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">{addr.label}</p>
                  <p className="text-sm text-muted-foreground">{addr.recipientName}</p>
                </div>
              </div>
              <p className="mb-0.5 text-sm">{addr.addressLine1}</p>
              {addr.addressLine2 && <p className="mb-0.5 text-sm">{addr.addressLine2}</p>}
              <p className="text-sm">
                {addr.city}
                {addr.region ? `, ${addr.region}` : ""}
                {addr.postalCode ? ` ${addr.postalCode}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">{addr.country}</p>
              {addr.phone && <p className="mt-1 text-xs text-muted-foreground">{addr.phone}</p>}
              <div className="mt-4 flex items-center gap-2">
                {!addr.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSetDefault(addr._id)}
                    title={localize({ en: "Set as default", ar: "تعيين كافتراضي" }, language)}
                  >
                    <Star className="size-3" />
                    {localize({ en: "Default", ar: "افتراضي" }, language)}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => openEdit(addr)}>
                  <Pencil className="size-3" />
                  {localize({ en: "Edit", ar: "تعديل" }, language)}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void handleDelete(addr._id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? localize({ en: "Edit address", ar: "تعديل العنوان" }, language)
                : localize({ en: "Add address", ar: "إضافة عنوان" }, language)}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="addr-label">{localize({ en: "Label", ar: "التسمية" }, language)} *</Label>
                <Input
                  id="addr-label"
                  value={form.label}
                  onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder={localize({ en: "e.g. Riyadh HQ", ar: "مثال: المقر الرئيسي الرياض" }, language)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="addr-recipient">{localize({ en: "Recipient", ar: "المستلم" }, language)} *</Label>
                <Input
                  id="addr-recipient"
                  value={form.recipientName}
                  onChange={(e) => setForm((p) => ({ ...p, recipientName: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="addr-line1">{localize({ en: "Address line 1", ar: "السطر الأول" }, language)} *</Label>
                <Input
                  id="addr-line1"
                  value={form.addressLine1}
                  onChange={(e) => setForm((p) => ({ ...p, addressLine1: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="addr-line2">{localize({ en: "Address line 2", ar: "السطر الثاني" }, language)}</Label>
                <Input
                  id="addr-line2"
                  value={form.addressLine2}
                  onChange={(e) => setForm((p) => ({ ...p, addressLine2: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="addr-city">{localize({ en: "City", ar: "المدينة" }, language)} *</Label>
                <Input
                  id="addr-city"
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="addr-region">{localize({ en: "Region", ar: "المنطقة" }, language)}</Label>
                <Input
                  id="addr-region"
                  value={form.region}
                  onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="addr-postal">{localize({ en: "Postal code", ar: "الرمز البريدي" }, language)}</Label>
                <Input
                  id="addr-postal"
                  value={form.postalCode}
                  onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="addr-country">{localize({ en: "Country", ar: "الدولة" }, language)} *</Label>
                <Input
                  id="addr-country"
                  value={form.country}
                  onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="addr-phone">{localize({ en: "Phone", ar: "الهاتف" }, language)}</Label>
                <Input
                  id="addr-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2 self-end pb-1">
                <input
                  id="addr-default"
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                  className="size-4 rounded border"
                />
                <Label htmlFor="addr-default">
                  {localize({ en: "Set as default", ar: "تعيين كافتراضي" }, language)}
                </Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                {localize({ en: "Cancel", ar: "إلغاء" }, language)}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {localize({ en: "Save", ar: "حفظ" }, language)}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PortalShell>
  );
}
