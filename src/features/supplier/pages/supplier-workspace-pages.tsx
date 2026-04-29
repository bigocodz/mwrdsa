import { FileCheck2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, SparkBars, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { localize, type LocalizedText } from "@/features/rfq/data/client-workflow-data";
import { useSupplierNav } from "@/features/supplier/hooks/use-supplier-nav";

type SupplierRfq = {
  id: string;
  client: string;
  scope: LocalizedText;
  due: string;
  status: LocalizedText;
};

type SupplierQuote = {
  id: string;
  rfqId: string;
  total: string;
  validity: LocalizedText;
  status: LocalizedText;
};

type SupplierOrder = {
  id: string;
  client: string;
  eta: LocalizedText;
  status: LocalizedText;
  step: LocalizedText;
};

const supplierRfqs: SupplierRfq[] = [
  {
    id: "SUP-RFQ-8842",
    client: "CLT-00473",
    scope: { en: "Facilities consumables, 3 line items", ar: "مستهلكات مرافق، 3 بنود" },
    due: "2026-05-01",
    status: { en: "Due soon", ar: "مستحق قريبا" }
  },
  {
    id: "SUP-RFQ-8838",
    client: "CLT-00921",
    scope: { en: "Printer toner and accessories", ar: "أحبار طابعات وملحقات" },
    due: "2026-05-03",
    status: { en: "Open", ar: "مفتوح" }
  },
  {
    id: "SUP-RFQ-8821",
    client: "CLT-00118",
    scope: { en: "Pantry restock request", ar: "طلب إعادة تعبئة الضيافة" },
    due: "2026-05-06",
    status: { en: "Open", ar: "مفتوح" }
  }
];

const supplierQuotes: SupplierQuote[] = [
  { id: "Q-DRAFT-210", rfqId: "SUP-RFQ-8842", total: "SAR 18,240", validity: { en: "Valid 3 days", ar: "صالح 3 أيام" }, status: { en: "Draft", ar: "مسودة" } },
  { id: "Q-SENT-204", rfqId: "SUP-RFQ-8819", total: "SAR 9,700", validity: { en: "Under admin review", ar: "قيد مراجعة الإدارة" }, status: { en: "Submitted", ar: "مرسل" } },
  { id: "Q-WIN-198", rfqId: "SUP-RFQ-8798", total: "SAR 41,600", validity: { en: "Converted to order", ar: "تحول إلى طلب" }, status: { en: "Accepted", ar: "مقبول" } }
];

const supplierOrders: SupplierOrder[] = [
  { id: "ORD-7004", client: "CLT-00473", eta: { en: "Expected May 6", ar: "متوقع 6 مايو" }, status: { en: "Processing", ar: "قيد التجهيز" }, step: { en: "Preparing shipment", ar: "تجهيز الشحنة" } },
  { id: "ORD-6998", client: "CLT-00921", eta: { en: "Expected tomorrow", ar: "متوقع غدا" }, status: { en: "Shipped", ar: "تم الشحن" }, step: { en: "Awaiting receipt", ar: "بانتظار الاستلام" } },
  { id: "ORD-6981", client: "CLT-00118", eta: { en: "Expected May 9", ar: "متوقع 9 مايو" }, status: { en: "Confirmed", ar: "مؤكد" }, step: { en: "PO acknowledged", ar: "تم تأكيد أمر الشراء" } }
];

function SupplierFrame({
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
  const navItems = useSupplierNav();

  return (
    <PortalShell title={title} description={description} navItems={navItems} primaryActionLabel={actionLabel} primaryActionIcon={actionIcon}>
      {children}
    </PortalShell>
  );
}

export function SupplierRfqsPage() {
  const { t, i18n } = useTranslation("common");

  return (
    <SupplierFrame
      title={t("navigation.rfq_inbox")}
      description={localize({ en: "Anonymous requests assigned by MWRD operations", ar: "طلبات مجهولة مسندة من عمليات مورد" }, i18n.language)}
      actionLabel={t("actions.submit_quote")}
      actionIcon={<FileCheck2 className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Assigned RFQs", ar: "طلبات مسندة" }, i18n.language), value: "9", detail: localize({ en: "Open for response", ar: "مفتوحة للرد" }, i18n.language), trend: "+4", trendTone: "positive" },
          { label: localize({ en: "Due today", ar: "مستحقة اليوم" }, i18n.language), value: "2", detail: localize({ en: "Needs quote submission", ar: "تحتاج إرسال عرض" }, i18n.language), trend: "-1", trendTone: "negative" },
          { label: localize({ en: "Avg response", ar: "متوسط الاستجابة" }, i18n.language), value: "11h", detail: localize({ en: "Last 30 days", ar: "آخر 30 يوما" }, i18n.language), trend: "+2h", trendTone: "negative" },
          { label: localize({ en: "Eligible categories", ar: "فئات مؤهلة" }, i18n.language), value: "18", detail: localize({ en: "Matched supplier profile", ar: "مطابقة لملف المورد" }, i18n.language), trend: "+2", trendTone: "positive" }
        ]}
      />
      <DashboardToolbar searchPlaceholder={localize({ en: "Search assigned RFQs...", ar: "ابحث في طلبات التسعير المسندة..." }, i18n.language)} />
      <DashboardCard title={t("navigation.rfq_inbox")}>
        <DataTable
          rows={supplierRfqs}
          getRowKey={(row) => row.id}
          columns={[
            { header: "ID", cell: (row) => <span className="font-semibold">{row.id}</span> },
            { header: localize({ en: "Anonymous client", ar: "عميل مجهول" }, i18n.language), cell: (row) => <Badge variant="outline">{row.client}</Badge> },
            { header: localize({ en: "Scope", ar: "النطاق" }, i18n.language), cell: (row) => <span className="text-muted-foreground">{localize(row.scope, i18n.language)}</span> },
            { header: localize({ en: "Due", ar: "الاستحقاق" }, i18n.language), cell: (row) => <span>{row.due}</span> },
            { header: localize({ en: "Status", ar: "الحالة" }, i18n.language), cell: (row) => <StatusBadge tone={row.id === "SUP-RFQ-8842" ? "warning" : "neutral"}>{localize(row.status, i18n.language)}</StatusBadge> }
          ]}
        />
      </DashboardCard>
    </SupplierFrame>
  );
}

export function SupplierQuotesPage() {
  const { t, i18n } = useTranslation("common");

  return (
    <SupplierFrame
      title={t("navigation.quotes")}
      description={localize({ en: "Draft, submit, and track quote responses", ar: "إعداد وإرسال ومتابعة عروض الأسعار" }, i18n.language)}
      actionLabel={t("actions.submit_quote")}
      actionIcon={<FileCheck2 className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Draft quotes", ar: "عروض مسودة" }, i18n.language), value: "4", detail: localize({ en: "Awaiting completion", ar: "بانتظار الإكمال" }, i18n.language), trend: "+1", trendTone: "positive" },
          { label: localize({ en: "Submitted", ar: "مرسلة" }, i18n.language), value: "16", detail: localize({ en: "Under review", ar: "قيد المراجعة" }, i18n.language), trend: "+6", trendTone: "positive" },
          { label: localize({ en: "Accepted", ar: "مقبولة" }, i18n.language), value: "5", detail: localize({ en: "Converted this month", ar: "تحولت هذا الشهر" }, i18n.language), trend: "+2", trendTone: "positive" },
          { label: localize({ en: "Win rate", ar: "معدل الفوز" }, i18n.language), value: "31%", detail: localize({ en: "Last 30 days", ar: "آخر 30 يوما" }, i18n.language), trend: "+3.2%", trendTone: "positive" }
        ]}
      />
      <DashboardCard title={localize({ en: "Quote workspace", ar: "مساحة العروض" }, i18n.language)}>
        <DataTable
          rows={supplierQuotes}
          getRowKey={(row) => row.id}
          columns={[
            { header: "ID", cell: (row) => <span className="font-semibold">{row.id}</span> },
            { header: "RFQ", cell: (row) => <span>{row.rfqId}</span> },
            { header: localize({ en: "Supplier total", ar: "إجمالي المورد" }, i18n.language), cell: (row) => <span className="font-semibold">{row.total}</span> },
            { header: localize({ en: "Validity", ar: "الصلاحية" }, i18n.language), cell: (row) => <span className="text-muted-foreground">{localize(row.validity, i18n.language)}</span> },
            { header: localize({ en: "Status", ar: "الحالة" }, i18n.language), cell: (row) => <StatusBadge tone={row.id === "Q-DRAFT-210" ? "warning" : "info"}>{localize(row.status, i18n.language)}</StatusBadge> }
          ]}
        />
      </DashboardCard>
    </SupplierFrame>
  );
}

