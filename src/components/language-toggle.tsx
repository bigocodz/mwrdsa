import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { analyticsEvents, trackEvent } from "@/lib/analytics";

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const nextLanguage = i18n.language === "ar" ? "en" : "ar";

  function handleLanguageSwitch() {
    void i18n.changeLanguage(nextLanguage);
    trackEvent(analyticsEvents.languageSwitched, { language: nextLanguage });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleLanguageSwitch}>
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span>{nextLanguage.toUpperCase()}</span>
    </Button>
  );
}
