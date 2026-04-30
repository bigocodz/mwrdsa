import { useMutation, useQuery } from "convex/react";
import { Check, FileCheck2, Loader2, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, SparkBars, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useSupplierNav } from "@/features/supplier/hooks/use-supplier-nav";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";


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

function assignmentTone(status: string) {
  if (status === "accepted") return "info";
  if (status === "declined" || status === "expired") return "danger";
  return "warning";
}

function assignmentLabel(status: string, language: string) {
  if (status === "accepted") return localize({ en: "Accepted", ar: "مقبول" }, language);
  if (status === "declined") return localize({ en: "Declined", ar: "مرفوض" }, language);
  if (status === "expired") return localize({ en: "Expired", ar: "منتهي" }, language);
  return localize({ en: "Awaiting response", ar: "بانتظار الرد" }, language);
}

function formatDate(timestamp: number, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

export function SupplierRfqsPage() {
  const { t, i18n } = useTranslation("common");
  const language = i18n.language;
  const { user } = useAuth();
  const queryArgs = isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip";
  const assignments = useQuery(api.quotes.listSupplierAssignments, queryArgs);
  const respond = useMutation(api.quotes.respondToAssignment);
  const [searchValue, setSearchValue] = useState("");
  const [pendingId, setPendingId] = useState<Id<"supplierRfqAssignments"> | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const rows = useMemo(() => {
    const source = assignments ?? [];
    const search = searchValue.trim().toLowerCase();
    if (!search) {
      return source;
    }
    return source.filter((entry) =>
      [entry.rfq?.clientAnonymousId, entry.rfq?._id, entry.status]
        .some((value) => value?.toString().toLowerCase().includes(search))
    );
  }, [assignments, searchValue]);

  const totals = useMemo(() => {
    const open = (assignments ?? []).filter((entry) => entry.status === "assigned").length;
    const accepted = (assignments ?? []).filter((entry) => entry.status === "accepted").length;
    const declined = (assignments ?? []).filter((entry) => entry.status === "declined").length;
    const total = assignments?.length ?? 0;
    return { open, accepted, declined, total };
  }, [assignments]);

  async function handleRespond(assignmentId: Id<"supplierRfqAssignments">, response: "accepted" | "declined") {
    if (!isBetterAuthConfigured || !user) {
      return;
    }
    setMessage(null);

    let declineReason: string | undefined;
    if (response === "declined") {
      const promptLabel = localize(
        { en: "Reason for declining (required)?", ar: "سبب الرفض (مطلوب)؟" },
        language
      );
      const input = window.prompt(promptLabel) ?? "";
      const trimmed = input.trim();
      if (!trimmed) {
        setMessage({ tone: "error", text: localize({ en: "Decline reason is required.", ar: "سبب الرفض مطلوب." }, language) });
        return;
      }
      declineReason = trimmed;
    }

    setPendingId(assignmentId);
    try {
      await respond({
        actorUserId: user.id as Id<"users">,
        assignmentId,
        response,
        ...(declineReason ? { declineReason } : {})
      });
      setMessage({
        tone: "success",
        text:
          response === "accepted"
            ? localize({ en: "Assignment accepted.", ar: "تم قبول التعيين." }, language)
            : localize({ en: "Assignment declined.", ar: "تم رفض التعيين." }, language)
      });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "";
      setMessage({
        tone: "error",
        text: errorText || localize({ en: "Could not update the assignment.", ar: "تعذر تحديث التعيين." }, language)
      });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <SupplierFrame
      title={t("navigation.rfq_inbox")}
      description={localize({ en: "Anonymous requests assigned by MWRD operations", ar: "طلبات مجهولة مسندة من عمليات مورد" }, language)}
      actionLabel={t("actions.submit_quote")}
      actionIcon={<FileCheck2 className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Total assigned", ar: "إجمالي التعيينات" }, language), value: String(totals.total), detail: localize({ en: "All time", ar: "الإجمالي" }, language) },
          { label: localize({ en: "Awaiting response", ar: "بانتظار الرد" }, language), value: String(totals.open), detail: localize({ en: "Need accept or decline", ar: "تحتاج قبول أو رفض" }, language), trendTone: "positive" },
          { label: localize({ en: "Accepted", ar: "مقبولة" }, language), value: String(totals.accepted), detail: localize({ en: "In quoting workflow", ar: "ضمن مسار العروض" }, language), trendTone: "positive" },
          { label: localize({ en: "Declined", ar: "مرفوضة" }, language), value: String(totals.declined), detail: localize({ en: "With decline reasons", ar: "مع سبب الرفض" }, language), trendTone: "neutral" }
        ]}
      />
      <DashboardToolbar
        searchPlaceholder={localize({ en: "Search assigned RFQs...", ar: "ابحث في طلبات التسعير المسندة..." }, language)}
        searchValue={searchValue}
        onSearchChange={(event) => setSearchValue(event.target.value)}
      />
      {message ? (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-semibold",
            message.tone === "success"
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {message.text}
        </p>
      ) : null}
      <DashboardCard title={t("navigation.rfq_inbox")}>
        <DataTable
          rows={rows}
          emptyLabel={assignments === undefined ? localize({ en: "Loading assignments...", ar: "جار تحميل التعيينات..." }, language) : localize({ en: "No assignments yet.", ar: "لا توجد تعيينات بعد." }, language)}
          getRowKey={(entry) => entry._id}
          columns={[
            {
              header: "ID",
              cell: (entry) => (
                <Link to={`/supplier/rfqs/${entry._id}`} className="font-semibold text-primary hover:underline">
                  {entry.rfq ? entry.rfq._id.slice(-6).toUpperCase() : entry._id.slice(-6).toUpperCase()}
                </Link>
              )
            },
            {
              header: localize({ en: "Anonymous client", ar: "عميل مجهول" }, language),
              cell: (entry) => <Badge variant="outline">{entry.rfq?.clientAnonymousId ?? "—"}</Badge>
            },
            {
              header: localize({ en: "Items", ar: "البنود" }, language),
              cell: (entry) => (
                <span className="text-muted-foreground">{entry.rfq ? `${entry.rfq.lineItemCount} × ${entry.rfq.totalQuantity}` : "—"}</span>
              )
            },
            {
              header: localize({ en: "Required by", ar: "مطلوب بحلول" }, language),
              cell: (entry) => <span>{entry.rfq?.requiredDeliveryDate ?? localize({ en: "Not specified", ar: "غير محدد" }, language)}</span>
            },
            {
              header: localize({ en: "Response deadline", ar: "موعد الرد" }, language),
              cell: (entry) => <span className="text-muted-foreground">{formatDate(entry.responseDeadline, language)}</span>
            },
            {
              header: localize({ en: "Status", ar: "الحالة" }, language),
              cell: (entry) => <StatusBadge tone={assignmentTone(entry.status)}>{assignmentLabel(entry.status, language)}</StatusBadge>
            },
            {
              header: localize({ en: "Action", ar: "الإجراء" }, language),
              className: "text-end",
              cell: (entry) =>
                entry.status === "assigned" ? (
                  <div className="inline-flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pendingId === entry._id}
                      onClick={() => void handleRespond(entry._id, "accepted")}
                    >
                      {pendingId === entry._id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                      {localize({ en: "Accept", ar: "قبول" }, language)}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === entry._id}
                      onClick={() => void handleRespond(entry._id, "declined")}
                    >
                      <X className="size-4" aria-hidden="true" />
                      {localize({ en: "Decline", ar: "رفض" }, language)}
                    </Button>
                  </div>
                ) : entry.status === "declined" && entry.declineReason ? (
                  <span className="text-xs text-muted-foreground" title={entry.declineReason}>
                    {entry.declineReason.slice(0, 32)}
                    {entry.declineReason.length > 32 ? "…" : ""}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )
            }
          ]}
        />
      </DashboardCard>
    </SupplierFrame>
  );
}

function quoteOutcome(status: string): "won" | "lost" | "in_flight" {
  if (status === "selected") return "won";
  if (status === "lost" || status === "rejected" || status === "expired") return "lost";
  return "in_flight";
}

function quoteStatusTone(status: string) {
  const outcome = quoteOutcome(status);
  if (outcome === "won") return "info";
  if (outcome === "lost") return "danger";
  return "warning";
}

function quoteStatusLabel(status: string, language: string) {
  const labels: Record<string, { en: string; ar: string }> = {
    submitted: { en: "Submitted", ar: "مرسل" },
    underReview: { en: "Under review", ar: "قيد المراجعة" },
    approvedForRelease: { en: "Approved for release", ar: "موافق على الإصدار" },
    released: { en: "Released to client", ar: "معروض للعميل" },
    selected: { en: "Selected (won)", ar: "مختار (فائز)" },
    rejected: { en: "Rejected", ar: "مرفوض" },
    held: { en: "On hold", ar: "معلق" },
    expired: { en: "Expired", ar: "منتهي" },
    lost: { en: "Lost", ar: "خاسر" }
  };
  return localize(labels[status] ?? { en: status, ar: status }, language);
}

function formatCurrency(amount: number, language: string) {
  return new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2
  }).format(amount);
}

