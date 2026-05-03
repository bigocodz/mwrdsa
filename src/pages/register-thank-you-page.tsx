import { useTranslation } from "react-i18next";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { localize } from "@/features/rfq/data/client-workflow-data";

export function RegisterThankYouPage() {
  const { i18n } = useTranslation();
  const language = i18n.language;

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
              {localize({ en: "Thanks — we'll be in touch", ar: "شكراً — سنتواصل معك" }, language)}
            </CardTitle>
            <CardDescription>
              {localize(
                {
                  en: "We will call within 24 hours to verify your details. Once verified, you will receive an activation email to set your password.",
                  ar: "سنتصل بك خلال 24 ساعة للتحقق من بياناتك. بعد التحقق، ستصلك رسالة تفعيل لإنشاء كلمة المرور."
                },
                language
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {localize(
              {
                en: "If you do not hear from us, please check your spam folder or contact ops@mwrd.io.",
                ar: "إذا لم تصلك أي رسالة، يرجى التحقق من مجلد الرسائل غير المرغوب فيها أو التواصل عبر ops@mwrd.io."
              },
              language
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
