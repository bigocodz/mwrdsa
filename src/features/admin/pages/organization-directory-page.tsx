import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Building2, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { DashboardCard, DashboardToolbar, DataTable, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type ManagedOrganizationType = "client" | "supplier";
type OrganizationDocument = Doc<"organizations">;

const organizationFormSchema = z.object({
  name: z.string().trim().min(2),
  defaultLanguage: z.enum(["ar", "en"])
});

type OrganizationFormValues = z.infer<typeof organizationFormSchema>;

const statusToneMap = {
  active: "info",
  pending: "warning",
  pendingCallback: "warning",
  pendingKyc: "warning",
  suspended: "danger",
  closed: "neutral"
} as const satisfies Record<OrganizationDocument["status"], "info" | "warning" | "danger" | "neutral">;

const localizedStatus: Record<OrganizationDocument["status"], { en: string; ar: string }> = {
  active: { en: "Active", ar: "نشط" },
  pending: { en: "Pending", ar: "معلق" },
  pendingCallback: { en: "Awaiting callback", ar: "بانتظار الاتصال" },
  pendingKyc: { en: "Pending KYC", ar: "بانتظار التحقق" },
  suspended: { en: "Suspended", ar: "موقوف" },
  closed: { en: "Closed", ar: "مغلق" }
};

const languageLabel = {
  ar: { en: "Arabic", ar: "العربية" },
  en: { en: "English", ar: "الإنجليزية" }
} as const;

function getAnonymousId(organization: OrganizationDocument) {
  return organization.type === "client" ? organization.clientAnonymousId : organization.supplierAnonymousId;
}

function formatDate(timestamp: number, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

export function OrganizationDirectoryPage({
  organizationType,
  title
}: {
  organizationType: ManagedOrganizationType;
  title: string;
}) {
  const { i18n } = useTranslation("admin");
  const { user } = useAuth();
  const [searchValue, setSearchValue] = useState("");
  const [submitMessage, setSubmitMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const createOrganization = useMutation(api.orgs.createOrganization);
  const organizations = useQuery(
    api.orgs.listOrganizationsForAdmin,
    isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users">, type: organizationType } : "skip"
  );
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: {
      name: "",
      defaultLanguage: "ar"
    }
  });

  const language = i18n.language;
  const rows = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    const source = organizations ?? [];

    if (!normalizedSearch) {
      return source;
    }

    return source.filter((organization) => {
      const anonymousId = getAnonymousId(organization) ?? "";
      return [organization.name, anonymousId, organization.status].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [organizations, searchValue]);
  const pendingCount = (organizations ?? []).filter((organization) => organization.status === "pending").length;
  const activeCount = (organizations ?? []).filter((organization) => organization.status === "active").length;
  const suspendedCount = (organizations ?? []).filter((organization) => organization.status === "suspended").length;
  const noun = organizationType === "client" ? { en: "client", ar: "عميل" } : { en: "supplier", ar: "مورد" };
  const pluralNoun = organizationType === "client" ? { en: "clients", ar: "العملاء" } : { en: "suppliers", ar: "الموردين" };

  const handleCreateOrganization = handleSubmit(async (values) => {
    setSubmitMessage(null);

    if (!isBetterAuthConfigured || !user) {
      setSubmitMessage({
        tone: "error",
        text: localize({ en: "Connect to Convex auth before creating organizations.", ar: "اربط مصادقة Convex قبل إنشاء الجهات." }, language)
      });
      return;
    }

    try {
      await createOrganization({
        actorUserId: user.id as Id<"users">,
        type: organizationType,
        name: values.name.trim(),
        defaultLanguage: values.defaultLanguage
      });
      reset({ name: "", defaultLanguage: values.defaultLanguage });
      setSubmitMessage({
        tone: "success",
        text: localize({ en: "Organization created.", ar: "تم إنشاء الجهة." }, language)
      });
    } catch {
      setSubmitMessage({
        tone: "error",
        text: localize({ en: "Could not create the organization.", ar: "تعذر إنشاء الجهة." }, language)
      });
    }
  });

  return (
    <>
      <StatStrip
        stats={[
          { label: localize({ en: `Total ${pluralNoun.en}`, ar: `إجمالي ${pluralNoun.ar}` }, language), value: String(organizations?.length ?? 0), detail: localize({ en: "Managed organizations", ar: "جهات مدارة" }, language) },
          { label: localize({ en: "Active", ar: "نشط" }, language), value: String(activeCount), detail: localize({ en: "Can use the portal", ar: "يمكنها استخدام البوابة" }, language), trendTone: "positive" },
          { label: localize({ en: "Pending", ar: "معلق" }, language), value: String(pendingCount), detail: localize({ en: "Needs admin completion", ar: "تحتاج إكمال إداري" }, language), trendTone: "neutral" },
          { label: localize({ en: "Suspended", ar: "موقوف" }, language), value: String(suspendedCount), detail: localize({ en: "Access restricted", ar: "الوصول مقيد" }, language), trendTone: "negative" }
        ]}
      />

      <section className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <DashboardCard
          title={localize({ en: `Create ${noun.en}`, ar: `إنشاء ${noun.ar}` }, language)}
          description={localize({ en: "Adds an organization with an anonymous marketplace ID.", ar: "يضيف جهة بمعرف سوق مجهول." }, language)}
        >
          <form className="flex flex-col gap-4" onSubmit={handleCreateOrganization}>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              {localize({ en: "Organization name", ar: "اسم الجهة" }, language)}
              <Input aria-invalid={Boolean(errors.name)} placeholder={localize({ en: "Enter organization name", ar: "أدخل اسم الجهة" }, language)} {...register("name")} />
              {errors.name ? <span className="text-xs font-semibold text-destructive">{localize({ en: "Enter at least two characters.", ar: "أدخل حرفين على الأقل." }, language)}</span> : null}
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              {localize({ en: "Default language", ar: "اللغة الافتراضية" }, language)}
              <select
                className={cn("flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50")}
                {...register("defaultLanguage")}
              >
                <option value="ar">{localize(languageLabel.ar, language)}</option>
                <option value="en">{localize(languageLabel.en, language)}</option>
              </select>
            </label>
            {submitMessage ? (
              <p className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", submitMessage.tone === "success" ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive")}>
                {submitMessage.text}
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting || !isBetterAuthConfigured}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Building2 className="size-4" aria-hidden="true" />}
              {localize({ en: `Create ${noun.en}`, ar: `إنشاء ${noun.ar}` }, language)}
            </Button>
          </form>
        </DashboardCard>

        <div className="flex flex-col gap-5">
          <DashboardToolbar
            searchPlaceholder={localize({ en: `Search ${pluralNoun.en}...`, ar: `ابحث في ${pluralNoun.ar}...` }, language)}
            searchValue={searchValue}
            onSearchChange={(event) => setSearchValue(event.target.value)}
          />
          <DashboardCard title={title}>
            <DataTable
              rows={rows}
              emptyLabel={organizations === undefined ? localize({ en: "Loading organizations...", ar: "جار تحميل الجهات..." }, language) : localize({ en: "No organizations found.", ar: "لا توجد جهات." }, language)}
              getRowKey={(organization) => organization._id}
              columns={[
                { header: "ID", cell: (organization) => <span className="font-semibold">{getAnonymousId(organization) ?? organization._id}</span> },
                { header: localize({ en: "Name", ar: "الاسم" }, language), cell: (organization) => <span>{organization.name}</span> },
                {
                  header: localize({ en: "Status", ar: "الحالة" }, language),
                  cell: (organization) => <StatusBadge tone={statusToneMap[organization.status]}>{localize(localizedStatus[organization.status], language)}</StatusBadge>
                },
                { header: localize({ en: "Language", ar: "اللغة" }, language), cell: (organization) => <span>{localize(languageLabel[organization.defaultLanguage], language)}</span> },
                { header: localize({ en: "Created", ar: "تاريخ الإنشاء" }, language), cell: (organization) => <span className="text-muted-foreground">{formatDate(organization.createdAt, language)}</span> }
              ]}
            />
          </DashboardCard>
        </div>
      </section>
    </>
  );
}
