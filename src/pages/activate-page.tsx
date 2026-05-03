import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient, isBetterAuthConfigured } from "@/lib/auth-client";
import { localize } from "@/features/rfq/data/client-workflow-data";

export function ActivatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { i18n } = useTranslation();
  const language = i18n.language;
  const tokenLookup = useQuery(api.publicAuth.lookupActivationToken, token ? { token } : "skip");
  const completeActivation = useMutation(api.publicAuth.completeActivation);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!tokenLookup) {
      setError(localize({ en: "Activation token is invalid.", ar: "رمز التفعيل غير صالح." }, language));
      return;
    }
    if (password.length < 8) {
      setError(localize({ en: "Password must be at least 8 characters.", ar: "كلمة المرور يجب أن تكون 8 خانات على الأقل." }, language));
      return;
    }
    if (password !== confirm) {
      setError(localize({ en: "Passwords do not match.", ar: "كلمتا المرور غير متطابقتين." }, language));
      return;
    }
    if (!agreed) {
      setError(localize({ en: "Please accept the terms.", ar: "يرجى الموافقة على الشروط." }, language));
      return;
    }
    setSubmitting(true);
    try {
      if (isBetterAuthConfigured) {
        const result = await authClient.signUp.email({
          email: tokenLookup.email,
          name: tokenLookup.name,
          password
        });
        if (result.error) {
          throw new Error(result.error.message ?? "Could not create the credential.");
        }
      }
      await completeActivation({ token });
      navigate("/onboarding", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || localize({ en: "Could not activate account.", ar: "تعذر تفعيل الحساب." }, language));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/35 px-4 py-8">
      <div className="absolute end-4 top-4">
        <LanguageToggle />
      </div>
      <Card className="w-full max-w-lg">
        <CardHeader className="gap-4">
          <BrandLogo className="h-12" />
          <div>
            <CardTitle className="text-2xl">
              {localize({ en: "Activate your account", ar: "تفعيل الحساب" }, language)}
            </CardTitle>
            <CardDescription>
              {tokenLookup
                ? localize({ en: `Set a password for ${tokenLookup.email}.`, ar: `أنشئ كلمة مرور لـ ${tokenLookup.email}.` }, language)
                : localize({ en: "Validating your activation link…", ar: "جار التحقق من رابط التفعيل…" }, language)}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {localize({ en: "Activation token is missing.", ar: "رمز التفعيل غير متوفر." }, language)}
            </p>
          ) : tokenLookup === undefined ? (
            <p className="text-sm text-muted-foreground">
              {localize({ en: "Loading…", ar: "جار التحميل…" }, language)}
            </p>
          ) : tokenLookup === null ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {localize({ en: "Activation link is invalid or has expired.", ar: "رابط التفعيل غير صالح أو منتهي الصلاحية." }, language)}
            </p>
          ) : (
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-sm font-medium">
                {localize({ en: "Password", ar: "كلمة المرور" }, language)}
                <Input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                {localize({ en: "Confirm password", ar: "تأكيد كلمة المرور" }, language)}
                <Input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                {localize({ en: "I agree to the MWRD platform terms.", ar: "أوافق على شروط منصة مورد." }, language)}
              </label>
              {error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting
                  ? localize({ en: "Activating…", ar: "جار التفعيل…" }, language)
                  : localize({ en: "Activate", ar: "تفعيل" }, language)}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
