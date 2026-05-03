import { useMutation } from "convex/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { getBuildPortalType } from "@/lib/build-portal";
import { localize } from "@/features/rfq/data/client-workflow-data";

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const language = i18n.language;
  const portal = getBuildPortalType();
  const completeOnboarding = useMutation(api.publicAuth.completeOnboarding);
  const [crNumber, setCrNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [expectedMonthly, setExpectedMonthly] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isBetterAuthConfigured || !user) {
      navigate(`/${portal === "admin" ? "admin" : portal}/dashboard`, { replace: true });
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await completeOnboarding({
        actorUserId: user.id as Id<"users">,
        crNumber: crNumber.trim(),
        vatNumber: vatNumber.trim(),
        expectedMonthlyVolumeSar: expectedMonthly ? Number(expectedMonthly) : undefined
      });
      navigate(portal === "admin" ? "/admin/dashboard" : `/${portal}/dashboard`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || localize({ en: "Could not save your company info.", ar: "تعذر حفظ بيانات الشركة." }, language));
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
              {localize({ en: "Welcome — let's set up your company", ar: "أهلاً — لنُعدّ شركتك" }, language)}
            </CardTitle>
            <CardDescription>
              {localize(
                {
                  en: "We need a few more details to enable RFQs, POs, and invoicing.",
                  ar: "نحتاج بعض التفاصيل لتفعيل طلبات التسعير وأوامر الشراء والفواتير."
                },
                language
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm font-medium">
              {localize({ en: "Commercial registration (CR) number", ar: "رقم السجل التجاري" }, language)}
              <Input required value={crNumber} onChange={(e) => setCrNumber(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {localize({ en: "VAT number", ar: "الرقم الضريبي" }, language)}
              <Input required value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {localize({ en: "Expected monthly volume (SAR, optional)", ar: "الحجم الشهري المتوقع (ريال، اختياري)" }, language)}
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                value={expectedMonthly}
                onChange={(e) => setExpectedMonthly(e.target.value)}
              />
            </label>
            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? localize({ en: "Saving…", ar: "جار الحفظ…" }, language)
                : localize({ en: "Finish setup", ar: "إنهاء الإعداد" }, language)}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
