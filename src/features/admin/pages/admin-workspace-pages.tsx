import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Loader2, Send, UserPlus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAdminNav } from "@/features/admin/hooks/use-admin-nav";
import { CatalogManagementPage } from "@/features/admin/pages/catalog-management-page";
import { OrganizationDirectoryPage } from "@/features/admin/pages/organization-directory-page";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

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

function rfqStageTone(status: string) {
  if (status === "released" || status === "selected" || status === "poGenerated") return "info";
  if (status === "expired") return "danger";
  if (status === "adminReview") return "warning";
  return "neutral";
}

function rfqStageLabel(status: string, language: string) {
  const map: Record<string, { en: string; ar: string }> = {
    submitted: { en: "Submitted", ar: "تم الإرسال" },
    matching: { en: "Matching suppliers", ar: "مطابقة الموردين" },
    assigned: { en: "Suppliers assigned", ar: "تم إسناد موردين" },
    quoting: { en: "Quoting", ar: "قيد التسعير" },
    adminReview: { en: "Admin review", ar: "مراجعة الإدارة" },
    released: { en: "Released", ar: "تم الإصدار" },
    selected: { en: "Selected", ar: "تم الاختيار" },
    poGenerated: { en: "PO generated", ar: "تم إصدار أمر الشراء" },
    expired: { en: "Expired", ar: "منتهي" }
  };
  return localize(map[status] ?? { en: status, ar: status }, language);
}

function defaultDeadlineDate() {
  const date = new Date(Date.now() + 1000 * 60 * 60 * 72);
  return date.toISOString().slice(0, 10);
}