export function SupplierQuotesPage() {
  const { t, i18n } = useTranslation("common");
  const language = i18n.language;
  const { user } = useAuth();
  const queryArgs = isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip";
  const quotes = useQuery(api.quotes.listSupplierQuotesForActor, queryArgs);
  const [searchValue, setSearchValue] = useState("");

  const rows = useMemo(() => {
    const source = quotes ?? [];
    const search = searchValue.trim().toLowerCase();
    if (!search) {
      return source;
    }
    return source.filter((quote) =>
      [quote.rfqShortId, quote.clientAnonymousId, quote.status]
        .some((value) => value?.toString().toLowerCase().includes(search))
    );
  }, [quotes, searchValue]);

  const totals = useMemo(() => {
    const source = quotes ?? [];
    const submitted = source.length;
    const won = source.filter((quote) => quoteOutcome(quote.status) === "won").length;
    const lost = source.filter((quote) => quoteOutcome(quote.status) === "lost").length;
    const decided = won + lost;
    const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;
    return { submitted, won, lost, winRate };
  }, [quotes]);

  return (
    <SupplierFrame
      title={t("navigation.quotes")}
      description={localize({ en: "Draft, submit, and track quote responses", ar: "إعداد وإرسال ومتابعة عروض الأسعار" }, language)}
      actionLabel={t("actions.submit_quote")}
      actionIcon={<FileCheck2 className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Submitted quotes", ar: "العروض المرسلة" }, language), value: String(totals.submitted), detail: localize({ en: "All time", ar: "الإجمالي" }, language) },
          { label: localize({ en: "Won", ar: "فائزة" }, language), value: String(totals.won), detail: localize({ en: "Selected by clients", ar: "اختيرت من العملاء" }, language), trendTone: "positive" },
          { label: localize({ en: "Lost", ar: "خاسرة" }, language), value: String(totals.lost), detail: localize({ en: "Rejected, lost, or expired", ar: "مرفوضة أو خاسرة أو منتهية" }, language), trendTone: "neutral" },
          { label: localize({ en: "Win rate", ar: "معدل الفوز" }, language), value: `${totals.winRate}%`, detail: localize({ en: "Of decided quotes", ar: "من العروض المحسومة" }, language), trendTone: "positive" }
        ]}
      />
      <DashboardToolbar
        searchPlaceholder={localize({ en: "Search quotes...", ar: "ابحث في العروض..." }, language)}
        searchValue={searchValue}
        onSearchChange={(event) => setSearchValue(event.target.value)}
      />
      <DashboardCard title={localize({ en: "Quote workspace", ar: "مساحة العروض" }, language)}>
        <DataTable
          rows={rows}
          emptyLabel={quotes === undefined ? localize({ en: "Loading quotes...", ar: "جار تحميل العروض..." }, language) : localize({ en: "No quotes submitted yet.", ar: "لا توجد عروض مرسلة بعد." }, language)}
          getRowKey={(row) => row._id}
          columns={[
            { header: "RFQ", cell: (row) => <span className="font-semibold">{row.rfqShortId}</span> },
            { header: localize({ en: "Anonymous client", ar: "عميل مجهول" }, language), cell: (row) => <Badge variant="outline">{row.clientAnonymousId}</Badge> },
            { header: localize({ en: "Items", ar: "البنود" }, language), cell: (row) => <span className="text-muted-foreground">{row.lineItemCount}</span> },
            { header: localize({ en: "Supplier total", ar: "إجمالي المورد" }, language), cell: (row) => <span className="font-semibold">{formatCurrency(row.supplierTotal, language)}</span> },
            { header: localize({ en: "Lead time", ar: "زمن التسليم" }, language), cell: (row) => <span>{`${row.leadTimeDays} ${localize({ en: "d", ar: "يوم" }, language)}`}</span> },
            { header: localize({ en: "Valid until", ar: "صالح حتى" }, language), cell: (row) => <span className="text-muted-foreground">{row.validUntil}</span> },
            { header: localize({ en: "Outcome", ar: "النتيجة" }, language), cell: (row) => <StatusBadge tone={quoteStatusTone(row.status)}>{quoteStatusLabel(row.status, language)}</StatusBadge> }
          ]}
        />
      </DashboardCard>
    </SupplierFrame>
  );
}

