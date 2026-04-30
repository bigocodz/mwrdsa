import type { Id } from "../../../../convex/_generated/dataModel";

export type CsvCatalogProduct = {
  _id: Id<"products">;
  sku: string;
  nameAr: string;
  nameEn: string;
  specificationsAr?: string;
  specificationsEn?: string;
};

export type CsvParsedRow = {
  rowNumber: number;
  productId?: Id<"products">;
  sku?: string;
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  quantity: number;
  unit: string;
};

export type CsvParseError = {
  rowNumber: number;
  reason: "missing_quantity" | "invalid_quantity" | "missing_item" | "unknown_sku";
};

export type CsvParseResult = {
  rows: CsvParsedRow[];
  errors: CsvParseError[];
};

const HEADER_ALIASES: Record<string, string> = {
  sku: "sku",
  quantity: "quantity",
  qty: "quantity",
  unit: "unit",
  uom: "unit",
  description_ar: "description_ar",
  descriptionar: "description_ar",
  ar: "description_ar",
  description_en: "description_en",
  descriptionen: "description_en",
  en: "description_en",
  description: "description_en"
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export function parseRfqCsv(text: string, products: CsvCatalogProduct[]): CsvParseResult {
  const result: CsvParseResult = { rows: [], errors: [] };
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return result;
  }

  const skuIndex = new Map<string, CsvCatalogProduct>();
  for (const product of products) {
    skuIndex.set(product.sku.trim().toLowerCase(), product);
  }

  const headerCells = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase().replace(/\s+/g, "_"));
  const fieldByIndex = headerCells.map((cell) => HEADER_ALIASES[cell] ?? cell);
  const hasHeader = fieldByIndex.includes("quantity") || fieldByIndex.includes("sku");
  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const rowNumber = i + 1;
    const row: Partial<Record<string, string>> = {};

    if (hasHeader) {
      cells.forEach((value, index) => {
        const field = fieldByIndex[index];
        if (field) {
          row[field] = value;
        }
      });
    } else {
      row.sku = cells[0];
      row.quantity = cells[1];
      row.unit = cells[2];
      row.description_ar = cells[3];
      row.description_en = cells[4];
    }

    const sku = row.sku?.trim();
    const quantityRaw = row.quantity?.trim();
    const unit = (row.unit?.trim() || "unit").toLowerCase();
    const descriptionAr = row.description_ar?.trim();
    const descriptionEn = row.description_en?.trim();

    if (!quantityRaw) {
      result.errors.push({ rowNumber, reason: "missing_quantity" });
      continue;
    }
    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      result.errors.push({ rowNumber, reason: "invalid_quantity" });
      continue;
    }

    if (sku) {
      const product = skuIndex.get(sku.toLowerCase());
      if (!product) {
        result.errors.push({ rowNumber, reason: "unknown_sku" });
        continue;
      }
      result.rows.push({
        rowNumber,
        productId: product._id,
        sku: product.sku,
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        descriptionAr: descriptionAr || product.specificationsAr,
        descriptionEn: descriptionEn || product.specificationsEn,
        quantity,
        unit
      });
      continue;
    }

    if (!descriptionAr && !descriptionEn) {
      result.errors.push({ rowNumber, reason: "missing_item" });
      continue;
    }

    result.rows.push({
      rowNumber,
      descriptionAr,
      descriptionEn,
      quantity,
      unit
    });
  }

  return result;
}
