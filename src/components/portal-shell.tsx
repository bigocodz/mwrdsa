import { Bell, ChevronsUpDown, Command, LogOut, Menu, Search } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { Badge } from "@/components/ui/badge";
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
};

export function PortalShell({ title, description, navItems, children }: PortalShellProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#f7f5f1] text-foreground">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[286px] border-e border-black/10 bg-[#fcfbf8] px-3 py-3 lg:flex lg:flex-col">
        <div className="flex h-14 items-center justify-between px-2">
          <BrandLogo className="h-9" />
          <Button type="button" variant="ghost" size="icon" aria-label={t("navigation.menu")}>
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <button
          type="button"
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-black/10 bg-white px-3 py-2.5 text-start transition-colors hover:bg-muted/50"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-mwrd-black">
              <BrandLogo compact className="h-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">MWRD</span>
              <span className="block truncate text-xs text-muted-foreground">{title}</span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>

        <div className="mt-4 px-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">{t("navigation.workspace")}</div>
        <nav className="mt-2 flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground",
                  isActive && "active bg-white text-foreground shadow-[0_0_0_1px_rgba(26,26,26,0.08)]"
                )
              }
            >
              <span className="grid h-5 w-5 place-items-center text-muted-foreground group-hover:text-primary group-[.active]:text-primary">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <Separator className="my-3 bg-black/10" />
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {user?.name.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{user?.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
          </span>
          <Button type="button" variant="ghost" size="icon" aria-label={t("navigation.logout")}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </aside>

      <div className="lg:ps-[286px]">
        <header className="sticky top-0 z-20 border-b border-black/10 bg-[#fcfbf8]/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label={t("navigation.menu")}>
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
              <BrandLogo compact className="lg:hidden" />
              <div className="hidden min-w-0 items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-muted-foreground md:flex">
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t("navigation.search")}</span>
                <kbd className="ms-8 hidden rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground xl:inline-flex">
                  <Command className="me-1 h-3 w-3" aria-hidden="true" />K
                </kbd>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LanguageToggle />
              <Button type="button" variant="outline" size="icon" className="relative bg-white" aria-label={t("navigation.notifications")}>
                <Bell className="h-5 w-5" aria-hidden="true" />
                <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-primary" />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
          <section className="flex flex-col gap-3 border-b border-black/10 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline">MWRD</Badge>
                <span className="text-xs text-muted-foreground">{t("navigation.control_center")}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
            <Button type="button" className="w-full md:w-auto">
              {t("actions.new_request")}
            </Button>
          </section>
          {children}
        </main>
      </div>
    </div>
  );
}
