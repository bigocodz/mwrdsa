import { useQuery } from "convex/react";
import { CalendarDays, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, StatStrip, StatusBadge } from "@/components/portal-ui";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";

function formatCurrency(amount: number, language: string) {
  return new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2
  }).format(amount);
}

function formatDate(timestamp: number, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

export function ClientQuotesPage() {
  const { t, i18n } = useTranslation(["common", "quotes"]);
  const navItems = useClientNav();
  const { user } = useAuth();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip";
  const releasedRfqs = useQuery(api.quotes.listReleasedRfqsForClient, queryArgs);
  const [searchValue, setSearchValue] = useState("");

  const rows = useMemo(() => {
    const source = releasedRfqs ?? [];
    const search = searchValue.trim().toLowerCase();
    if (!search) return source;
    return source.filter((rfq) => [rfq._id, rfq.status].some((value) => value?.toLowerCase().includes(search)));
  }, [releasedRfqs, searchValue]);

  const totals = useMemo(() => {
    const source = releasedRfqs ?? [];
    return {
      released: source.length,
      pendingDecision: source.filter((rfq) => rfq.status === "released" && rfq.selectedCount === 0).length,
      decided: source.filter((rfq) => rfq.status === "selected" || rfq.status === "poGenerated").length,
      anonymizedQuotes: source.reduce((sum, rfq) => sum + rfq.releasedQuoteCount, 0)
    };
  }, [releasedRfqs]);

  return (
    <PortalShell title={t("quotes:title")} description={t("quotes:description")} navItems={navItems}>
      <StatStrip
        stats={[
          { label: localize({ en: "Released RFQs", ar: "طلبات مصدرة" }, language), value: String(totals.released), detail: localize({ en: "Quote groups available", ar: "مجموعات عروض متاحة" }, language) },
          { label: localize({ en: "Pending decision", ar: "بانتظار القرار" }, language), value: String(totals.pendingDecision), detail: localize({ en: "Awaiting your selection", ar: "بانتظار اختيارك" }, language), trendTone: "positive" },
          { label: localize({ en: "Locked / decided", ar: "محسومة / مقفلة" }, language), value: String(totals.decided), detail: localize({ en: "Selection captured", ar: "تم تسجيل الاختيار" }, language), trendTone: "positive" },
          { label: localize({ en: "Anonymized suppliers", ar: "موردون مجهولون" }, language), value: String(totals.anonymizedQuotes), detail: localize({ en: "Across released groups", ar: "ضمن المجموعات المصدرة" }, language) }
        ]}
      />

      <DashboardToolbar
        searchPlaceholder={localize({ en: "Search released RFQs...", ar: "ابحث في الطلبات المصدرة..." }, language)}
        searchValue={searchValue}
        onSearchChange={(event) => setSearchValue(event.target.value)}
      />

      <DashboardCard title={localize({ en: "Released quote groups", ar: "مجموعات العروض المصدرة" }, language)} description={localize({ en: "Open a group to compare anonymous quotes side-by-side and lock your selection.", ar: "افتح مجموعة لمقارنة العروض المجهولة جنباً إلى جنب وقفل اختيارك." }, language)}>
        <DataTable
          rows={rows}
          emptyLabel={releasedRfqs === undefined ? localize({ en: "Loading...", ar: "جار التحميل..." }, language) : localize({ en: "No released quotes yet.", ar: "لا توجد عروض مصدرة بعد." }, language)}
          getRowKey={(rfq) => rfq._id}
          columns={[
            {
              header: "RFQ",
              cell: (rfq) => (
                <Link to={`/client/quotes/${rfq._id}`} className="font-semibold text-primary hover:underline">
                  {rfq._id.slice(-6).toUpperCase()}
                </Link>
              )
            },
            { header: localize({ en: "Released quotes", ar: "عروض مصدرة" }, language), cell: (rfq) => <span className="font-semibold">{rfq.releasedQuoteCount}</span> },
            { header: localize({ en: "Lowest total", ar: "أقل إجمالي" }, language), cell: (rfq) => <span>{formatCurrency(rfq.lowestClientTotal, language)}</span> },
            {
              header: localize({ en: "Required by", ar: "مطلوب بحلول" }, language),
              cell: (rfq) => (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  {rfq.requiredDeliveryDate ?? localize({ en: "Not specified", ar: "غير محدد" }, language)}
                </span>
              )
            },
            {
              header: localize({ en: "Status", ar: "الحالة" }, language),
              cell: (rfq) => (
                <StatusBadge tone={rfq.status === "selected" || rfq.status === "poGenerated" ? "info" : "warning"}>
                  {rfq.status === "selected" ? localize({ en: "Selected", ar: "تم الاختيار" }, language) : rfq.status === "poGenerated" ? localize({ en: "PO generated", ar: "تم إصدار أمر الشراء" }, language) : localize({ en: "Pending decision", ar: "بانتظار القرار" }, language)}
                </StatusBadge>
              )
            },
            {
              header: localize({ en: "Released", ar: "تاريخ الإصدار" }, language),
              cell: (rfq) => <span className="text-muted-foreground">{formatDate(rfq.updatedAt, language)}</span>
            },
            {
              header: localize({ en: "Action", ar: "الإجراء" }, language),
              className: "text-end",
              cell: (rfq) => (
                <Link to={`/client/quotes/${rfq._id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                  <ScrollText className="size-4" aria-hidden="true" />
                  {localize({ en: "Compare", ar: "مقارنة" }, language)}
                </Link>
              )
            }
          ]}
        />
      </DashboardCard>
    </PortalShell>
  );
}
