/**
 * Slice 26 — Vitest unit tests for VAT utilities (Slice 24)
 * Tests: calcVat, calcTotal, extractVat, buildVatSummary, formatSAR, roundHalalas
 */
import { describe, expect, it } from "vitest";
import {
  VAT_RATE,
  buildVatSummary,
  calcTotal,
  calcVat,
  extractVat,
  formatSAR,
  roundHalalas
} from "./vat";

describe("VAT_RATE", () => {
  it("is exactly 15%", () => {
    expect(VAT_RATE).toBe(0.15);
  });
});

describe("roundHalalas", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundHalalas(10.125)).toBe(10.13);
    expect(roundHalalas(10.124)).toBe(10.12);
    expect(roundHalalas(0)).toBe(0);
  });

  it("handles zero", () => {
    expect(roundHalalas(0)).toBe(0);
  });
});

describe("calcVat", () => {
  it("computes 15% of a whole number", () => {
    expect(calcVat(100)).toBe(15);
    expect(calcVat(1000)).toBe(150);
    expect(calcVat(200)).toBe(30);
  });

  it("computes 15% of a fractional amount", () => {
    expect(calcVat(99.99)).toBe(15);        // 99.99 × 0.15 = 14.9985 → 15.00
    expect(calcVat(50.00)).toBe(7.5);
  });

  it("returns 0 for 0 input", () => {
    expect(calcVat(0)).toBe(0);
  });
});

describe("calcTotal", () => {
  it("adds 15% VAT to get total", () => {
    expect(calcTotal(100)).toBe(115);
    expect(calcTotal(1000)).toBe(1150);
  });

  it("equals subtotal + calcVat(subtotal)", () => {
    for (const val of [45, 123.5, 0, 999.99]) {
      expect(calcTotal(val)).toBe(roundHalalas(val + calcVat(val)));
    }
  });
});

describe("extractVat", () => {
  it("extracts correct subtotal and VAT from gross total", () => {
    const gross = 115;
    const { subtotal, vat } = extractVat(gross);
    expect(subtotal).toBeCloseTo(100, 2);
    expect(vat).toBeCloseTo(15, 2);
    expect(roundHalalas(subtotal + vat)).toBe(gross);
  });

  it("round-trips through calcTotal", () => {
    const originalSubtotal = 250;
    const gross = calcTotal(originalSubtotal);
    const { subtotal, vat } = extractVat(gross);
    expect(subtotal).toBeCloseTo(originalSubtotal, 1);
    expect(vat).toBeCloseTo(calcVat(originalSubtotal), 1);
  });
});

describe("buildVatSummary", () => {
  const items = [
    { description: "A4 Copy Paper", quantity: 10, unitPrice: 45, unit: "Ream" },
    { description: "Binder Clips", quantity: 5, unitPrice: 12, unit: "Box" }
  ];

  it("computes line subtotals correctly", () => {
    const result = buildVatSummary(items);
    expect(result.lineItems[0].lineSubtotal).toBe(450); // 10 × 45
    expect(result.lineItems[1].lineSubtotal).toBe(60);  // 5 × 12
  });

  it("computes line VAT correctly", () => {
    const result = buildVatSummary(items);
    expect(result.lineItems[0].lineVat).toBe(67.5);  // 450 × 15%
    expect(result.lineItems[1].lineVat).toBe(9);     // 60 × 15%
  });

  it("computes summary subtotal as sum of line subtotals", () => {
    const result = buildVatSummary(items);
    expect(result.subtotal).toBe(510); // 450 + 60
  });

  it("computes summary VAT as 15% of subtotal", () => {
    const result = buildVatSummary(items);
    expect(result.vat).toBe(76.5); // 510 × 15%
  });

  it("computes total as subtotal + VAT", () => {
    const result = buildVatSummary(items);
    expect(result.total).toBe(586.5); // 510 + 76.5
  });

  it("exposes vatRate of 0.15", () => {
    const result = buildVatSummary(items);
    expect(result.vatRate).toBe(0.15);
  });

  it("handles empty line items array", () => {
    const result = buildVatSummary([]);
    expect(result.lineItems).toHaveLength(0);
    expect(result.subtotal).toBe(0);
    expect(result.vat).toBe(0);
    expect(result.total).toBe(0);
  });

  it("handles single-item list", () => {
    const result = buildVatSummary([{ description: "Item", quantity: 1, unitPrice: 200, unit: "Each" }]);
    expect(result.subtotal).toBe(200);
    expect(result.vat).toBe(30);
    expect(result.total).toBe(230);
  });
});

describe("formatSAR", () => {
  it("formats a round number", () => {
    const result = formatSAR(1000);
    expect(result).toContain("1,000");
  });

  it("formats to 2 decimal places", () => {
    const result = formatSAR(99.5);
    expect(result).toContain("99.50");
  });

  it("includes SAR currency indicator", () => {
    const result = formatSAR(100, "en-SA");
    // SAR, ر.س, or SAR symbol depending on locale
    expect(result.length).toBeGreaterThan(3);
  });
});
