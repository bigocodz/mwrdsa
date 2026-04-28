import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import arAdmin from "@/i18n/ar/admin.json";
import arAuth from "@/i18n/ar/auth.json";
import arCatalog from "@/i18n/ar/catalog.json";
import arCommon from "@/i18n/ar/common.json";
import arOrders from "@/i18n/ar/orders.json";
import arQuotes from "@/i18n/ar/quotes.json";
import arRfq from "@/i18n/ar/rfq.json";
import arSupplier from "@/i18n/ar/supplier.json";
import enAdmin from "@/i18n/en/admin.json";
import enAuth from "@/i18n/en/auth.json";
import enCatalog from "@/i18n/en/catalog.json";
import enCommon from "@/i18n/en/common.json";
import enOrders from "@/i18n/en/orders.json";
import enQuotes from "@/i18n/en/quotes.json";
import enRfq from "@/i18n/en/rfq.json";
import enSupplier from "@/i18n/en/supplier.json";

export const supportedLanguages = ["ar", "en"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export function getTextDirection(language: string) {
  return language === "ar" ? "rtl" : "ltr";
}

void i18n.use(initReactI18next).init({
  resources: {
    ar: {
      admin: arAdmin,
      auth: arAuth,
      catalog: arCatalog,
      common: arCommon,
      orders: arOrders,
      quotes: arQuotes,
      rfq: arRfq,
      supplier: arSupplier
    },
    en: {
      admin: enAdmin,
      auth: enAuth,
      catalog: enCatalog,
      common: enCommon,
      orders: enOrders,
      quotes: enQuotes,
      rfq: enRfq,
      supplier: enSupplier
    }
  },
  lng: localStorage.getItem("mwrd-language") || "ar",
  fallbackLng: "ar",
  defaultNS: "common",
  interpolation: {
    escapeValue: false
  }
});

i18n.on("languageChanged", (language) => {
  localStorage.setItem("mwrd-language", language);
  document.documentElement.lang = language;
  document.documentElement.dir = getTextDirection(language);
});

document.documentElement.lang = i18n.language;
document.documentElement.dir = getTextDirection(i18n.language);

export { i18n };