export function SupplierOrdersPage() {
  const { t, i18n } = useTranslation("common");

  return (
    <SupplierFrame
      title={t("navigation.orders")}
      description={localize({ en: "Fulfillment updates for awarded orders", ar: "تحديثات تنفيذ الطلبات المعتمدة" }, i18n.language)}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Active orders", ar: "طلبات نشطة" }, i18n.language), value: "14", detail: localize({ en: "Requiring updates", ar: "تحتاج تحديثات" }, i18n.language), trend: "+8%", trendTone: "positive" },
          { label: localize({ en: "Shipping today", ar: "شحن اليوم" }, i18n.language), value: "3", detail: localize({ en: "Ready for dispatch", ar: "جاهزة للإرسال" }, i18n.language), trend: "+1", trendTone: "positive" },
          { label: localize({ en: "Receipt pending", ar: "استلام معلق" }, i18n.language), value: "5", detail: localize({ en: "Waiting client confirmation", ar: "بانتظار تأكيد العميل" }, i18n.language), trend: "-2", trendTone: "negative" },
          { label: localize({ en: "On-time", ar: "في الموعد" }, i18n.language), value: "94%", detail: localize({ en: "Fulfillment score", ar: "درجة التنفيذ" }, i18n.language), trend: "+4%", trendTone: "positive" }
        ]}
      />
      <DashboardCard title={localize({ en: "Fulfillment queue", ar: "قائمة التنفيذ" }, i18n.language)}>
        <DataTable
          rows={supplierOrders}
          getRowKey={(row) => row.id}
          columns={[
            { header: "ID", cell: (row) => <span className="font-semibold">{row.id}</span> },
            { header: localize({ en: "Anonymous client", ar: "عميل مجهول" }, i18n.language), cell: (row) => <Badge variant="outline">{row.client}</Badge> },
            { header: localize({ en: "Step", ar: "المرحلة" }, i18n.language), cell: (row) => <span>{localize(row.step, i18n.language)}</span> },
            { header: "ETA", cell: (row) => <span className="text-muted-foreground">{localize(row.eta, i18n.language)}</span> },
            { header: localize({ en: "Status", ar: "الحالة" }, i18n.language), cell: (row) => <StatusBadge tone="info">{localize(row.status, i18n.language)}</StatusBadge> }
          ]}
        />
      </DashboardCard>
    </SupplierFrame>
  );
}

