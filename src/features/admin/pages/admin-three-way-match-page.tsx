import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, FileWarning, Loader2, ShieldX } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminNav } from "@/features/admin/hooks/use-admin-nav";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Decision = "approved" | "rejected";
type SubmitMessage = { tone: "success" | "error"; text: string };

function formatCurrency(amount: number, language: string) {
  return new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2
  }).format(amount);
}

export function AdminThreeWayMatchPage() {
  const { i18n } = useTranslation("common");
  const language = i18n.language;
  const navItems = useAdminNav();
  const { user } = useAuth();
  const canDecide = Boolean(user && hasPermission(user.roles, "po:approve"));
  const queryArgs = useMemo(
    () => (isBetterAuthConfigured && user && canDecide ? { actorUserId: user.id as Id<"users"> } : "skip"),
    [canDecide, user]
  );
  const invoices = useQuery(api.documents.listInvoicesOnHold, queryArgs);
  const decideVariance = useMutation(api.documents.decideInvoiceVariance);

  const [selectedId, setSelectedId] = useState<Id<"invoices"> | null>(null);
  const [note, setNote] = useState("");
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null);
  const [message, setMessage] = useState<SubmitMessage | null>(null);

  const selected = useMemo(
    () => invoices?.find((invoice) => invoice._id === selectedId) ?? null,
    [invoices, selectedId]
  );

  async function handleDecision(decision: Decision) {
    if (!isBetterAuthConfigured || !user || !selected) return;
    if (decision === "rejected" && !note.trim()) {
      setMessage({
        tone: "error",
        text: localize({ en: "A note is required when rejecting.", ar: "الملاحظة مطلوبة عند الرفض." }, language)
      });
      return;
    }
    setMessage(null);
    setPendingDecision(decision);
    try {
      await decideVariance({
        actorUserId: user.id as Id<"users">,
        invoiceId: selected._id,
        decision,
        note: note.trim() || undefined
      });
      setMessage({
        tone: "success",
        text: decision === "approved"
          ? localize({ en: "Variance approved with override.", ar: "تم اعتماد الفروقات." }, language)
          : localize({ en: "Invoice rejected.", ar: "تم رفض الفاتورة." }, language)
      });
      setSelectedId(null);
      setNote("");
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({
        tone: "error",
        text: text || localize({ en: "Could not record decision.", ar: "تعذر تسجيل القرار." }, language)
      });
    } finally {
      setPendingDecision(null);
    }
  }

  return (
    <PortalShell
      title={localize({ en: "Three-way match", ar: "المطابقة الثلاثية" }, language)}
      description={localize(
        {
          en: "Invoices held for variance review (PO × GRN × Invoice within 2%).",
          ar: "الفواتير المعلقة لمراجعة الفروقات (الطلب × الاستلام × الفاتورة ضمن 2%)."
        },
        language
      )}
      navItems={navItems}
    >
      {!canDecide ? (
        <DashboardCard title={localize({ en: "Restricted", ar: "محظور" }, language)}>
          <p className="text-sm text-muted-foreground">
            {localize(
              { en: "You do not have permission to review invoice variances.", ar: "ليس لديك صلاحية مراجعة الفروقات." },
              language
            )}
          </p>
        </DashboardCard>
      ) : (
        <>
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

          <DashboardCard
            title={localize({ en: "On hold", ar: "في الانتظار" }, language)}
            description={
              invoices
                ? `${invoices.length} ${localize({ en: "invoices", ar: "فواتير" }, language)}`
                : undefined
            }
          >
            <DataTable
              rows={invoices ?? []}
              emptyLabel={localize({ en: "No invoices on hold.", ar: "لا توجد فواتير معلقة." }, language)}
              getRowKey={(invoice) => invoice._id}
              columns={[
                {
                  header: localize({ en: "Invoice #", ar: "رقم الفاتورة" }, language),
                  cell: (invoice) => (
                    <div className="flex flex-col">
                      <span className="font-semibold">{invoice.invoiceNumber}</span>
                      <span className="text-xs text-muted-foreground">{invoice.transactionRef ?? "—"}</span>
                    </div>
                  )
                },
                {
                  header: localize({ en: "Client", ar: "العميل" }, language),
                  cell: (invoice) => <span className="text-sm">{invoice.clientAnonymousId}</span>
                },
                {
                  header: "PO",
                  cell: (invoice) => <span className="text-sm">{formatCurrency(invoice.poTotalSar, language)}</span>
                },
                {
                  header: "GRN",
                  cell: (invoice) => <span className="text-sm">{formatCurrency(invoice.grnTotalSar, language)}</span>
                },
                {
                  header: "Invoice",
                  cell: (invoice) => (
                    <span className="text-sm font-semibold">{formatCurrency(invoice.totalSar, language)}</span>
                  )
                },
                {
                  header: localize({ en: "Variance", ar: "الفرق" }, language),
                  cell: (invoice) => (
                    <StatusBadge tone={invoice.variancePct > 5 ? "danger" : "warning"}>
                      {invoice.variancePct.toFixed(2)}%
                    </StatusBadge>
                  )
                },
                {
                  header: "",
                  cell: (invoice) => (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedId(invoice._id);
                        setNote("");
                        setMessage(null);
                      }}
                    >
                      {localize({ en: "Review", ar: "مراجعة" }, language)}
                    </Button>
                  )
                }
              ]}
            />
          </DashboardCard>

          {selected ? (
            <DashboardCard
              title={`${localize({ en: "Variance review", ar: "مراجعة الفروقات" }, language)} — ${selected.invoiceNumber}`}
              description={selected.holdReason ?? localize({ en: "Within tolerance", ar: "ضمن النطاق" }, language)}
            >
              <div className="grid gap-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">PO</span>
                    <p className="font-semibold">{formatCurrency(selected.poTotalSar, language)}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">GRN</span>
                    <p className="font-semibold">{formatCurrency(selected.grnTotalSar, language)}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {localize({ en: "Invoice", ar: "الفاتورة" }, language)}
                    </span>
                    <p className="font-semibold">{formatCurrency(selected.totalSar, language)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {localize({ en: "Subtotal", ar: "المجموع قبل الضريبة" }, language)}
                    </span>
                    <p className="font-semibold">{formatCurrency(selected.subtotalSar, language)}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {localize({ en: "VAT (15%)", ar: "ضريبة (15%)" }, language)}
                    </span>
                    <p className="font-semibold">{formatCurrency(selected.vatAmountSar, language)}</p>
                  </div>
                </div>
                <label className="grid gap-2 text-sm font-medium">
                  {localize({ en: "Reviewer note", ar: "ملاحظة المراجع" }, language)}
                  <Input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={localize(
                      { en: "Required when rejecting.", ar: "مطلوب عند الرفض." },
                      language
                    )}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void handleDecision("approved")} disabled={pendingDecision !== null}>
                    {pendingDecision === "approved" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    {localize({ en: "Override + Approve", ar: "اعتماد مع التجاوز" }, language)}
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => void handleDecision("rejected")} disabled={pendingDecision !== null}>
                    {pendingDecision === "rejected" ? <Loader2 className="size-4 animate-spin" /> : <ShieldX className="size-4" />}
                    {localize({ en: "Reject + Return", ar: "رفض وإعادة" }, language)}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSelectedId(null);
                      setNote("");
                    }}
                  >
                    <FileWarning className="size-4" aria-hidden="true" />
                    {localize({ en: "Cancel", ar: "إلغاء" }, language)}
                  </Button>
                </div>
              </div>
            </DashboardCard>
          ) : null}
        </>
      )}
    </PortalShell>
  );
}
