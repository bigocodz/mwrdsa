import { usePaginatedQuery } from "convex/react";
import { FileText, Loader2, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DashboardToolbar, DataTable, StatStrip, StatusBadge } from "@/components/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function poTone(status: string): "info" | "warning" | "danger" | "neutral" {
  if (status === "approved" || status === "sentToSupplier") return "info";
  if (status === "rejected") return "danger";
  if (status === "pendingApproval" || status === "returnedForChanges") return "warning";
  return "neutral";
}

function poLabel(status: string, language: string) {
  const map: Record<string, { en: string; ar: string }> = {
    draft: { en: "Draft", ar: "مسودة" },
    pendingApproval: { en: "Pending approval", ar: "بانتظار الموافقة" },
    approved: { en: "Approved", ar: "معتمد" },
    sentToSupplier: { en: "Sent to supplier", ar: "أُرسل للمورد" },
    rejected: { en: "Rejected", ar: "مرفوض" },
    returnedForChanges: { en: "Returned for changes", ar: "مُعاد للتعديل" }
  };
  return localize(map[status] ?? { en: status, ar: status }, language);
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

export function ClientOrdersPage() {
  const { t, i18n } = useTranslation(["common", "orders"]);
  const navItems = useClientNav();
  const { user } = useAuth();
  const language = i18n.language;
  const queryArgs = useMemo(() => (isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip"), [user]);
  const {
    results: purchaseOrders,
    status: purchaseOrderStatus,
    loadMore: loadMorePurchaseOrders
  } = usePaginatedQuery(api.purchaseOrders.listPurchaseOrdersForActorPaginated, queryArgs, { initialNumItems: 40 });
  const {
    results: orders,
    status: orderStatusResult,
    loadMore: loadMoreOrders
  } = usePaginatedQuery(api.orders.listOrdersForClientActorPaginated, queryArgs, { initialNumItems: 40 });
  const [searchValue, setSearchValue] = useState("");
  const isLoadingPurchaseOrders = purchaseOrderStatus === "LoadingFirstPage";
  const canLoadMorePurchaseOrders = purchaseOrderStatus === "CanLoadMore";
  const isLoadingMorePurchaseOrders = purchaseOrderStatus === "LoadingMore";
  const isLoadingOrders = orderStatusResult === "LoadingFirstPage";
  const canLoadMoreOrders = orderStatusResult === "CanLoadMore";
  const isLoadingMoreOrders = orderStatusResult === "LoadingMore";

  const orderRows = useMemo(() => {
    const source = orders;
    const search = searchValue.trim().toLowerCase();
    if (!search) return source;
    return source.filter((order) => [order._id, order.supplierAnonymousId, order.status].some((value) => value?.toString().toLowerCase().includes(search)));
  }, [orders, searchValue]);

  const totals = useMemo(() => {
    const source = orders;
    return {
      active: source.filter((order) => !["completed", "receiptConfirmed"].includes(order.status)).length,
      pendingReceipt: source.filter((order) => order.status === "delivered").length,
      delayed: source.filter((order) => order.status === "delayed" || order.status === "disputed").length,
      completed: source.filter((order) => order.status === "completed" || order.status === "receiptConfirmed").length
    };
  }, [orders]);

  return (
    <PortalShell title={t("orders:title")} description={t("orders:description")} navItems={navItems}>
      <StatStrip
        stats={[
          { label: localize({ en: "Active orders", ar: "طلبات نشطة" }, language), value: String(totals.active), detail: localize({ en: "Processing or shipped", ar: "قيد التجهيز أو الشحن" }, language) },
          { label: localize({ en: "Pending receipt", ar: "بانتظار الاستلام" }, language), value: String(totals.pendingReceipt), detail: localize({ en: "Need your confirmation", ar: "تحتاج تأكيدك" }, language), trendTone: "positive" },
          { label: localize({ en: "Delayed / disputed", ar: "متأخرة / متنازع عليها" }, language), value: String(totals.delayed), detail: localize({ en: "Need attention", ar: "تحتاج معالجة" }, language), trendTone: totals.delayed > 0 ? "neutral" : "positive" },
          { label: localize({ en: "Completed", ar: "مكتملة" }, language), value: String(totals.completed), detail: localize({ en: "Closed orders", ar: "طلبات مغلقة" }, language), trendTone: "positive" }
        ]}
      />

      <DashboardToolbar
        searchPlaceholder={localize({ en: "Search orders...", ar: "ابحث في الطلبات..." }, language)}
        searchValue={searchValue}
        onSearchChange={(event) => setSearchValue(event.target.value)}
      />

      <DashboardCard
        title={localize({ en: "Purchase orders", ar: "أوامر الشراء" }, language)}
        description={localize({ en: "Generated from selected quotes — approve to send to the supplier.", ar: "تُنشأ من العروض المختارة — اعتمد لإرسالها للمورد." }, language)}
      >
        <DataTable
          rows={purchaseOrders}
          emptyLabel={isLoadingPurchaseOrders ? localize({ en: "Loading purchase orders...", ar: "جار تحميل أوامر الشراء..." }, language) : localize({ en: "No purchase orders yet.", ar: "لا توجد أوامر شراء بعد." }, language)}
          getRowKey={(po) => po._id}
          columns={[
            {
              header: "PO",
              cell: (po) => (
                <Link to={`/client/orders/po/${po._id}`} className="font-semibold text-primary hover:underline">
                  {po._id.slice(-6).toUpperCase()}
                </Link>
              )
            },
            { header: localize({ en: "Supplier", ar: "المورد" }, language), cell: (po) => <Badge variant="outline">{po.supplierAnonymousId}</Badge> },
            { header: localize({ en: "Total", ar: "الإجمالي" }, language), cell: (po) => <span className="font-semibold">{formatCurrency(po.clientTotal, language)}</span> },
            { header: localize({ en: "Status", ar: "الحالة" }, language), cell: (po) => <StatusBadge tone={poTone(po.status)}>{poLabel(po.status, language)}</StatusBadge> },
            {
              header: localize({ en: "Action", ar: "الإجراء" }, language),
              className: "text-end",
              cell: (po) => (
                <Link to={`/client/orders/po/${po._id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                  <FileText className="size-4" aria-hidden="true" />
                  {localize({ en: "Open", ar: "فتح" }, language)}
                </Link>
              )
            }
          ]}
        />
        {canLoadMorePurchaseOrders || isLoadingMorePurchaseOrders ? (
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="outline" disabled={isLoadingMorePurchaseOrders} onClick={() => loadMorePurchaseOrders(40)}>
              {isLoadingMorePurchaseOrders ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
              {localize({ en: "Load more purchase orders", ar: "تحميل المزيد من أوامر الشراء" }, language)}
            </Button>
          </div>
        ) : null}
      </DashboardCard>

      <DashboardCard title={localize({ en: "Order tracking", ar: "متابعة الطلبات" }, language)} description={localize({ en: "Confirm receipt or open a dispute from the order detail.", ar: "أكد الاستلام أو افتح نزاعاً من تفاصيل الطلب." }, language)}>
        <DataTable
          rows={orderRows}
          emptyLabel={isLoadingOrders ? localize({ en: "Loading orders...", ar: "جار تحميل الطلبات..." }, language) : localize({ en: "No orders yet.", ar: "لا توجد طلبات بعد." }, language)}
          getRowKey={(order) => order._id}
          columns={[
            {
              header: "ID",
              cell: (order) => (
                <Link to={`/client/orders/${order._id}`} className="font-semibold text-primary hover:underline">
                  {order._id.slice(-6).toUpperCase()}
                </Link>
              )
            },
            { header: localize({ en: "Supplier", ar: "المورد" }, language), cell: (order) => <Badge variant="outline">{order.supplierAnonymousId}</Badge> },
            { header: localize({ en: "Items", ar: "البنود" }, language), cell: (order) => <span className="text-muted-foreground">{order.lineItemCount}</span> },
            { header: localize({ en: "Total", ar: "الإجمالي" }, language), cell: (order) => <span className="font-semibold">{formatCurrency(order.clientTotal, language)}</span> },
            { header: localize({ en: "Status", ar: "الحالة" }, language), cell: (order) => <StatusBadge tone={orderTone(order.status)}>{orderLabel(order.status, language)}</StatusBadge> },
            {
              header: localize({ en: "Action", ar: "الإجراء" }, language),
              className: "text-end",
              cell: (order) => (
                <Link to={`/client/orders/${order._id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                  <Truck className="size-4" aria-hidden="true" />
                  {localize({ en: "Track", ar: "متابعة" }, language)}
                </Link>
              )
            }
          ]}
        />
        {canLoadMoreOrders || isLoadingMoreOrders ? (
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="outline" disabled={isLoadingMoreOrders} onClick={() => loadMoreOrders(40)}>
              {isLoadingMoreOrders ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Truck className="size-4" aria-hidden="true" />}
              {localize({ en: "Load more orders", ar: "تحميل المزيد من الطلبات" }, language)}
            </Button>
          </div>
        ) : null}
      </DashboardCard>
    </PortalShell>
  );
}