export function AdminOperationsPage() {
  const { t, i18n } = useTranslation("common");
  const language = i18n.language;
  const { user } = useAuth();
  const queryArgs = isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip";
  const operations = useQuery(api.rfqs.listOperationsRfqs, queryArgs);
  const suppliers = useQuery(api.rfqs.listSupplierOrgsForMatching, queryArgs);
  const assignSupplier = useMutation(api.rfqs.assignSupplierToRfq);
  const [searchValue, setSearchValue] = useState("");
  const [expandedId, setExpandedId] = useState<Id<"rfqs"> | null>(null);
  const [supplierSelections, setSupplierSelections] = useState<Record<string, string>>({});
  const [deadlineSelections, setDeadlineSelections] = useState<Record<string, string>>({});
  const [pendingAssignId, setPendingAssignId] = useState<Id<"rfqs"> | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [reportNow] = useState(() => Date.now());

  const rows = useMemo(() => {
    const source = operations ?? [];
    const search = searchValue.trim().toLowerCase();
    if (!search) return source;
    return source.filter((rfq) =>
      [rfq._id, rfq.clientAnonymousId, rfq.clientName, rfq.status].some((value) => value?.toString().toLowerCase().includes(search))
    );
  }, [operations, searchValue]);

  const totals = useMemo(() => {
    const source = operations ?? [];
    return {
      active: source.length,
      pendingReview: source.filter((rfq) => rfq.status === "adminReview").length,
      slaBreached: source.filter((rfq) => rfq.slaBreached).length,
      releasedToday: source.filter((rfq) => rfq.status === "released" && reportNow - rfq.updatedAt < 86_400_000).length
    };
  }, [operations, reportNow]);

  const expandedAssignments = useQuery(
    api.rfqs.listAssignmentsForRfq,
    isBetterAuthConfigured && user && expandedId ? { actorUserId: user.id as Id<"users">, rfqId: expandedId } : "skip"
  );

  async function handleAssign(rfqId: Id<"rfqs">) {
    if (!isBetterAuthConfigured || !user) return;
    const supplierId = supplierSelections[rfqId];
    const deadlineDate = deadlineSelections[rfqId] ?? defaultDeadlineDate();
    if (!supplierId) {
      setMessage({ tone: "error", text: localize({ en: "Choose a supplier first.", ar: "اختر مورداً أولاً." }, language) });
      return;
    }
    const deadlineMs = new Date(`${deadlineDate}T23:59:59`).getTime();
    setPendingAssignId(rfqId);
    setMessage(null);
    try {
      await assignSupplier({
        actorUserId: user.id as Id<"users">,
        rfqId,
        supplierOrganizationId: supplierId as Id<"organizations">,
        responseDeadline: deadlineMs
      });
      setSupplierSelections((current) => ({ ...current, [rfqId]: "" }));
      setMessage({ tone: "success", text: localize({ en: "Supplier assigned.", ar: "تم إسناد المورد." }, language) });
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({ tone: "error", text: text || localize({ en: "Could not assign supplier.", ar: "تعذر إسناد المورد." }, language) });
    } finally {
      setPendingAssignId(null);
    }
  }

  return (
    <AdminFrame
      title={t("navigation.operations")}
      description={localize({ en: "RFQ review, supplier matching, and quote release control", ar: "مراجعة طلبات التسعير ومطابقة الموردين وإصدار العروض" }, language)}
      actionLabel={t("actions.release_quotes")}
      actionIcon={<Send className="size-4" aria-hidden="true" />}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Active RFQs", ar: "طلبات نشطة" }, language), value: String(totals.active), detail: localize({ en: "In ops workflow", ar: "ضمن مسار العمليات" }, language) },
          { label: localize({ en: "Pending review", ar: "بانتظار المراجعة" }, language), value: String(totals.pendingReview), detail: localize({ en: "Need admin action", ar: "تحتاج إجراء إداري" }, language), trendTone: "positive" },
          { label: localize({ en: "SLA breached", ar: "تجاوزت اتفاقية الخدمة" }, language), value: String(totals.slaBreached), detail: localize({ en: "No assignments after 48h", ar: "بدون إسناد بعد 48 ساعة" }, language), trendTone: totals.slaBreached > 0 ? "neutral" : "positive" },
          { label: localize({ en: "Released today", ar: "مصدر اليوم" }, language), value: String(totals.releasedToday), detail: localize({ en: "Quote groups", ar: "مجموعات عروض" }, language), trendTone: "positive" }
        ]}
      />
      <DashboardToolbar
        searchPlaceholder={localize({ en: "Search operations...", ar: "ابحث في العمليات..." }, language)}
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
      <DashboardCard title={t("navigation.operations")}>
        <DataTable
          rows={rows}
          emptyLabel={operations === undefined ? localize({ en: "Loading operations...", ar: "جار تحميل العمليات..." }, language) : localize({ en: "No active RFQs.", ar: "لا توجد طلبات نشطة." }, language)}
          getRowKey={(rfq) => rfq._id}
          columns={[
            {
              header: "ID",
              cell: (rfq) => (
                <Link to={`/admin/operations/${rfq._id}`} className="font-semibold text-primary hover:underline">
                  {rfq._id.slice(-6).toUpperCase()}
                </Link>
              )
            },
            { header: localize({ en: "Client", ar: "العميل" }, language), cell: (rfq) => <Badge variant="outline">{rfq.clientAnonymousId}</Badge> },
            { header: localize({ en: "Items", ar: "البنود" }, language), cell: (rfq) => <span className="text-muted-foreground">{`${rfq.lineItemCount} × ${rfq.totalQuantity}`}</span> },
            {
              header: localize({ en: "Suppliers", ar: "الموردون" }, language),
              cell: (rfq) => <span>{`${rfq.acceptedAssignments}/${rfq.assignmentCount}`}</span>
            },
            {
              header: localize({ en: "Quotes", ar: "العروض" }, language),
              cell: (rfq) => <span>{`${rfq.submittedQuotes}/${rfq.quoteCount}`}</span>
            },
            {
              header: localize({ en: "Stage", ar: "المرحلة" }, language),
              cell: (rfq) => (
                <span className="inline-flex items-center gap-2">
                  <StatusBadge tone={rfqStageTone(rfq.status)}>{rfqStageLabel(rfq.status, language)}</StatusBadge>
                  {rfq.slaBreached ? <AlertTriangle className="size-4 text-destructive" aria-hidden="true" /> : null}
                </span>
              )
            },
            {
              header: localize({ en: "Action", ar: "الإجراء" }, language),
              className: "text-end",
              cell: (rfq) => (
                <Button type="button" size="sm" variant="ghost" onClick={() => setExpandedId((current) => (current === rfq._id ? null : rfq._id))}>
                  <UserPlus className="size-4" aria-hidden="true" />
                  {expandedId === rfq._id ? localize({ en: "Close", ar: "إغلاق" }, language) : localize({ en: "Match suppliers", ar: "إسناد موردين" }, language)}
                </Button>
              )
            }
          ]}
        />
      </DashboardCard>

      {expandedId ? (
        <DashboardCard
          title={localize({ en: "Supplier matching", ar: "إسناد الموردين" }, language)}
          description={localize({ en: "Assign suppliers and set their response deadlines.", ar: "أضف الموردين وحدد مواعيد ردهم." }, language)}
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto]">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {localize({ en: "Supplier", ar: "المورد" }, language)}
                <select
                  className="flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  value={supplierSelections[expandedId] ?? ""}
                  onChange={(event) => setSupplierSelections((current) => ({ ...current, [expandedId]: event.target.value }))}
                >
                  <option value="">{localize({ en: "Choose a supplier", ar: "اختر مورداً" }, language)}</option>
                  {(suppliers ?? []).map((supplier) => (
                    <option key={supplier._id} value={supplier._id}>
                      {supplier.supplierAnonymousId} — {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {localize({ en: "Response deadline", ar: "موعد الرد" }, language)}
                <Input
                  type="date"
                  value={deadlineSelections[expandedId] ?? defaultDeadlineDate()}
                  onChange={(event) => setDeadlineSelections((current) => ({ ...current, [expandedId]: event.target.value }))}
                />
              </label>
              <div className="flex items-end">
                <Button type="button" disabled={pendingAssignId === expandedId || !isBetterAuthConfigured} onClick={() => void handleAssign(expandedId)}>
                  {pendingAssignId === expandedId ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />}
                  {localize({ en: "Assign", ar: "إسناد" }, language)}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {localize({ en: "Current assignments", ar: "الإسنادات الحالية" }, language)}
              </p>
              {expandedAssignments === undefined ? (
                <p className="text-sm text-muted-foreground">{localize({ en: "Loading...", ar: "جار التحميل..." }, language)}</p>
              ) : expandedAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{localize({ en: "No suppliers assigned yet.", ar: "لم يتم إسناد موردين بعد." }, language)}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {expandedAssignments.map((assignment) => (
                    <li key={assignment._id} className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">{assignment.supplierAnonymousId}</span>
                        <span className="text-xs text-muted-foreground">{assignment.supplierName}</span>
                      </div>
                      <StatusBadge tone={assignment.status === "accepted" ? "info" : assignment.status === "declined" ? "danger" : "warning"}>
                        {assignment.status}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DashboardCard>
      ) : null}
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
      <OrganizationDirectoryPage organizationType="client" title={t("navigation.clients")} />
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
      <OrganizationDirectoryPage organizationType="supplier" title={t("navigation.suppliers")} />
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
      <CatalogManagementPage />
    </AdminFrame>
  );
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AdminAuditPage() {
  const { t, i18n } = useTranslation("common");
  const language = i18n.language;
  const { user } = useAuth();
  const queryArgs = isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip";
  const events = useQuery(api.audit.listAuditEventsForActor, queryArgs);
  const [searchValue, setSearchValue] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [reportNow] = useState(() => Date.now());

  const filteredEvents = useMemo(() => {
    const source = events ?? [];
    const search = searchValue.trim().toLowerCase();
    return source
      .filter((event) => (entityFilter ? event.entityType === entityFilter : true))
      .filter((event) =>
        search
          ? [event.action, event.entityType, event.entityId, event.summary].some((value) => value.toLowerCase().includes(search))
          : true
      );
  }, [events, searchValue, entityFilter]);

  const totals = useMemo(() => {
    const source = events ?? [];
    const dayMs = 24 * 60 * 60 * 1000;
    return {
      total: source.length,
      today: source.filter((entry) => reportNow - entry.createdAt < dayMs).length,
      overrides: source.filter((entry) => entry.action.includes("approved_for_release") || entry.action.includes("override")).length,
      releases: source.filter((entry) => entry.action === "rfq.quotes_released").length
    };
  }, [events, reportNow]);

  const entityTypes = useMemo(() => {
    const source = events ?? [];
    return Array.from(new Set(source.map((entry) => entry.entityType))).sort();
  }, [events]);

  return (
    <AdminFrame
      title={t("navigation.audit")}
      description={localize({ en: "Operational trace for controlled marketplace actions", ar: "سجل تشغيلي لإجراءات السوق المضبوطة" }, language)}
    >
      <StatStrip
        stats={[
          { label: localize({ en: "Total events", ar: "إجمالي الأحداث" }, language), value: String(totals.total), detail: localize({ en: "Across all entities", ar: "عبر كل الكيانات" }, language) },
          { label: localize({ en: "Logged today", ar: "مسجلة اليوم" }, language), value: String(totals.today), detail: localize({ en: "Last 24 hours", ar: "آخر 24 ساعة" }, language), trendTone: "positive" },
          { label: localize({ en: "Margin/release", ar: "هامش / إصدار" }, language), value: String(totals.overrides), detail: localize({ en: "Need retention", ar: "تتطلب حفظاً" }, language), trendTone: "positive" },
          { label: localize({ en: "Quotes released", ar: "إصدارات عروض" }, language), value: String(totals.releases), detail: localize({ en: "Quote group dispatches", ar: "إصدار مجموعات العروض" }, language) }
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <DashboardToolbar
          searchPlaceholder={localize({ en: "Search audit events...", ar: "ابحث في أحداث السجل..." }, language)}
          searchValue={searchValue}
          onSearchChange={(event) => setSearchValue(event.target.value)}
        />
        <select
          className="flex h-11 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          value={entityFilter}
          onChange={(event) => setEntityFilter(event.target.value)}
        >
          <option value="">{localize({ en: "All entities", ar: "كل الكيانات" }, language)}</option>
          {entityTypes.map((entity) => (
            <option key={entity} value={entity}>
              {entity}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={filteredEvents.length === 0}
          onClick={() =>
            downloadCsv(
              `mwrd-audit-${new Date().toISOString().slice(0, 10)}.csv`,
              filteredEvents.map((entry) => ({
                id: entry._id,
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId,
                summary: entry.summary,
                createdAt: new Date(entry.createdAt).toISOString()
              }))
            )
          }
        >
          {localize({ en: "Export CSV", ar: "تصدير CSV" }, language)}
        </Button>
      </div>
      <DashboardCard title={t("navigation.audit")}>
        <DataTable
          rows={filteredEvents}
          emptyLabel={events === undefined ? localize({ en: "Loading audit events...", ar: "جار تحميل السجل..." }, language) : localize({ en: "No audit events match.", ar: "لا توجد أحداث مطابقة." }, language)}
          getRowKey={(event) => event._id}
          columns={[
            { header: "ID", cell: (event) => <span className="font-semibold">{event._id.slice(-6).toUpperCase()}</span> },
            { header: localize({ en: "Action", ar: "الإجراء" }, language), cell: (event) => <span className="font-mono text-xs">{event.action}</span> },
            { header: localize({ en: "Entity", ar: "الكيان" }, language), cell: (event) => <Badge variant="outline">{event.entityType}</Badge> },
            { header: localize({ en: "Summary", ar: "الملخص" }, language), cell: (event) => <span className="text-sm">{event.summary}</span> },
            { header: localize({ en: "Time", ar: "الوقت" }, language), cell: (event) => <StatusBadge tone="neutral">{new Date(event.createdAt).toLocaleString()}</StatusBadge> }
          ]}
        />
      </DashboardCard>
    </AdminFrame>
  );
}
