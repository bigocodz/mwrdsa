import { LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { analyticsEvents, trackEvent } from "@/lib/analytics";
import { authClient, isBetterAuthConfigured } from "@/lib/auth-client";
import { useAuth } from "@/lib/auth";
import type { PortalType } from "@/types/auth";

type LoginFormValues = {
  email: string;
  password: string;
};

const portalStartPaths: Record<PortalType, string> = {
  admin: "/admin/dashboard",
  client: "/client/dashboard",
  supplier: "/supplier/dashboard"
};

export function LoginPage() {
  const { t } = useTranslation("auth");
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t("login.email_required")).email(t("login.email_invalid")),
        password: z.string().min(1, t("login.password_required"))
      }),
    [t]
  );
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });
  const redirectPath = useMemo(() => {
    const requestedPath = new URLSearchParams(location.search).get("redirect");
    return requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/admin/dashboard";
  }, [location.search]);

  useEffect(() => {
    if (isBetterAuthConfigured && !isLoading && isAuthenticated && user) {
      navigate(redirectPath === "/admin/dashboard" ? portalStartPaths[user.portal] : redirectPath, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, redirectPath, user]);

  const handleLogin = handleSubmit(async (values) => {
    setSubmitError(null);

    if (!isBetterAuthConfigured) {
      trackEvent(analyticsEvents.loginSuccess, { mode: "demo" });
      navigate(redirectPath, { replace: true });
      return;
    }

    const result = await authClient.signIn.email({
      email: values.email,
      password: values.password
    });

    if (result.error) {
      setSubmitError(result.error.message || t("login.login_failed"));
      return;
    }

    trackEvent(analyticsEvents.loginSuccess, { mode: "password" });
    await authClient.getSession();
  });

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
          <form className="grid gap-4" onSubmit={handleLogin}>
            <label className="grid gap-2 text-sm font-medium">
              {t("login.email")}
              <Input type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email")} />
              {errors.email ? <span className="text-xs font-medium text-destructive">{errors.email.message}</span> : null}
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {t("login.password")}
              <Input type="password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} {...register("password")} />
              {errors.password ? <span className="text-xs font-medium text-destructive">{errors.password.message}</span> : null}
            </label>
            {submitError ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{submitError}</p> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              {isSubmitting ? t("login.submitting") : t("login.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
