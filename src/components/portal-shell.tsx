import { ChevronRight, LogOut, Menu, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
};

type PortalShellProps = {
  title: string;
  description: string;
  navItems: NavItem[];
  children: ReactNode;
  primaryActionLabel?: string;
  primaryActionIcon?: ReactNode;
  onPrimaryAction?: () => void;
};

export function PortalShell({ title, description, navItems, children, primaryActionLabel, primaryActionIcon, onPrimaryAction }: PortalShellProps) {
  const { t, i18n } = useTranslation();
  const { signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isRtl = i18n.dir() === "rtl";
  const activeItem = navItems.find((item) => location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)) ?? navItems[0];
  const actionIcon = primaryActionIcon ?? <Plus className="size-4" aria-hidden="true" />;
  const handleSignOut = async () => {
    await signOut();
    navigate("/auth/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[18.5rem] border-e border-border/70 bg-card px-5 py-6 lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10">
            <BrandLogo compact className="h-8" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">MWRD</p>
            <p className="truncate text-sm text-muted-foreground">{title}</p>
          </div>
        </div>

        <Separator className="my-6 border-dashed" />

        <p className="mb-3 text-xs font-semibold uppercase tracking-normal text-muted-foreground">{t("navigation.main")}</p>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  isActive && "bg-accent text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn("absolute inset-y-2 start-0 w-1 rounded-e-full bg-transparent", isActive && "bg-primary")} />
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={cn("grid size-6 shrink-0 place-items-center text-muted-foreground", isActive && "text-primary")}>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  <ChevronRight className={cn("size-4 shrink-0", isRtl && "rotate-180")} aria-hidden="true" />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <Separator className="my-5" />

        <div className="flex items-center gap-3 rounded-lg bg-card text-sm">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mwrd-cyan font-semibold text-mwrd-black">
            {user?.name?.slice(0, 1) ?? "M"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground", isRtl && "rotate-180")} aria-hidden="true" />
        </div>
      </aside>

      <div className="lg:ps-[18.5rem]">
        <main className="mx-auto flex min-h-screen w-full max-w-[104rem] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-10">
          <header className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <Button type="button" variant="outline" size="icon" className="lg:hidden" aria-label={t("navigation.menu")}>
                  <Menu className="size-5" aria-hidden="true" />
                </Button>
                <span className="grid size-14 shrink-0 place-items-center rounded-full border border-border/70 bg-card shadow-card">
                  <span className="text-primary">{activeItem.icon}</span>
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-semibold tracking-normal text-foreground md:text-3xl">{title}</h1>
                  <p className="mt-1 text-sm text-muted-foreground md:text-base">{description}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <NotificationBell />
                <LanguageToggle />
                {primaryActionLabel ? (
                  <Button type="button" onClick={onPrimaryAction}>
                    {actionIcon}
                    {primaryActionLabel}
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label={t("navigation.logout")} onClick={handleSignOut}>
                  <LogOut className="size-5" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <Separator className="border-dashed" />
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}
