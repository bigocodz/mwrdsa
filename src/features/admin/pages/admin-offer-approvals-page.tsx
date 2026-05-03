import { useMutation, usePaginatedQuery } from "convex/react";
import { Check, Loader2, PackageCheck, PackagePlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAdminNav } from "@/features/admin/hooks/use-admin-nav";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type SubmitMessage = { tone: "success" | "error"; text: string };

function localizePair(ar: string | undefined | null, en: string | undefined | null, language: string) {
  return language === "ar" ? ar || en || "" : en || ar || "";
}

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

function statusTone(status: string): "info" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "info";
  if (status === "pendingApproval" || status === "pending") return "warning";
  if (status === "rejected" || status === "suspended") return "danger";
  return "neutral";
}

function statusLabel(status: string, language: string) {
  const labels: Record<string, { en: string; ar: string }> = {
    pendingApproval: { en: "Pending approval", ar: "بانتظار الموافقة" },
    pending: { en: "Pending", ar: "بانتظار المراجعة" },
    approved: { en: "Approved", ar: "معتمد" },
    rejected: { en: "Rejected", ar: "مرفوض" },
    suspended: { en: "Suspended", ar: "معلق" }
  };
  return localize(labels[status] ?? { en: status, ar: status }, language);
}

function messageClassName(tone: SubmitMessage["tone"]) {
  return cn("rounded-lg border px-3 py-2 text-sm font-semibold", tone === "success" ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive");
}

export function AdminOfferApprovalsPage() {
  const { t, i18n } = useTranslation("common");
  const language = i18n.language;
  const navItems = useAdminNav();
  const { user } = useAuth();
  const canManageCatalog = Boolean(user && hasPermission(user.roles, "catalog:manage"));
  const queryArgs = useMemo(() => (isBetterAuthConfigured && user && canManageCatalog ? { actorUserId: user.id as Id<"users"> } : "skip"), [canManageCatalog, user]);
  const {
    results: offerApprovals,
    status: offerStatus,
    loadMore: loadMoreOfferApprovals
  } = usePaginatedQuery(api.offers.listPendingOfferApprovalsPaginated, queryArgs, { initialNumItems: 40 });
  const {
    results: productRequests,
    status: productRequestStatus,
    loadMore: loadMoreProductRequests
  } = usePaginatedQuery(api.offers.listProductAdditionRequestsForAdminPaginated, queryArgs, { initialNumItems: 30 });
  const decideSupplierOffer = useMutation(api.offers.decideSupplierOffer);
  const decideProductAdditionRequest = useMutation(api.offers.decideProductAdditionRequest);
  const [message, setMessage] = useState<SubmitMessage | null>(null);
  const [pendingOfferId, setPendingOfferId] = useState<Id<"supplierOffers"> | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<Id<"productAdditionRequests"> | null>(null);
  const canLoadMoreOfferApprovals = offerStatus === "CanLoadMore";
  const isLoadingMoreOfferApprovals = offerStatus === "LoadingMore";
  const canLoadMoreProductRequests = productRequestStatus === "CanLoadMore";
  const isLoadingMoreProductRequests = productRequestStatus === "LoadingMore";

  const totals = useMemo(() => {
    const averageCost = offerApprovals.length > 0 ? offerApprovals.reduce((sum, offer) => sum + offer.unitCost, 0) / offerApprovals.length : 0;
    return {
      pendingOffers: offerApprovals.length,
      pendingRequests: productRequests.length,
      autoQuote: offerApprovals.filter((offer) => offer.autoQuoteEnabled).length,
      averageCost
    };
  }, [offerApprovals, productRequests.length]);

  async function handleOfferDecision(offerId: Id<"supplierOffers">, status: "approved" | "rejected" | "suspended") {
    if (!isBetterAuthConfigured || !user) return;
    let reason: string | undefined;
    if (status !== "approved") {
      const input = window.prompt(localize({ en: "Decision reason", ar: "سبب القرار" }, language)) ?? "";
      reason = input.trim();
      if (!reason) {
        setMessage({ tone: "error", text: localize({ en: "A reason is required.", ar: "السبب مطلوب." }, language) });
        return;
      }
    }
    setPendingOfferId(offerId);
    setMessage(null);
    try {
      await decideSupplierOffer({ actorUserId: user.id as Id<"users">, offerId, status, reason });
      setMessage({ tone: "success", text: localize({ en: "Supplier offer decision saved.", ar: "تم حفظ قرار عرض المورد." }, language) });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : localize({ en: "Could not save decision.", ar: "تعذر حفظ القرار." }, language) });
    } finally {
      setPendingOfferId(null);
    }
  }

  async function handleProductRequestDecision(requestId: Id<"productAdditionRequests">, decision: "approved" | "rejected") {
    if (!isBetterAuthConfigured || !user) return;
    let reason: string | undefined;
    if (decision === "rejected") {
      const input = window.prompt(localize({ en: "Rejection reason", ar: "سبب الرفض" }, language)) ?? "";
      reason = input.trim();
      if (!reason) {
        setMessage({ tone: "error", text: localize({ en: "A reason is required.", ar: "السبب مطلوب." }, language) });
        return;
      }
    }
    setPendingRequestId(requestId);
    setMessage(null);
    try {
      await decideProductAdditionRequest({ actorUserId: user.id as Id<"users">, requestId, decision, reason });
      setMessage({ tone: "success", text: localize({ en: "Product request decision saved.", ar: "تم حفظ قرار طلب المنتج." }, language) });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : localize({ en: "Could not save decision.", ar: "تعذر حفظ القرار." }, language) });
    } finally {
      setPendingRequestId(null);
    }
  }

  return (
    <PortalShell title={t("navigation.offers")} description={localize({ en: "Approve supplier rate cards and product additions before auto-quote use", ar: "اعتماد عروض الموردين وطلبات المنتجات قبل استخدامها في التسعير الآلي" }, language)} navItems={navItems}>
      {!canManageCatalog ? (
        <DashboardCard title={localize({ en: "Catalog approval restricted", ar: "موافقة الكتالوج مقيدة" }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Your role cannot approve supplier offers or product additions.", ar: "دورك الحالي لا يسمح باعتماد عروض الموردين أو إضافات المنتجات." }, language)}</p>
        </DashboardCard>
      ) : (
        <>
          <StatStrip
            stats={[
              { label: localize({ en: "Offer approvals", ar: "موافقات العروض" }, language), value: String(totals.pendingOffers), detail: localize({ en: "Pending admin decision", ar: "بانتظار قرار الإدارة" }, language), trendTone: "neutral" },
              { label: localize({ en: "Product requests", ar: "طلبات المنتجات" }, language), value: String(totals.pendingRequests), detail: localize({ en: "Supplier additions", ar: "إضافات الموردين" }, language), trendTone: "neutral" },
              { label: localize({ en: "Auto-quote toggled", ar: "تسعير آلي مفعل" }, language), value: String(totals.autoQuote), detail: localize({ en: "Awaiting approval", ar: "بانتظار الاعتماد" }, language), trendTone: "positive" },
              { label: localize({ en: "Average unit cost", ar: "متوسط تكلفة الوحدة" }, language), value: formatCurrency(totals.averageCost, language), detail: localize({ en: "Loaded offer queue", ar: "ضمن قائمة العروض" }, language) }
            ]}
          />
          {message ? <p className={messageClassName(message.tone)}>{message.text}</p> : null}

          <DashboardCard title={localize({ en: "Supplier offer approval queue", ar: "قائمة اعتماد عروض الموردين" }, language)} description={localize({ en: "Approved offers become eligible for the future auto-quote engine. Supplier costs remain hidden from clients.", ar: "العروض المعتمدة تصبح مؤهلة لمحرك التسعير الآلي لاحقاً. تبقى تكاليف المورد مخفية عن العملاء." }, language)}>
            <DataTable
              rows={offerApprovals}
              emptyLabel={offerStatus === "LoadingFirstPage" ? localize({ en: "Loading supplier offers...", ar: "جار تحميل عروض الموردين..." }, language) : localize({ en: "No pending supplier offers.", ar: "لا توجد عروض مورد بانتظار الموافقة." }, language)}
              getRowKey={(offer) => offer._id}
              columns={[
                { header: localize({ en: "Supplier", ar: "المورد" }, language), cell: (offer) => <Badge variant="outline">{offer.supplierAnonymousId}</Badge> },
                { header: "SKU", cell: (offer) => <span className="font-semibold">{offer.product?.sku ?? "—"}</span> },
                { header: localize({ en: "Product", ar: "المنتج" }, language), cell: (offer) => <span>{localizePair(offer.product?.nameAr, offer.product?.nameEn, language)}</span> },
                { header: localize({ en: "Unit cost", ar: "تكلفة الوحدة" }, language), cell: (offer) => <span className="font-semibold">{formatCurrency(offer.unitCost, language)}</span> },
                { header: localize({ en: "Lead time", ar: "زمن التوريد" }, language), cell: (offer) => <span>{`${offer.leadTimeDays} ${localize({ en: "d", ar: "يوم" }, language)}`}</span> },
                { header: localize({ en: "Auto", ar: "آلي" }, language), cell: (offer) => <StatusBadge tone={offer.autoQuoteEnabled ? "info" : "neutral"}>{offer.autoQuoteEnabled ? localize({ en: "On", ar: "مفعل" }, language) : localize({ en: "Off", ar: "متوقف" }, language)}</StatusBadge> },
                {
                  header: localize({ en: "Action", ar: "الإجراء" }, language),
                  className: "text-end",
                  cell: (offer) => (
                    <div className="inline-flex items-center justify-end gap-2">
                      <Button type="button" size="sm" disabled={pendingOfferId === offer._id} onClick={() => void handleOfferDecision(offer._id, "approved")}>
                        {pendingOfferId === offer._id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                        {localize({ en: "Approve", ar: "اعتماد" }, language)}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={pendingOfferId === offer._id} onClick={() => void handleOfferDecision(offer._id, "rejected")}>
                        <X className="size-4" aria-hidden="true" />
                        {localize({ en: "Reject", ar: "رفض" }, language)}
                      </Button>
                    </div>
                  )
                }
              ]}
            />
            {canLoadMoreOfferApprovals || isLoadingMoreOfferApprovals ? (
              <div className="mt-4 flex justify-center">
                <Button type="button" variant="outline" disabled={isLoadingMoreOfferApprovals} onClick={() => loadMoreOfferApprovals(40)}>
                  {isLoadingMoreOfferApprovals ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PackageCheck className="size-4" aria-hidden="true" />}
                  {localize({ en: "Load more offers", ar: "تحميل المزيد من العروض" }, language)}
                </Button>
              </div>
            ) : null}
          </DashboardCard>

          <DashboardCard title={localize({ en: "Product addition requests", ar: "طلبات إضافة المنتجات" }, language)}>
            <DataTable
              rows={productRequests}
              emptyLabel={productRequestStatus === "LoadingFirstPage" ? localize({ en: "Loading product requests...", ar: "جار تحميل طلبات المنتجات..." }, language) : localize({ en: "No pending product requests.", ar: "لا توجد طلبات منتجات بانتظار المراجعة." }, language)}
              getRowKey={(request) => request._id}
              columns={[
                { header: localize({ en: "Supplier", ar: "المورد" }, language), cell: (request) => <Badge variant="outline">{request.supplierAnonymousId}</Badge> },
                { header: "SKU", cell: (request) => <span className="font-semibold">{request.sku ?? "—"}</span> },
                { header: localize({ en: "Product", ar: "المنتج" }, language), cell: (request) => <span>{localizePair(request.nameAr, request.nameEn, language)}</span> },
                { header: localize({ en: "Category", ar: "الفئة" }, language), cell: (request) => <span className="text-muted-foreground">{localizePair(request.category?.nameAr, request.category?.nameEn, language) || "—"}</span> },
                { header: localize({ en: "Submitted", ar: "تاريخ الإرسال" }, language), cell: (request) => <span>{formatDate(request.createdAt, language)}</span> },
                { header: localize({ en: "Status", ar: "الحالة" }, language), cell: (request) => <StatusBadge tone={statusTone(request.status)}>{statusLabel(request.status, language)}</StatusBadge> },
                {
                  header: localize({ en: "Action", ar: "الإجراء" }, language),
                  className: "text-end",
                  cell: (request) => (
                    <div className="inline-flex items-center justify-end gap-2">
                      <Button type="button" size="sm" disabled={pendingRequestId === request._id} onClick={() => void handleProductRequestDecision(request._id, "approved")}>
                        {pendingRequestId === request._id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PackagePlus className="size-4" aria-hidden="true" />}
                        {localize({ en: "Create product", ar: "إنشاء المنتج" }, language)}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={pendingRequestId === request._id} onClick={() => void handleProductRequestDecision(request._id, "rejected")}>
                        <X className="size-4" aria-hidden="true" />
                        {localize({ en: "Reject", ar: "رفض" }, language)}
                      </Button>
                    </div>
                  )
                }
              ]}
            />
            {canLoadMoreProductRequests || isLoadingMoreProductRequests ? (
              <div className="mt-4 flex justify-center">
                <Button type="button" variant="outline" disabled={isLoadingMoreProductRequests} onClick={() => loadMoreProductRequests(30)}>
                  {isLoadingMoreProductRequests ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PackagePlus className="size-4" aria-hidden="true" />}
                  {localize({ en: "Load more requests", ar: "تحميل المزيد من الطلبات" }, language)}
                </Button>
              </div>
            ) : null}
          </DashboardCard>
        </>
      )}
    </PortalShell>
  );
}
