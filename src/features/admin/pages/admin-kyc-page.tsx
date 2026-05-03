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

type SubmitMessage = { tone: "success" | "error"; text: string };
type Decision = "approved" | "rejected" | "requestedMore";

function formatDate(ts: number, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ts));
}

export function AdminKycPage() {
  const { i18n } = useTranslation("common");
  const language = i18n.language;
  const navItems = useAdminNav();
  const { user } = useAuth();
  const canReview = Boolean(user && hasPermission(user.roles, "audit:view"));
  const queryArgs = useMemo(
    () => (isBetterAuthConfigured && user && canReview ? { actorUserId: user.id as Id<"users"> } : "skip"),
    [canReview, user]
  );
  const reviews = useQuery(api.publicAuth.listPendingKycReviews, queryArgs);
  const decideKycReview = useMutation(api.publicAuth.decideKycReview);

  const [selectedId, setSelectedId] = useState<Id<"users"> | null>(null);
  const [note, setNote] = useState("");
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null);
  const [message, setMessage] = useState<SubmitMessage | null>(null);

  const selected = useMemo(() => reviews?.find((review) => review._id === selectedId) ?? null, [reviews, selectedId]);

  async function handleDecision(decision: Decision) {
    if (!isBetterAuthConfigured || !user || !selected) return;
    setMessage(null);
    setPendingDecision(decision);
    try {
      await decideKycReview({
        actorUserId: user.id as Id<"users">,
        pendingUserId: selected._id,
        decision,
        note: note.trim() || undefined
      });
      const labels: Record<Decision, { en: string; ar: string }> = {
        approved: { en: "KYC approved.", ar: "تم اعتماد التحقق." },
        rejected: { en: "KYC rejected.", ar: "تم رفض التحقق." },
        requestedMore: { en: "More documents requested.", ar: "تم طلب وثائق إضافية." }
      };
      setMessage({ tone: "success", text: localize(labels[decision], language) });
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
      title={localize({ en: "KYC review", ar: "مراجعة التحقق" }, language)}
      description={localize(
        {
          en: "Activated organizations awaiting KYC verification.",
          ar: "المؤسسات التي تم تفعيلها وتنتظر مراجعة الوثائق."
        },
        language
      )}
      navItems={navItems}
    >
      {!canReview ? (
        <DashboardCard title={localize({ en: "Restricted", ar: "محظور" }, language)}>
          <p className="text-sm text-muted-foreground">
            {localize(
              { en: "You do not have permission to review KYC submissions.", ar: "ليس لديك صلاحية مراجعة وثائق التحقق." },
              language
            )}
          </p>
        </DashboardCard>
      ) : (
        <>
          {message ? <p className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", message.tone === "success" ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive")}>{message.text}</p> : null}

          <DashboardCard
            title={localize({ en: "Awaiting KYC", ar: "بانتظار التحقق" }, language)}
            description={
              reviews
                ? `${reviews.length} ${localize({ en: "organizations", ar: "مؤسسة" }, language)}`
                : undefined
            }
          >
            <DataTable
              rows={reviews ?? []}
              emptyLabel={localize({ en: "No pending KYC reviews.", ar: "لا توجد مراجعات معلقة." }, language)}
              getRowKey={(review) => review._id}
              columns={[
                {
                  header: localize({ en: "Activated", ar: "تاريخ التفعيل" }, language),
                  cell: (review) => (
                    <span className="text-sm">
                      {review.kycSubmittedAt ? formatDate(review.kycSubmittedAt, language) : "—"}
                    </span>
                  )
                },
                {
                  header: localize({ en: "Contact", ar: "جهة الاتصال" }, language),
                  cell: (review) => (
                    <div className="flex flex-col">
                      <span className="font-semibold">{review.name}</span>
                      <span className="text-xs text-muted-foreground">{review.email}</span>
                    </div>
                  )
                },
                {
                  header: localize({ en: "Account type", ar: "نوع الحساب" }, language),
                  cell: (review) => (
                    <StatusBadge tone={review.accountType === "client" ? "info" : "warning"}>
                      {review.accountType === "client"
                        ? localize({ en: "Client", ar: "عميل" }, language)
                        : localize({ en: "Supplier", ar: "مورد" }, language)}
                    </StatusBadge>
                  )
                },
                {
                  header: localize({ en: "Company", ar: "الشركة" }, language),
                  cell: (review) => (
                    <div className="flex flex-col">
                      <span className="font-semibold">{review.companyName}</span>
                      <span className="text-xs text-muted-foreground">
                        {review.crNumber ? `CR ${review.crNumber}` : ""}
                        {review.crNumber && review.vatNumber ? " · " : ""}
                        {review.vatNumber ? `VAT ${review.vatNumber}` : ""}
                      </span>
                    </div>
                  )
                },
                {
                  header: localize({ en: "Last decision", ar: "آخر قرار" }, language),
                  cell: (review) => {
                    if (!review.kycDecision) {
                      return <span className="text-xs text-muted-foreground">—</span>;
                    }
                    const labels: Record<string, { en: string; ar: string }> = {
                      approved: { en: "Approved", ar: "معتمد" },
                      rejected: { en: "Rejected", ar: "مرفوض" },
                      requestedMore: { en: "Awaiting more docs", ar: "بانتظار وثائق إضافية" }
                    };
                    const tone = review.kycDecision === "approved" ? "info" : review.kycDecision === "rejected" ? "danger" : "warning";
                    return <StatusBadge tone={tone}>{localize(labels[review.kycDecision], language)}</StatusBadge>;
                  }
                },
                {
                  header: "",
                  cell: (review) => (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedId(review._id);
                        setNote(review.kycDecisionNote ?? "");
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
              title={`${localize({ en: "KYC review", ar: "مراجعة التحقق" }, language)} — ${selected.name}`}
              description={selected.companyName}
            >
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {localize({ en: "CR number", ar: "السجل التجاري" }, language)}
                    </span>
                    <p className="font-semibold">{selected.crNumber ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {localize({ en: "VAT number", ar: "الرقم الضريبي" }, language)}
                    </span>
                    <p className="font-semibold">{selected.vatNumber ?? "—"}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-sm">
                  <p className="font-semibold">
                    {localize({ en: "Submitted documents", ar: "الوثائق المُقدّمة" }, language)}
                  </p>
                  {selected.kycDocuments.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {localize(
                        {
                          en: "No documents uploaded yet. The supplier/client UI for uploads ships in a later slice.",
                          ar: "لم يتم رفع وثائق بعد. واجهة الرفع ستضاف في مرحلة لاحقة."
                        },
                        language
                      )}
                    </p>
                  ) : (
                    <ul className="mt-2 grid gap-1">
                      {selected.kycDocuments.map((doc, index) => (
                        <li key={index} className="flex items-center justify-between">
                          <span>{doc.documentType}</span>
                          <StatusBadge tone={doc.status === "verified" ? "info" : doc.status === "rejected" ? "danger" : "warning"}>
                            {doc.status}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <label className="grid gap-2 text-sm font-medium">
                  {localize({ en: "Reviewer note", ar: "ملاحظة المراجع" }, language)}
                  <Input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={localize(
                      { en: "Required when rejecting or requesting more documents.", ar: "مطلوب عند الرفض أو طلب وثائق إضافية." },
                      language
                    )}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void handleDecision("approved")} disabled={pendingDecision !== null}>
                    {pendingDecision === "approved" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    {localize({ en: "Approve KYC", ar: "اعتماد التحقق" }, language)}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleDecision("requestedMore")} disabled={pendingDecision !== null}>
                    {pendingDecision === "requestedMore" ? <Loader2 className="size-4 animate-spin" /> : <FileWarning className="size-4" />}
                    {localize({ en: "Request more documents", ar: "طلب وثائق إضافية" }, language)}
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => void handleDecision("rejected")} disabled={pendingDecision !== null}>
                    {pendingDecision === "rejected" ? <Loader2 className="size-4 animate-spin" /> : <ShieldX className="size-4" />}
                    {localize({ en: "Reject", ar: "رفض" }, language)}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSelectedId(null);
                      setNote("");
                    }}
                  >
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
