import { useMutation, useQuery } from "convex/react";
import { Loader2, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type SubmitMessage = { tone: "success" | "error"; text: string };

export function ClientApprovalTreePage() {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const navItems = useClientNav();
  const { user } = useAuth();
  const canManage = Boolean(user && hasPermission(user.roles, "user:invite"));
  const queryArgs = useMemo(
    () => (isBetterAuthConfigured && user && canManage ? { actorUserId: user.id as Id<"users"> } : "skip"),
    [canManage, user]
  );
  const tree = useQuery(api.approvals.listApprovalTreeForActor, queryArgs);
  const setDirectApprover = useMutation(api.approvals.setDirectApprover);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [pendingMember, setPendingMember] = useState<Id<"users"> | null>(null);
  const [message, setMessage] = useState<SubmitMessage | null>(null);

  const pickerByMember = useMemo<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const row of tree ?? []) {
      next[row._id] = overrides[row._id] ?? row.directApproverUserId ?? "";
    }
    return next;
  }, [tree, overrides]);

  async function handleSave(memberUserId: Id<"users">, approverValue: string) {
    if (!isBetterAuthConfigured || !user) return;
    setMessage(null);
    setPendingMember(memberUserId);
    try {
      await setDirectApprover({
        actorUserId: user.id as Id<"users">,
        memberUserId,
        approverUserId: approverValue ? (approverValue as Id<"users">) : undefined
      });
      setMessage({
        tone: "success",
        text: localize({ en: "Approval chain updated.", ar: "تم تحديث سلسلة الموافقات." }, language)
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : "";
      setMessage({
        tone: "error",
        text: text || localize({ en: "Could not update approver.", ar: "تعذر تحديث المراجع." }, language)
      });
    } finally {
      setPendingMember(null);
    }
  }

  return (
    <PortalShell
      title={localize({ en: "Approval tree", ar: "سلسلة الموافقات" }, language)}
      description={localize(
        {
          en: "Pick the direct approver for each member. Cycles are blocked automatically.",
          ar: "اختر المراجع المباشر لكل عضو. يتم منع الحلقات تلقائياً."
        },
        language
      )}
      navItems={navItems}
    >
      {!canManage ? (
        <DashboardCard title={localize({ en: "Restricted", ar: "محظور" }, language)}>
          <p className="text-sm text-muted-foreground">
            {localize(
              { en: "You do not have permission to manage the approval tree.", ar: "ليس لديك صلاحية إدارة سلسلة الموافقات." },
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
            title={localize({ en: "Members", ar: "الأعضاء" }, language)}
            description={
              tree
                ? `${tree.length} ${localize({ en: "members", ar: "عضو" }, language)}`
                : undefined
            }
          >
            <DataTable
              rows={tree ?? []}
              emptyLabel={localize({ en: "No members yet.", ar: "لا يوجد أعضاء بعد." }, language)}
              getRowKey={(row) => row._id}
              columns={[
                {
                  header: localize({ en: "Member", ar: "العضو" }, language),
                  cell: (row) => (
                    <div className="flex flex-col">
                      <span className="font-semibold">{row.name}</span>
                      <span className="text-xs text-muted-foreground">{row.email}</span>
                    </div>
                  )
                },
                {
                  header: localize({ en: "Status", ar: "الحالة" }, language),
                  cell: (row) => (
                    <StatusBadge tone={row.status === "active" ? "info" : "warning"}>{row.status}</StatusBadge>
                  )
                },
                {
                  header: localize({ en: "Direct approver", ar: "المراجع المباشر" }, language),
                  cell: (row) => (
                    <select
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                      value={pickerByMember[row._id] ?? ""}
                      onChange={(event) =>
                        setOverrides((prev) => ({ ...prev, [row._id]: event.target.value }))
                      }
                    >
                      <option value="">
                        {localize({ en: "— Top of chain —", ar: "— رأس السلسلة —" }, language)}
                      </option>
                      {(tree ?? [])
                        .filter((option) => option._id !== row._id)
                        .map((option) => (
                          <option key={option._id} value={option._id}>
                            {option.name} ({option.email})
                          </option>
                        ))}
                    </select>
                  )
                },
                {
                  header: localize({ en: "Resolved chain", ar: "السلسلة المحسوبة" }, language),
                  cell: (row) => (
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {row.chain.length === 0
                          ? localize({ en: "No approvers", ar: "لا يوجد مراجعون" }, language)
                          : row.chain.map((entry) => entry.name).join(" → ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.chainLength} {localize({ en: "step(s)", ar: "خطوة" }, language)}
                      </span>
                    </div>
                  )
                },
                {
                  header: "",
                  cell: (row) => (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSave(row._id, pickerByMember[row._id] ?? "")}
                      disabled={pendingMember === row._id}
                    >
                      {pendingMember === row._id ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      {localize({ en: "Save", ar: "حفظ" }, language)}
                    </Button>
                  )
                }
              ]}
            />
          </DashboardCard>
        </>
      )}
    </PortalShell>
  );
}
