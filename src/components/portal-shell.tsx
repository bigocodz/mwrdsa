import { Bell, ChevronRight, LogOut, Menu } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
};

type PortalShellProps = {
  title: string;
  description: string;
  navItems: NavItem[];
  children: ReactNode;
};

export function PortalShell({ title, description, navItems, children }: PortalShellProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isRtl = i18n.dir() === "rtl";

  return (
    <div className="min-h-screen bg-muted/35 text-foreground">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-72 border-e bg-background px-4 py-5 lg:flex lg:flex-col">
        <BrandLogo className="h-10" />
        <Separator className="my-5" />
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent text-accent-foreground"
                )
              }
            >
              <span>{item.label}</span>
              <ChevronRight className={cn("h-4 w-4", isRtl && "rotate-180")} aria-hidden="true" />
            </NavLink>
          ))}
        </nav>
        <div className="rounded-lg border bg-card p-3 text-sm">
          <p className="font-semibold">{user?.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </aside>

      <div className="lg:ps-72">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label={t("navigation.menu")}>
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
              <BrandLogo compact className="lg:hidden" />
              <div className="hidden sm:block">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LanguageToggle />
              <Button type="button" variant="ghost" size="icon" aria-label={t("navigation.notifications")}>
                <Bell className="h-5 w-5" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t("navigation.logout")}>
                <LogOut className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
