export type LocalizedText = {
  ar: string;
  en: string;
};

export type CatalogProduct = {
  id: string;
  sku: string;
  category: LocalizedText;
  name: LocalizedText;
  specs: LocalizedText;
  availability: LocalizedText;
};

export type ClientRfq = {
  id: string;
  status: LocalizedText;
  department: LocalizedText;
  items: LocalizedText;
  requestedDate: string;
};

export type ClientQuote = {
  id: string;
  supplierAnonymousId: string;
  rating: string;
  leadTime: LocalizedText;
  finalPrice: string;
  validity: LocalizedText;
};

export type ClientOrder = {
  id: string;
  status: LocalizedText;
  supplierAnonymousId: string;
  eta: LocalizedText;
  currentStep: LocalizedText;
};

export const catalogProducts: CatalogProduct[] = [
  {
    id: "prod-clean-001",
    sku: "CLN-2401",
    category: { ar: "مستلزمات تشغيل", en: "Operations Supplies" },
    name: { ar: "حزمة مستلزمات تنظيف", en: "Cleaning supplies bundle" },
    specs: { ar: "مواد تنظيف ومستهلكات مرافق شهرية", en: "Monthly facilities cleaning and consumables set" },
    availability: { ar: "متاح لطلب تسعير", en: "Ready for RFQ" }
  },
  {
    id: "prod-it-002",
    sku: "IT-1180",
    category: { ar: "تقنية", en: "IT" },
    name: { ar: "ملحقات محطات عمل", en: "Workstation accessories" },
    specs: { ar: "لوحات مفاتيح وفأرات ومحولات", en: "Keyboards, mice, and adapters" },
    availability: { ar: "متاح لطلب تسعير", en: "Ready for RFQ" }
  },
  {
    id: "prod-office-003",
    sku: "OFF-3307",
    category: { ar: "أثاث مكتبي", en: "Office Furniture" },
    name: { ar: "كراسي عمل تشغيلية", en: "Operational task chairs" },
    specs: { ar: "كراسي مكاتب قابلة للتعديل للفرق", en: "Adjustable office chairs for teams" },
    availability: { ar: "يتطلب مطابقة مورد", en: "Supplier matching required" }
  }
];

export const clientRfqs: ClientRfq[] = [
  {
    id: "RFQ-1042",
    status: { ar: "مراجعة الإدارة", en: "Admin review" },
    department: { ar: "المرافق", en: "Facilities" },
    items: { ar: "3 بنود", en: "3 line items" },
    requestedDate: "2026-05-04"
  },
  {
    id: "RFQ-1038",
    status: { ar: "قيد التسعير", en: "Quoting" },
    department: { ar: "تقنية المعلومات", en: "IT" },
    items: { ar: "5 بنود", en: "5 line items" },
    requestedDate: "2026-05-09"
  },
  {
    id: "RFQ-1031",
    status: { ar: "تم إصدار العروض", en: "Quotes released" },
    department: { ar: "الإدارة", en: "Administration" },
    items: { ar: "2 بنود", en: "2 line items" },
    requestedDate: "2026-05-12"
  }
];

export const clientQuotes: ClientQuote[] = [
  {
    id: "Q-8801",
    supplierAnonymousId: "SUP-00821",
    rating: "4.8",
    leadTime: { ar: "5 أيام", en: "5 days" },
    finalPrice: "SAR 18,240",
    validity: { ar: "ينتهي خلال 22 ساعة", en: "Expires in 22 hours" }
  },
  {
    id: "Q-8804",
    supplierAnonymousId: "SUP-00419",
    rating: "4.6",
    leadTime: { ar: "7 أيام", en: "7 days" },
    finalPrice: "SAR 17,980",
    validity: { ar: "ينتهي خلال يومين", en: "Expires in 2 days" }
  },
  {
    id: "Q-8810",
    supplierAnonymousId: "SUP-00277",
    rating: "4.9",
    leadTime: { ar: "4 أيام", en: "4 days" },
    finalPrice: "SAR 19,100",
    validity: { ar: "ينتهي خلال 3 أيام", en: "Expires in 3 days" }
  }
];

export const clientOrders: ClientOrder[] = [
  {
    id: "ORD-7004",
    status: { ar: "قيد التجهيز", en: "Processing" },
    supplierAnonymousId: "SUP-00821",
    eta: { ar: "متوقع 6 مايو", en: "Expected May 6" },
    currentStep: { ar: "المورد يجهز الشحنة", en: "Supplier is preparing shipment" }
  },
  {
    id: "ORD-6998",
    status: { ar: "تم الشحن", en: "Shipped" },
    supplierAnonymousId: "SUP-00419",
    eta: { ar: "متوقع غدا", en: "Expected tomorrow" },
    currentStep: { ar: "بانتظار تأكيد التسليم", en: "Awaiting delivery confirmation" }
  }
];

export function localize(text: LocalizedText, language: string) {
  return language === "en" ? text.en : text.ar;
}
