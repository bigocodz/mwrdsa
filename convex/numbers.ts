// Document numbering helpers. Slice 19 will replace these with the
// `MWRD-CPO-YYYYMMDD-XXXX` formats from the spec; for now the helpers are
// stable enough to seed `transactionRef` linking the CPO/SPO pair.

function paddedRandom() {
  const base = Math.random().toString(36).slice(2, 8).toUpperCase();
  return base.padEnd(6, "0");
}

function dateKey(timestamp = Date.now()) {
  const d = new Date(timestamp);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function generateTransactionRef(timestamp = Date.now()) {
  return `MWRD-TXN-${dateKey(timestamp)}-${paddedRandom()}`;
}

export function generateCpoNumber(timestamp = Date.now()) {
  return `MWRD-CPO-${dateKey(timestamp)}-${paddedRandom()}`;
}

export function generateSpoNumber(timestamp = Date.now()) {
  return `MWRD-SPO-${dateKey(timestamp)}-${paddedRandom()}`;
}

export function generateDeliveryNoteNumber(timestamp = Date.now()) {
  return `MWRD-DN-${dateKey(timestamp)}-${paddedRandom()}`;
}

export function generateGoodsReceiptNumber(timestamp = Date.now()) {
  return `MWRD-GRN-${dateKey(timestamp)}-${paddedRandom()}`;
}

export function generateInvoiceNumber(timestamp = Date.now()) {
  return `MWRD-INV-${dateKey(timestamp)}-${paddedRandom()}`;
}

export function generateMasterProductCode(sequence: number) {
  if (!Number.isFinite(sequence) || sequence < 0) {
    throw new Error("Sequence must be a non-negative number.");
  }
  return `MWRD-PROD-${String(sequence).padStart(5, "0")}`;
}
