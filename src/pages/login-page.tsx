import { LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginPage() {
  const { t } = useTranslation("auth");

  return (
    <main className="grid min-h-screen place-items-center bg-muted/35 px-4 py-8">
      <div className="absolute end-4 top-4">
        <LanguageToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <BrandLogo className="h-12" />
          <div>
            <CardTitle className="text-2xl">{t("login.title")}</CardTitle>
            <CardDescription>{t("login.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              {t("login.email")}
              <Input type="email" autoComplete="email" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {t("login.password")}
              <Input type="password" autoComplete="current-password" />
            </label>
            <Button type="button" className="w-full">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              {t("login.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
