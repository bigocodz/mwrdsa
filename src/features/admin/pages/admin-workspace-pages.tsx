import { Send } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, SparkBars, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { localize, type LocalizedText } from "@/features/rfq/data/client-workflow-data";
import { useAdminNav } from "@/features/admin/hooks/use-admin-nav";

type OperationRow = {
  id: string;
  client: string;
  supplierPool: string;
  stage: LocalizedText;
  owner: string;
};

type DirectoryRow = {
  id: string;
  name: LocalizedText;
  status: LocalizedText;
  volume: string;
  risk: LocalizedText;
};

const operations: OperationRow[] = [
  { id: "RFQ-1042", client: "CLT-00473", supplierPool: "Facilities", stage: { en: "Pricing review", ar: "مراجعة التسعير" }, owner: "Pricing" },
  { id: "RFQ-1038", client: "CLT-00921", supplierPool: "IT Supplies", stage: { en: "Supplier matching", ar: "مطابقة الموردين" }, owner: "Ops" },
  { id: "RFQ-1031", client: "CLT-00118", supplierPool: "Office", stage: { en: "Ready to release", ar: "جاهز للإصدار" }, owner: "Admin" }
];

const clients: DirectoryRow[] = [
  { id: "CLT-00473", name: { en: "Healthcare procurement group", ar: "مجموعة مشتريات صحية" }, status: { en: "Active", ar: "نشط" }, volume: "SAR 420K", risk: { en: "Low", ar: "منخفض" } },
  { id: "CLT-00921", name: { en: "Education services group", ar: "مجموعة خدمات تعليمية" }, status: { en: "Active", ar: "نشط" }, volume: "SAR 310K", risk: { en: "Medium", ar: "متوسط" } },
  { id: "CLT-00118", name: { en: "Facilities operator", ar: "مشغل مرافق" }, status: { en: "Review", ar: "مراجعة" }, volume: "SAR 180K", risk: { en: "Medium", ar: "متوسط" } }
];

const suppliers: DirectoryRow[] = [
  { id: "SUP-00821", name: { en: "Facilities supplier", ar: "مورد مرافق" }, status: { en: "Verified", ar: "موثق" }, volume: "92%", risk: { en: "Low", ar: "منخفض" } },
  { id: "SUP-00419", name: { en: "IT accessories supplier", ar: "مورد ملحقات تقنية" }, status: { en: "Verified", ar: "موثق" }, volume: "88%", risk: { en: "Low", ar: "منخفض" } },
  { id: "SUP-00277", name: { en: "Office supplies supplier", ar: "مورد مستلزمات مكتبية" }, status: { en: "Needs review", ar: "يحتاج مراجعة" }, volume: "76%", risk: { en: "Medium", ar: "متوسط" } }
];

function AdminFrame({
  title,
  description,
  children,
  actionLabel,
  actionIcon
}: {
  title: string;
  description: string;
  children: ReactNode;
  actionLabel?: string;
  actionIcon?: ReactNode;
}) {
  const navItems = useAdminNav();

  return (
    <PortalShell title={title} description={description} navItems={navItems} primaryActionLabel={actionLabel} primaryActionIcon={actionIcon}>
      {children}
    </PortalShell>
  );
}

export function AdminOperationsPage() {
  const { t, i18n } = useTranslation("common");

  return (
    <AdminFrame
      title={t("navigation.operations")}
      description={localize({ en: "RFQ review, supplier matching, and quote release control", ar: "مراجعة طلبات التسعير ومطابقة الموردين وإصدار العروض" }, i18n.language)}
      actionLabel={t("actions.release_quotes")}
      actionIcon={<Send className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Active RFQs", ar: "طلبات نشطة" }, i18n.language), value: "46", detail: localize({ en: "Marketplace operations", ar: "عمليات السوق" }, i18n.language), trend: "+8", trendTone: "positive" },
          { label: localize({ en: "Pending review", ar: "بانتظار المراجعة" }, i18n.language), value: "12", detail: localize({ en: "Need admin action", ar: "تحتاج إجراء إداري" }, i18n.language), trend: "-4", trendTone: "negative" },
          { label: localize({ en: "No response", ar: "بدون رد" }, i18n.language), value: "3", detail: localize({ en: "After SLA window", ar: "بعد نافذة الخدمة" }, i18n.language), trend: "+1", trendTone: "negative" },
          { label: localize({ en: "Released today", ar: "مصدر اليوم" }, i18n.language), value: "9", detail: localize({ en: "Quote groups", ar: "مجموعات عروض" }, i18n.language), trend: "+2", trendTone: "positive" }
        ]}
      />
      <DashboardToolbar searchPlaceholder={localize({ en: "Search operations...", ar: "ابحث في العمليات..." }, i18n.language)} />
      <DashboardCard title={t("navigation.operations")}>
        <DataTable
          rows={operations}
          getRowKey={(row) => row.id}
          columns={[
            { header: "ID", cell: (row) => <span className="font-semibold">{row.id}</span> },
            { header: localize({ en: "Client", ar: "العميل" }, i18n.language), cell: (row) => <Badge variant="outline">{row.client}</Badge> },
            { header: localize({ en: "Supplier pool", ar: "مجموعة الموردين" }, i18n.language), cell: (row) => <span>{row.supplierPool}</span> },
            { header: localize({ en: "Stage", ar: "المرحلة" }, i18n.language), cell: (row) => <StatusBadge tone="info">{localize(row.stage, i18n.language)}</StatusBadge> },
            { header: localize({ en: "Owner", ar: "المسؤول" }, i18n.language), cell: (row) => <span>{row.owner}</span> }
          ]}
        />
      </DashboardCard>
    </AdminFrame>
  );
}

