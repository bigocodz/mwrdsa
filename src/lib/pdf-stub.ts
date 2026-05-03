/**
 * Slice 24: PDF generation stubs
 * All document types (CPO, SPO, DN, GRN, Invoice) use this shared interface.
 * In production these will call a server-side PDF service or Convex action
 * that streams through Convex file storage. For now, each returns a
 * data URL from a minimal HTML-print template.
 */

import { buildVatSummary, formatSAR, type VatLineItem } from "@/lib/vat";

export type DocumentMetadata = {
  documentType: "CPO" | "SPO" | "DN" | "GRN" | "Invoice";
  documentNumber: string;
  date: string; // ISO date string
  dueDate?: string;
  currency?: string;
  language?: "en" | "ar";
};

export type DocumentParty = {
  name: string;
  address?: string;
  vatNumber?: string;
  crNumber?: string;
};

export type PdfDocumentInput = {
  metadata: DocumentMetadata;
  issuer: DocumentParty;
  recipient: DocumentParty;
  lineItems: VatLineItem[];
  notes?: string;
};

const DOC_TYPE_LABELS: Record<DocumentMetadata["documentType"], { en: string; ar: string }> = {
  CPO: { en: "Client Purchase Order", ar: "أمر شراء العميل" },
  SPO: { en: "Supplier Purchase Order", ar: "أمر الشراء إلى المورد" },
  DN: { en: "Delivery Note", ar: "إشعار التسليم" },
  GRN: { en: "Goods Receipt Note", ar: "إشعار استلام البضاعة" },
  Invoice: { en: "VAT Invoice", ar: "فاتورة ضريبة القيمة المضافة" }
};

/** Generate a minimal printable HTML document and open it in a new window */
export function printDocument(input: PdfDocumentInput): void {
  const lang = input.metadata.language ?? "en";
  const label = DOC_TYPE_LABELS[input.metadata.documentType][lang];
  const vatSummary = buildVatSummary(input.lineItems);
  const dir = lang === "ar" ? "rtl" : "ltr";

  const rows = vatSummary.lineItems
    .map(
      (item, i) =>
        `<tr>
          <td>${i + 1}</td>
          <td>${item.description}</td>
          <td>${item.quantity} ${item.unit}</td>
          <td>${formatSAR(item.unitPrice)}</td>
          <td>${formatSAR(item.lineSubtotal)}</td>
          <td>${formatSAR(item.lineVat)}</td>
          <td>${formatSAR(item.lineTotal)}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <title>${label} — ${input.metadata.documentNumber}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 40px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #555; font-size: 11px; margin-bottom: 24px; }
    .parties { display: flex; gap: 40px; margin-bottom: 24px; }
    .party h3 { font-size: 12px; margin: 0 0 4px; color: #555; text-transform: uppercase; letter-spacing: 0.05em; }
    .party p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: start; }
    th { background: #f5f5f5; font-weight: 600; }
    .totals { margin-inline-start: auto; width: 280px; }
    .totals td { border: none; }
    .totals tr:last-child td { font-weight: 700; border-top: 2px solid #111; }
    .notes { color: #555; font-size: 11px; margin-top: 24px; }
    .footer { margin-top: 48px; color: #999; font-size: 10px; border-top: 1px solid #eee; padding-top: 12px; }
    @media print { @page { margin: 20mm; } body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${label}</h1>
  <div class="meta">
    <span>${input.metadata.documentNumber}</span>
    &nbsp;·&nbsp;
    <span>${input.metadata.date}</span>
    ${input.metadata.dueDate ? `&nbsp;·&nbsp;<span>Due: ${input.metadata.dueDate}</span>` : ""}
  </div>

  <div class="parties">
    <div class="party">
      <h3>${lang === "ar" ? "المُصدر" : "Issued by"}</h3>
      <p><strong>${input.issuer.name}</strong></p>
      ${input.issuer.address ? `<p>${input.issuer.address}</p>` : ""}
      ${input.issuer.vatNumber ? `<p>VAT: ${input.issuer.vatNumber}</p>` : ""}
      ${input.issuer.crNumber ? `<p>CR: ${input.issuer.crNumber}</p>` : ""}
    </div>
    <div class="party">
      <h3>${lang === "ar" ? "المُستلم" : "Recipient"}</h3>
      <p><strong>${input.recipient.name}</strong></p>
      ${input.recipient.address ? `<p>${input.recipient.address}</p>` : ""}
      ${input.recipient.vatNumber ? `<p>VAT: ${input.recipient.vatNumber}</p>` : ""}
      ${input.recipient.crNumber ? `<p>CR: ${input.recipient.crNumber}</p>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>${lang === "ar" ? "الوصف" : "Description"}</th>
        <th>${lang === "ar" ? "الكمية" : "Qty"}</th>
        <th>${lang === "ar" ? "سعر الوحدة" : "Unit Price"}</th>
        <th>${lang === "ar" ? "المجموع الفرعي" : "Subtotal"}</th>
        <th>${lang === "ar" ? "ضريبة القيمة المضافة" : "VAT (15%)"}</th>
        <th>${lang === "ar" ? "الإجمالي" : "Total"}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>${lang === "ar" ? "المجموع قبل الضريبة" : "Subtotal (ex-VAT)"}</td><td>${formatSAR(vatSummary.subtotal)}</td></tr>
    <tr><td>${lang === "ar" ? "ضريبة القيمة المضافة 15%" : "VAT 15%"}</td><td>${formatSAR(vatSummary.vat)}</td></tr>
    <tr><td>${lang === "ar" ? "الإجمالي شامل الضريبة" : "Total (inc. VAT)"}</td><td>${formatSAR(vatSummary.total)}</td></tr>
  </table>

  ${input.notes ? `<div class="notes"><strong>${lang === "ar" ? "ملاحظات" : "Notes"}:</strong> ${input.notes}</div>` : ""}

  <div class="footer">MWRD Connect — ${label} — ${input.metadata.documentNumber}</div>
  <script>window.onload = () => window.print();<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
