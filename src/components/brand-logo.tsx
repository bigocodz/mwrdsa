import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
};

export function BrandLogo({ className, compact = false }: BrandLogoProps) {
  const { i18n } = useTranslation();
  const src = compact
    ? "/brand/logos/orange-icon.svg"
    : i18n.language === "ar"
      ? "/brand/logos/primary-logo-ar-orange.svg"
      : "/brand/logos/primary-logo-en-orange.svg";

  return <img src={src} alt="MWRD" className={cn("h-9 w-auto shrink-0", compact && "h-8", className)} />;
}