export function SupplierPerformancePage() {
  const { t, i18n } = useTranslation("common");

  return (
    <SupplierFrame
      title={t("navigation.performance")}
      description={localize({ en: "Response quality, conversion, and fulfillment reliability", ar: "جودة الاستجابة والتحويل وموثوقية التنفيذ" }, i18n.language)}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Response rate", ar: "معدل الاستجابة" }, i18n.language), value: "92%", detail: localize({ en: "Last 30 days", ar: "آخر 30 يوما" }, i18n.language), trend: "+2.4%", trendTone: "positive" },
          { label: localize({ en: "Win rate", ar: "معدل الفوز" }, i18n.language), value: "31%", detail: localize({ en: "Accepted quotes", ar: "عروض مقبولة" }, i18n.language), trend: "+3.2%", trendTone: "positive" },
          { label: localize({ en: "On-time delivery", ar: "التسليم في الموعد" }, i18n.language), value: "94%", detail: localize({ en: "Active order history", ar: "سجل الطلبات النشطة" }, i18n.language), trend: "+4%", trendTone: "positive" },
          { label: localize({ en: "Admin exceptions", ar: "استثناءات الإدارة" }, i18n.language), value: "1", detail: localize({ en: "Needs cleanup", ar: "تحتاج معالجة" }, i18n.language), trend: "-2", trendTone: "positive" }
        ]}
      />
      <section className="grid gap-5 xl:grid-cols-2">
        <DashboardCard title={localize({ en: "Response trend", ar: "اتجاه الاستجابة" }, i18n.language)}>
          <SparkBars values={[58, 71, 66, 74, 82, 69, 78, 84, 77, 88, 91, 92]} tone="cyan" />
        </DashboardCard>
        <DashboardCard title={localize({ en: "Fulfillment mix", ar: "توزيع التنفيذ" }, i18n.language)}>
          <div className="grid gap-3">
            {[
              { label: localize({ en: "Delivered on time", ar: "تم التسليم في الموعد" }, i18n.language), value: "94%" },
              { label: localize({ en: "Awaiting client receipt", ar: "بانتظار استلام العميل" }, i18n.language), value: "5%" },
              { label: localize({ en: "Needs review", ar: "تحتاج مراجعة" }, i18n.language), value: "1%" }
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-lg bg-muted/60 p-3">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="text-lg font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </DashboardCard>
      </section>
    </SupplierFrame>
  );
}
