import { describe, expect, it } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { parseRfqCsv, type CsvCatalogProduct } from "./csv-import";

const products: CsvCatalogProduct[] = [
  {
    _id: "prod_1" as Id<"products">,
    sku: "MWRD-IT-001",
    nameAr: "حاسوب",
    nameEn: "Laptop",
    specificationsAr: "16GB",
    specificationsEn: "16GB"
  },
  {
    _id: "prod_2" as Id<"products">,
    sku: "MWRD-OF-002",
    nameAr: "كرسي",
    nameEn: "Chair"
  }
];

describe("parseRfqCsv", () => {
  it("parses a header CSV with SKUs", () => {
    const csv = `sku,quantity,unit\nMWRD-IT-001,2,unit\nMWRD-OF-002,5,box`;
    const result = parseRfqCsv(csv, products);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ productId: "prod_1", quantity: 2, unit: "unit", sku: "MWRD-IT-001" });
    expect(result.rows[1]).toMatchObject({ productId: "prod_2", quantity: 5, unit: "box" });
  });

  it("flags unknown SKUs and bad quantities", () => {
    const csv = `sku,quantity\nMWRD-XX-999,3\nMWRD-IT-001,abc\nMWRD-IT-001,`;
    const result = parseRfqCsv(csv, products);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([
      { rowNumber: 2, reason: "unknown_sku" },
      { rowNumber: 3, reason: "invalid_quantity" },
      { rowNumber: 4, reason: "missing_quantity" }
    ]);
  });

  it("accepts non-catalog rows with descriptions", () => {
    const csv = `sku,quantity,unit,description_ar,description_en\n,4,unit,بند,Custom item`;
    const result = parseRfqCsv(csv, products);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].productId).toBeUndefined();
    expect(result.rows[0]).toMatchObject({ descriptionEn: "Custom item", descriptionAr: "بند", quantity: 4 });
  });

  it("rejects rows missing both SKU and description", () => {
    const csv = `sku,quantity,unit\n,2,unit`;
    const result = parseRfqCsv(csv, products);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([{ rowNumber: 2, reason: "missing_item" }]);
  });
});
