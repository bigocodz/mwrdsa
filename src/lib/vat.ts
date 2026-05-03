/**
 * Slice 24: VAT calculation utilities (KSA, 15%)
 * All monetary values are in SAR, stored as integers (halalas = cents).
 * Use helpers below for consistent rounding and display.
 */

export const VAT_RATE = 0.15; // 15% KSA standard rate

/** Round to 2 decimal places (banker's rounding not required for KSA VAT) */
export function roundHalalas(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Calculate VAT amount on a given subtotal */
export function calcVat(subtotal: number): number {
  return roundHalalas(subtotal * VAT_RATE);
}

/** Calculate total including VAT */
export function calcTotal(subtotal: number): number {
  return roundHalalas(subtotal + calcVat(subtotal));
}

/** Break a gross (VAT-inclusive) amount into subtotal + VAT */
export function extractVat(grossTotal: number): { subtotal: number; vat: number } {
  const subtotal = roundHalalas(grossTotal / (1 + VAT_RATE));
  const vat = roundHalalas(grossTotal - subtotal);
  return { subtotal, vat };
}

export type VatLineItem = {
  description: string;
  quantity: number;
  unitPrice: number; // ex-VAT
  unit: string;
};

export type VatSummary = {
  lineItems: Array<VatLineItem & { lineSubtotal: number; lineVat: number; lineTotal: number }>;
  subtotal: number;
  vat: number;
  total: number;
  vatRate: number;
};

/** Compute full VAT summary from a list of line items */
export function buildVatSummary(lineItems: VatLineItem[]): VatSummary {
  let subtotal = 0;

  const enriched = lineItems.map((item) => {
    const lineSubtotal = roundHalalas(item.quantity * item.unitPrice);
    const lineVat = calcVat(lineSubtotal);
    const lineTotal = roundHalalas(lineSubtotal + lineVat);
    subtotal += lineSubtotal;
    return { ...item, lineSubtotal, lineVat, lineTotal };
  });

  subtotal = roundHalalas(subtotal);
  const vat = calcVat(subtotal);
  const total = roundHalalas(subtotal + vat);

  return { lineItems: enriched, subtotal, vat, total, vatRate: VAT_RATE };
}

/** Format SAR amount for display */
export function formatSAR(amount: number, locale = "en-SA"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