export function AdminClientsPage() {
  const { t, i18n } = useTranslation("common");

  return (
    <AdminFrame
      title={t("navigation.clients")}
      description={localize({ en: "Buyer organizations, controls, and procurement activity", ar: "جهات الشراء والضوابط ونشاط المشتريات" }, i18n.language)}
    >
      <DirectoryPage
        rows={clients}
        title={t("navigation.clients")}
        search={localize({ en: "Search clients...", ar: "ابحث في العملاء..." }, i18n.language)}
        metricLabels={[
          localize({ en: "Active clients", ar: "عملاء نشطون" }, i18n.language),
          localize({ en: "Pending approvals", ar: "موافقات معلقة" }, i18n.language),
          localize({ en: "Monthly volume", ar: "حجم شهري" }, i18n.language),
          localize({ en: "Risk reviews", ar: "مراجعات مخاطر" }, i18n.language)
        ]}
      />
    </AdminFrame>
  );
}

export function AdminSuppliersPage() {
  const { t, i18n } = useTranslation("common");

  return (
    <AdminFrame
      title={t("navigation.suppliers")}
      description={localize({ en: "Supplier verification, performance, and category coverage", ar: "توثيق الموردين والأداء وتغطية الفئات" }, i18n.language)}
    >
      <DirectoryPage
        rows={suppliers}
        title={t("navigation.suppliers")}
        search={localize({ en: "Search suppliers...", ar: "ابحث في الموردين..." }, i18n.language)}
        metricLabels={[
          localize({ en: "Verified suppliers", ar: "موردون موثقون" }, i18n.language),
          localize({ en: "Coverage gaps", ar: "فجوات تغطية" }, i18n.language),
          localize({ en: "Response score", ar: "درجة الاستجابة" }, i18n.language),
          localize({ en: "Needs review", ar: "يحتاج مراجعة" }, i18n.language)
        ]}
      />
    </AdminFrame>
  );
}

