// Slice 25: SuperAdmin internal user management
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Shield, Trash2, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DashboardCard, DataTable, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { hasPermission } from "@/lib/permissions";

// Reuse AdminDashboardPage shell pattern
import { PortalShell } from "@/components/portal-shell";
import { useAdminNav } from "@/features/admin/hooks/use-admin-nav";

type AdminUser = {
  _id: Id<"users">;
  email: string;
  name: string;
  roles: string[];
  status: string;
  createdAt: number;
};

const ADMIN_ROLES = [
  "superAdmin",
  "admin",
  "catalogManager",
  "financeManager",
  "operationsManager"
] as const;

export function AdminSuperadminPage() {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const navItems = useAdminNav();
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user && hasPermission(user.roles, "superAdmin:manage"));
  const queryArgs = useMemo(
    () =>
      isBetterAuthConfigured && user && isSuperAdmin
        ? { actorUserId: user.id as Id<"users"> }
        : "skip",
    [user, isSuperAdmin]
  );

  const adminUsers = useQuery(api.admin.listAdminUsers, queryArgs);
  const inviteAdminUser = useMutation(api.admin.inviteAdminUser);
  const updateAdminUserRoles = useMutation(api.admin.updateAdminUserRoles);
  const deactivateAdminUser = useMutation(api.admin.deactivateAdminUser);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "admin" as string });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await inviteAdminUser({
        actorUserId: user.id as Id<"users">,
        email: form.email,
        name: form.name,
        role: form.role
      });
      setOpen(false);
      setForm({ email: "", name: "", role: "admin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate(targetUserId: Id<"users">) {
    if (!user) return;
    await deactivateAdminUser({
      actorUserId: user.id as Id<"users">,
      targetUserId
    });
  }

  return (
    <PortalShell
      title={localize({ en: "Internal Users", ar: "المستخدمون الداخليون" }, language)}
      description={localize(
        { en: "Manage admin portal users and their roles.", ar: "إدارة مستخدمي بوابة الإدارة وأدوارهم." },
        language
      )}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Invite user", ar: "دعوة مستخدم" }, language)}
      primaryActionIcon={<Plus className="size-4" aria-hidden="true" />}
      onPrimaryAction={() => {
        setError(null);
        setOpen(true);
      }}
    >
      {!isSuperAdmin ? (
        <DashboardCard title={localize({ en: "Restricted", ar: "محظور" }, language)}>
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Shield className="size-5 shrink-0" />
            <p>{localize({ en: "Only super-admins can manage internal users.", ar: "يمكن للمشرفين الرئيسيين فقط إدارة المستخدمين الداخليين." }, language)}</p>
          </div>
        </DashboardCard>
      ) : adminUsers === undefined ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>{localize({ en: "Loading…", ar: "جارٍ التحميل…" }, language)}</span>
        </div>
      ) : (
        <DashboardCard
          title={localize({ en: "Admin users", ar: "مستخدمو الإدارة" }, language)}
          description={`${adminUsers.length} ${localize({ en: "users", ar: "مستخدم" }, language)}`}
        >
          <DataTable
            rows={adminUsers as AdminUser[]}
            emptyLabel={localize({ en: "No admin users yet.", ar: "لا يوجد مستخدمون بعد." }, language)}
            getRowKey={(row) => row._id}
            columns={[
              {
                header: localize({ en: "Name", ar: "الاسم" }, language),
                cell: (row) => (
                  <div className="flex items-center gap-2">
                    <UserCheck className="size-4 shrink-0 text-primary" />
                    <div>
                      <p className="font-semibold">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    </div>
                  </div>
                )
              },
              {
                header: localize({ en: "Roles", ar: "الأدوار" }, language),
                cell: (row) => (
                  <div className="flex flex-wrap gap-1">
                    {row.roles.map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                )
              },
              {
                header: localize({ en: "Status", ar: "الحالة" }, language),
                cell: (row) => (
                  <StatusBadge tone={row.status === "active" ? "positive" : "neutral"}>
                    {row.status}
                  </StatusBadge>
                )
              },
              {
                header: "",
                cell: (row) =>
                  row._id !== user?.id ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void handleDeactivate(row._id)}
                      disabled={row.status === "inactive"}
                    >
                      <Trash2 className="size-3" />
                      {localize({ en: "Deactivate", ar: "تعطيل" }, language)}
                    </Button>
                  ) : null
              }
            ]}
          />
        </DashboardCard>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{localize({ en: "Invite admin user", ar: "دعوة مستخدم إداري" }, language)}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleInvite(e)} className="flex flex-col gap-4">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sa-name">{localize({ en: "Full name", ar: "الاسم الكامل" }, language)} *</Label>
              <Input
                id="sa-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sa-email">{localize({ en: "Email", ar: "البريد الإلكتروني" }, language)} *</Label>
              <Input
                id="sa-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sa-role">{localize({ en: "Role", ar: "الدور" }, language)} *</Label>
              <select
                id="sa-role"
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              >
                {ADMIN_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                {localize({ en: "Cancel", ar: "إلغاء" }, language)}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {localize({ en: "Invite", ar: "دعوة" }, language)}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PortalShell>
  );
}
