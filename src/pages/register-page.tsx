import { useMutation } from "convex/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getBuildPortal } from "@/lib/build-portal";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { cn } from "@/lib/utils";

type AccountType = "client" | "supplier";

export function RegisterPage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const language = i18n.language;
  const buildPortal = getBuildPortal();
  const defaultAccountType: AccountType = buildPortal === "supplier" ? "supplier" : "client";
  const [accountType, setAccountType] = useState<AccountType>(defaultAccountType);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const publicRegister = useMutation(api.publicAuth.publicRegisterRequest);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await publicRegister({
        accountType,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        companyName: companyName.trim(),
        language: language === "ar" ? "ar" : "en",
        idempotencyKey: crypto.randomUUID()
      });
      navigate("/register/thank-you", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || localize({ en: "Could not submit your details.", ar: "تعذر إرسال بياناتك." }, language));
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
              {localize({ en: "Request access to MWRD", ar: "طلب الوصول إلى مورد" }, language)}
            </CardTitle>
            <CardDescription>
              {localize(
                {
                  en: "Tell us about you. We will call within 24 hours to verify and activate your account.",
                  ar: "أخبرنا عنك. سنتصل خلال 24 ساعة للتحقق وتفعيل حسابك."
                },
                language
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div
              className="grid gap-2"
              role="radiogroup"
              aria-label={localize({ en: "Account type", ar: "نوع الحساب" }, language)}
            >
              <span className="text-sm font-medium">
                {localize({ en: "Account type", ar: "نوع الحساب" }, language)}
              </span>
              <div className="flex gap-2">
                {(["client", "supplier"] as const).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={accountType === type ? "default" : "outline"}
                    className={cn("flex-1", accountType === type ? "" : "")}
                    onClick={() => setAccountType(type)}
                    aria-pressed={accountType === type}
                  >
                    {type === "client"
                      ? localize({ en: "Client", ar: "عميل" }, language)
                      : localize({ en: "Supplier", ar: "مورد" }, language)}
                  </Button>
                ))}
              </div>
            </div>
            <label className="grid gap-2 text-sm font-medium">
              {localize({ en: "Full name", ar: "الاسم الكامل" }, language)}
              <Input
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {localize({ en: "Email", ar: "البريد الإلكتروني" }, language)}
              <Input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {localize({ en: "Phone", ar: "الجوال" }, language)}
              <Input
                required
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {localize({ en: "Company name", ar: "اسم الشركة" }, language)}
              <Input
                required
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </label>
            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? localize({ en: "Submitting…", ar: "جار الإرسال…" }, language)
                : localize({ en: "Request callback", ar: "اطلب الاتصال" }, language)}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {localize({ en: "Already activated?", ar: "تم تفعيل حسابك؟" }, language)}{" "}
              <a className="font-semibold text-primary" href="/auth/login">
                {localize({ en: "Sign in", ar: "تسجيل الدخول" }, language)}
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