export function AdminCatalogPage() {
  const { t, i18n } = useTranslation("common");

  return (
    <AdminFrame
      title={t("navigation.catalog")}
      description={localize({ en: "Controlled catalog groups without public prices", ar: "مجموعات كتالوج مضبوطة بدون أسعار ظاهرة" }, i18n.language)}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Catalog groups", ar: "مجموعات الكتالوج" }, i18n.language), value: "24", detail: localize({ en: "No public catalog prices", ar: "بدون أسعار كتالوج عامة" }, i18n.language), trend: "+4", trendTone: "positive" },
          { label: localize({ en: "Supplier pools", ar: "مجموعات الموردين" }, i18n.language), value: "31", detail: localize({ en: "Assigned coverage", ar: "تغطية مسندة" }, i18n.language), trend: "+2", trendTone: "positive" },
          { label: localize({ en: "Needs mapping", ar: "تحتاج ربط" }, i18n.language), value: "6", detail: localize({ en: "Category coverage gaps", ar: "فجوات تغطية الفئات" }, i18n.language), trend: "-1", trendTone: "positive" },
          { label: localize({ en: "Active RFQ items", ar: "بنود طلب نشطة" }, i18n.language), value: "186", detail: localize({ en: "Current period", ar: "الفترة الحالية" }, i18n.language), trend: "+12%", trendTone: "positive" }
        ]}
      />
      <section className="grid gap-5 xl:grid-cols-2">
        <DashboardCard title={localize({ en: "Category coverage", ar: "تغطية الفئات" }, i18n.language)}>
          <SparkBars values={[68, 74, 59, 81, 73, 88, 64, 70, 84, 77, 92, 86]} tone="sun" />
        </DashboardCard>
        <DashboardCard title={localize({ en: "Catalog controls", ar: "ضوابط الكتالوج" }, i18n.language)}>
          <div className="grid gap-3">
            {[
              localize({ en: "Client catalog displays items without prices", ar: "يعرض كتالوج العميل البنود بدون أسعار" }, i18n.language),
              localize({ en: "Admin pricing and margin happen before quote release", ar: "تتم إضافة التسعير والهامش قبل إصدار العروض" }, i18n.language),
              localize({ en: "Supplier visibility remains anonymous by client", ar: "تبقى رؤية المورد مجهولة حسب العميل" }, i18n.language)
            ].map((item) => (
              <div key={item} className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </DashboardCard>
      </section>
    </AdminFrame>
  );
}

export function AdminAuditPage() {
  const { t, i18n } = useTranslation("common");
  const auditRows = [
    { id: "AUD-901", event: localize({ en: "Margin override approved", ar: "اعتماد تعديل هامش" }, i18n.language), actor: "MWRD Admin", time: "17:10" },
    { id: "AUD-899", event: localize({ en: "Quote group released", ar: "إصدار مجموعة عروض" }, i18n.language), actor: "Pricing", time: "16:42" },
    { id: "AUD-887", event: localize({ en: "Supplier reassigned", ar: "إعادة إسناد مورد" }, i18n.language), actor: "Ops", time: "15:18" }
  ];

  return (
    <AdminFrame
      title={t("navigation.audit")}
      description={localize({ en: "Operational trace for controlled marketplace actions", ar: "سجل تشغيلي لإجراءات السوق المضبوطة" }, i18n.language)}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Logged today", ar: "مسجلة اليوم" }, i18n.language), value: "128", detail: localize({ en: "System and user events", ar: "أحداث النظام والمستخدمين" }, i18n.language), trend: "+18", trendTone: "positive" },
          { label: localize({ en: "Admin actions", ar: "إجراءات الإدارة" }, i18n.language), value: "37", detail: localize({ en: "Require retention", ar: "تتطلب حفظا" }, i18n.language), trend: "+6", trendTone: "positive" },
          { label: localize({ en: "Overrides", ar: "تعديلات" }, i18n.language), value: "2", detail: localize({ en: "Need reason checks", ar: "تحتاج فحص السبب" }, i18n.language), trend: "-1", trendTone: "positive" },
          { label: localize({ en: "Failed attempts", ar: "محاولات فاشلة" }, i18n.language), value: "0", detail: localize({ en: "Access controls", ar: "ضوابط الوصول" }, i18n.language), trend: "0", trendTone: "neutral" }
        ]}
      />
      <DashboardCard title={t("navigation.audit")}>
        <DataTable
          rows={auditRows}
          getRowKey={(row) => row.id}
          columns={[
            { header: "ID", cell: (row) => <span className="font-semibold">{row.id}</span> },
            { header: localize({ en: "Event", ar: "الحدث" }, i18n.language), cell: (row) => <span>{row.event}</span> },
            { header: localize({ en: "Actor", ar: "المنفذ" }, i18n.language), cell: (row) => <span className="text-muted-foreground">{row.actor}</span> },
            { header: localize({ en: "Time", ar: "الوقت" }, i18n.language), cell: (row) => <StatusBadge tone="neutral">{row.time}</StatusBadge> }
          ]}
        />
      </DashboardCard>
    </AdminFrame>
  );
}

function DirectoryPage({ rows, title, search, metricLabels }: { rows: DirectoryRow[]; title: string; search: string; metricLabels: string[] }) {
  const { i18n } = useTranslation("common");

  return (
    <>
      <StatStrip
        stats={[
          { label: metricLabels[0], value: "128", detail: localize({ en: "Current workspace", ar: "المساحة الحالية" }, i18n.language), trend: "+9", trendTone: "positive" },
          { label: metricLabels[1], value: "7", detail: localize({ en: "Needs admin action", ar: "تحتاج إجراء إداري" }, i18n.language), trend: "-2", trendTone: "negative" },
          { label: metricLabels[2], value: "SAR 1.2M", detail: localize({ en: "Current month", ar: "الشهر الحالي" }, i18n.language), trend: "+11%", trendTone: "positive" },
          { label: metricLabels[3], value: "3", detail: localize({ en: "Open checks", ar: "فحوصات مفتوحة" }, i18n.language), trend: "-1", trendTone: "positive" }
        ]}
      />
      <DashboardToolbar searchPlaceholder={search} />
      <DashboardCard title={title}>
        <DataTable
          rows={rows}
          getRowKey={(row) => row.id}
          columns={[
            { header: "ID", cell: (row) => <span className="font-semibold">{row.id}</span> },
            { header: localize({ en: "Name", ar: "الاسم" }, i18n.language), cell: (row) => <span>{localize(row.name, i18n.language)}</span> },
            { header: localize({ en: "Status", ar: "الحالة" }, i18n.language), cell: (row) => <StatusBadge tone="info">{localize(row.status, i18n.language)}</StatusBadge> },
            { header: localize({ en: "Volume", ar: "الحجم" }, i18n.language), cell: (row) => <span className="font-semibold">{row.volume}</span> },
            { header: localize({ en: "Risk", ar: "المخاطر" }, i18n.language), cell: (row) => <Badge variant="outline">{localize(row.risk, i18n.language)}</Badge> }
          ]}
        />
      </DashboardCard>
    </>
  );
}
