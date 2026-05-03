import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Loader2, PhoneCall } from "lucide-react";
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

function formatDate(ts: number, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ts));
}

export function AdminLeadsPage() {
  const { i18n } = useTranslation("common");
  const language = i18n.language;
  const navItems = useAdminNav();
  const { user } = useAuth();
  const canReview = Boolean(user && hasPermission(user.roles, "audit:view"));
  const queryArgs = useMemo(
    () => (isBetterAuthConfigured && user && canReview ? { actorUserId: user.id as Id<"users"> } : "skip"),
    [canReview, user]
  );
  const leads = useQuery(api.publicAuth.listPendingLeads, queryArgs);
  const markCallbackComplete = useMutation(api.publicAuth.markCallbackComplete);
  const [selectedId, setSelectedId] = useState<Id<"users"> | null>(null);
  const [callbackNotes, setCallbackNotes] = useState("");
  const [pendingId, setPendingId] = useState<Id<"users"> | null>(null);
  const [message, setMessage] = useState<SubmitMessage | null>(null);

  const selected = useMemo(() => leads?.find((lead) => lead._id === selectedId) ?? null, [leads, selectedId]);

  async function handleMarkComplete() {
    if (!isBetterAuthConfigured || !user || !selected) return;
    setMessage(null);
    setPendingId(selected._id);
    try {
      await markCallbackComplete({
        actorUserId: user.id as Id<"users">,
        pendingUserId: selected._id,
        notes: callbackNotes.trim() || undefined
      });
      setMessage({
        tone: "success",
        text: localize(
          { en: "Callback marked complete. Activation link issued.", ar: "تم تسجيل الاتصال. تم إصدار رابط التفعيل." },
          language
        )
      });
      setCallbackNotes("");
      setSelectedId(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage({
        tone: "error",
        text: text || localize({ en: "Could not mark callback complete.", ar: "تعذر تسجيل الاتصال." }, language)
      });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <PortalShell
      title={localize({ en: "Leads", ar: "العملاء المحتملون" }, language)}
      description={localize(
        { en: "Public sign-ups awaiting callback verification.", ar: "تسجيلات تنتظر التحقق عبر الاتصال." },
        language
      )}
      navItems={navItems}
    >
      {!canReview ? (
        <DashboardCard title={localize({ en: "Restricted", ar: "محظور" }, language)}>
          <p className="text-sm text-muted-foreground">
            {localize(
              { en: "You do not have permission to review onboarding leads.", ar: "ليس لديك صلاحية مراجعة العملاء المحتملين." },
              language
            )}
          </p>
        </DashboardCard>
      ) : (
        <>
          {message ? <p className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", message.tone === "success" ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive")}>{message.text}</p> : null}

          <DashboardCard
            title={localize({ en: "Pending leads", ar: "في الانتظار" }, language)}
            description={
              leads
                ? `${leads.length} ${localize({ en: "leads", ar: "تسجيلاً" }, language)}`
                : undefined
            }
          >
            <DataTable
              rows={leads ?? []}
              emptyLabel={localize({ en: "No pending leads.", ar: "لا توجد تسجيلات معلقة." }, language)}
              getRowKey={(lead) => lead._id}
              columns={[
                {
                  header: localize({ en: "Submitted", ar: "تاريخ التقديم" }, language),
                  cell: (lead) => <span className="text-sm">{formatDate(lead.createdAt, language)}</span>
                },
                {
                  header: localize({ en: "Name", ar: "الاسم" }, language),
                  cell: (lead) => (
                    <div className="flex flex-col">
                      <span className="font-semibold">{lead.name}</span>
                      <span className="text-xs text-muted-foreground">{lead.email}</span>
                    </div>
                  )
                },
                {
                  header: localize({ en: "Phone", ar: "الجوال" }, language),
                  cell: (lead) => <span className="text-sm">{lead.phone || "—"}</span>
                },
                {
                  header: localize({ en: "Account type", ar: "نوع الحساب" }, language),
                  cell: (lead) => (
                    <StatusBadge tone={lead.accountType === "client" ? "info" : "warning"}>
                      {lead.accountType === "client"
                        ? localize({ en: "Client", ar: "عميل" }, language)
                        : localize({ en: "Supplier", ar: "مورد" }, language)}
                    </StatusBadge>
                  )
                },
                {
                  header: localize({ en: "Company", ar: "الشركة" }, language),
                  cell: (lead) => <span className="text-sm">{lead.companyName}</span>
                },
                {
                  header: localize({ en: "Status", ar: "الحالة" }, language),
                  cell: (lead) => (
                    <StatusBadge tone={lead.status === "pendingCallback" ? "warning" : "info"}>
                      {lead.status === "pendingCallback"
                        ? localize({ en: "Awaiting callback", ar: "بانتظار الاتصال" }, language)
                        : localize({ en: "Callback completed", ar: "تم الاتصال" }, language)}
                    </StatusBadge>
                  )
                },
                {
                  header: "",
                  cell: (lead) => (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedId(lead._id);
                        setCallbackNotes(lead.callbackNotes ?? "");
                        setMessage(null);
                      }}
                      disabled={lead.status !== "pendingCallback"}
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
              title={`${localize({ en: "Mark callback complete for", ar: "تسجيل الاتصال لـ" }, language)} ${selected.name}`}
              description={`${selected.email} · ${selected.phone || "—"}`}
            >
              <div className="grid gap-4">
                <div className="grid gap-1 text-sm">
                  <span className="text-xs uppercase text-muted-foreground">
                    {localize({ en: "Company", ar: "الشركة" }, language)}
                  </span>
                  <span className="font-semibold">{selected.companyName}</span>
                </div>
                {selected.signupIntent ? (
                  <div className="grid gap-1 text-sm">
                    <span className="text-xs uppercase text-muted-foreground">
                      {localize({ en: "Signup intent", ar: "نية التسجيل" }, language)}
                    </span>
                    <span>{selected.signupIntent}</span>
                  </div>
                ) : null}
                <label className="grid gap-2 text-sm font-medium">
                  {localize({ en: "Callback notes (optional)", ar: "ملاحظات الاتصال (اختياري)" }, language)}
                  <Input
                    value={callbackNotes}
                    onChange={(event) => setCallbackNotes(event.target.value)}
                    placeholder={localize({ en: "Verified contact and company details.", ar: "تم التحقق من البيانات." }, language)}
                  />
                </label>
                <div className="flex gap-2">
                  <Button type="button" onClick={() => void handleMarkComplete()} disabled={pendingId === selected._id}>
                    {pendingId === selected._id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    {localize({ en: "Mark callback complete", ar: "تسجيل الاتصال" }, language)}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelectedId(null);
                      setCallbackNotes("");
                    }}
                  >
                    {localize({ en: "Cancel", ar: "إلغاء" }, language)}
                  </Button>
                </div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <PhoneCall className="size-4" aria-hidden="true" />
                  {localize(
                    {
                      en: "An activation link will be issued. The user must set a password before signing in.",
                      ar: "سيتم إصدار رابط التفعيل. يجب على المستخدم إنشاء كلمة المرور قبل تسجيل الدخول."
                    },
                    language
                  )}
                </p>
              </div>
            </DashboardCard>
          ) : null}
        </>
      )}
    </PortalShell>
  );
}