function orderTone(status: string): "info" | "warning" | "danger" | "neutral" {
  if (status === "completed" || status === "receiptConfirmed" || status === "delivered") return "info";
  if (status === "disputed") return "danger";
  if (status === "delayed" || status === "pending") return "warning";
  return "neutral";
}

function orderLabel(status: string, language: string) {
  const map: Record<string, { en: string; ar: string }> = {
    pending: { en: "Pending", ar: "بانتظار التأكيد" },
    confirmed: { en: "Confirmed", ar: "مؤكد" },
    processing: { en: "Processing", ar: "قيد التجهيز" },
    shipped: { en: "Shipped", ar: "تم الشحن" },
    delivered: { en: "Delivered", ar: "تم التسليم" },
    receiptConfirmed: { en: "Receipt confirmed", ar: "تم تأكيد الاستلام" },
    completed: { en: "Completed", ar: "مكتمل" },
    disputed: { en: "Disputed", ar: "متنازع عليه" },
    delayed: { en: "Delayed", ar: "متأخر" }
  };
  return localize(map[status] ?? { en: status, ar: status }, language);
}

export function SupplierOrdersPage() {
  const { t, i18n } = useTranslation("common");
  const language = i18n.language;
  const { user } = useAuth();
  const queryArgs = isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip";
  const orders = useQuery(api.orders.listOrdersForSupplierActor, queryArgs);
  const [searchValue, setSearchValue] = useState("");

  const rows = useMemo(() => {
    const source = orders ?? [];
    const search = searchValue.trim().toLowerCase();
    if (!search) return source;
    return source.filter((order) => [order._id, order.clientAnonymousId, order.status].some((value) => value?.toString().toLowerCase().includes(search)));
  }, [orders, searchValue]);

  const totals = useMemo(() => {
    const source = orders ?? [];
    return {
      active: source.filter((order) => !["completed", "receiptConfirmed"].includes(order.status)).length,
      shippingToday: source.filter((order) => order.status === "shipped").length,
      receiptPending: source.filter((order) => order.status === "delivered").length,
      delayed: source.filter((order) => order.status === "delayed" || order.status === "disputed").length
    };
  }, [orders]);

  return (
    <SupplierFrame
      title={t("navigation.orders")}
      description={localize({ en: "Fulfillment updates for awarded orders", ar: "تحديثات تنفيذ الطلبات المعتمدة" }, language)}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Active orders", ar: "طلبات نشطة" }, language), value: String(totals.active), detail: localize({ en: "Requiring updates", ar: "تحتاج تحديثات" }, language) },
          { label: localize({ en: "Shipping in transit", ar: "بالشحن" }, language), value: String(totals.shippingToday), detail: localize({ en: "Awaiting delivery", ar: "بانتظار التسليم" }, language), trendTone: "positive" },
          { label: localize({ en: "Receipt pending", ar: "استلام معلق" }, language), value: String(totals.receiptPending), detail: localize({ en: "Waiting client confirmation", ar: "بانتظار تأكيد العميل" }, language), trendTone: "neutral" },
          { label: localize({ en: "Delayed / disputed", ar: "متأخرة / متنازع عليها" }, language), value: String(totals.delayed), detail: localize({ en: "Need attention", ar: "تحتاج معالجة" }, language), trendTone: totals.delayed > 0 ? "neutral" : "positive" }
        ]}
      />
      <DashboardToolbar
        searchPlaceholder={localize({ en: "Search orders...", ar: "ابحث في الطلبات..." }, language)}
        searchValue={searchValue}
        onSearchChange={(event) => setSearchValue(event.target.value)}
      />
      <DashboardCard title={localize({ en: "Fulfillment queue", ar: "قائمة التنفيذ" }, language)}>
        <DataTable
          rows={rows}
          emptyLabel={orders === undefined ? localize({ en: "Loading orders...", ar: "جار تحميل الطلبات..." }, language) : localize({ en: "No orders yet.", ar: "لا توجد طلبات بعد." }, language)}
          getRowKey={(order) => order._id}
          columns={[
            {
              header: "ID",
              cell: (order) => (
                <Link to={`/supplier/orders/${order._id}`} className="font-semibold text-primary hover:underline">
                  {order._id.slice(-6).toUpperCase()}
                </Link>
              )
            },
            { header: localize({ en: "Anonymous client", ar: "عميل مجهول" }, language), cell: (order) => <Badge variant="outline">{order.clientAnonymousId}</Badge> },
            { header: localize({ en: "Items", ar: "البنود" }, language), cell: (order) => <span className="text-muted-foreground">{order.lineItemCount}</span> },
            { header: localize({ en: "Total", ar: "الإجمالي" }, language), cell: (order) => <span className="font-semibold">{formatCurrency(order.clientTotal, language)}</span> },
            { header: localize({ en: "Status", ar: "الحالة" }, language), cell: (order) => <StatusBadge tone={orderTone(order.status)}>{orderLabel(order.status, language)}</StatusBadge> }
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
