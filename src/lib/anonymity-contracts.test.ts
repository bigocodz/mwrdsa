/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function exportedBlock(source: string, exportName: string) {
  const start = source.indexOf(`export const ${exportName}`);
  if (start === -1) {
    throw new Error(`Missing export: ${exportName}`);
  }
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function listConvexSources(): string[] {
  const dir = resolve(process.cwd(), "convex");
  const sources: string[] = [];

  function walk(current: string) {
    for (const entry of readdirSync(current)) {
      const full = `${current}/${entry}`;
      const info = statSync(full);
      if (info.isDirectory()) {
        if (entry === "_generated") continue;
        walk(full);
      } else if (entry.endsWith(".ts")) {
        sources.push(full);
      }
    }
  }
  walk(dir);
  return sources;
}

const FIXTURE_REAL_NAMES = [
  "AcmeRealCorp",
  "GlobexRealLtd",
  "FixtureClientReal",
  "FixtureSupplierReal"
];

const CLIENT_FACING_QUERIES = [
  { module: "convex/quotes.ts", export: "getRfqQuoteComparison" },
  { module: "convex/quotes.ts", export: "listReleasedRfqsForClient" },
  { module: "convex/quotes.ts", export: "listReleasedRfqsForClientPaginated" },
  { module: "convex/purchaseOrders.ts", export: "listPurchaseOrdersForActor" },
  { module: "convex/purchaseOrders.ts", export: "listPurchaseOrdersForActorPaginated" },
  { module: "convex/purchaseOrders.ts", export: "getPurchaseOrderDetail" },
  { module: "convex/orders.ts", export: "listOrdersForClientActor" },
  { module: "convex/orders.ts", export: "listOrdersForClientActorPaginated" }
];

const SUPPLIER_FACING_QUERIES = [
  { module: "convex/quotes.ts", export: "listSupplierAssignments" },
  { module: "convex/quotes.ts", export: "listSupplierAssignmentsPaginated" },
  { module: "convex/quotes.ts", export: "getSupplierAssignmentDetail" },
  { module: "convex/quotes.ts", export: "listSupplierQuotesForActor" },
  { module: "convex/quotes.ts", export: "listSupplierQuotesForActorPaginated" },
  { module: "convex/quotes.ts", export: "getQuoteForAssignment" },
  { module: "convex/orders.ts", export: "listOrdersForSupplierActor" },
  { module: "convex/orders.ts", export: "listOrdersForSupplierActorPaginated" }
];

const CROSS_PARTY_BUILDERS = [
  { module: "convex/orders.ts", fn: "buildSupplierOrderRow", role: "supplier" as const },
  { module: "convex/orders.ts", fn: "buildClientOrderRow", role: "client" as const },
  { module: "convex/quotes.ts", fn: "buildSupplierAssignmentRow", role: "supplier" as const }
];

function functionBlock(source: string, fnName: string) {
  const start = source.indexOf(`async function ${fnName}`);
  if (start === -1) {
    throw new Error(`Missing function: ${fnName}`);
  }
  const nextAsync = source.indexOf("\nasync function ", start + 1);
  const nextExport = source.indexOf("\nexport ", start + 1);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  const candidates = [nextAsync, nextExport, nextFunction].filter((index) => index !== -1);
  const next = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, next);
}

describe("anonymity contracts", () => {
  it("never hardcodes fixture real-name strings into convex source", () => {
    const sources = listConvexSources();
    for (const path of sources) {
      const source = readSource(path);
      for (const fixture of FIXTURE_REAL_NAMES) {
        if (source.includes(fixture)) {
          throw new Error(
            `Fixture real-name "${fixture}" leaked into ${path}. Convex queries must never hardcode opposing-party real names.`
          );
        }
      }
    }
    expect(sources.length).toBeGreaterThan(0);
  });

  it("client-facing queries never expose supplier real names, emails, or phones", () => {
    for (const target of CLIENT_FACING_QUERIES) {
      const source = readSource(target.module);
      const block = exportedBlock(source, target.export);

      const supplierNameLeak = /supplier(Org)?\?*\.name\b/.test(block);
      const supplierEmailLeak = /supplier(Org)?\?*\.email\b/.test(block);
      const supplierPhoneLeak = /supplier(Org)?\?*\.phone\b/.test(block);

      expect(supplierNameLeak, `${target.export} accesses supplier.name`).toBe(false);
      expect(supplierEmailLeak, `${target.export} accesses supplier.email`).toBe(false);
      expect(supplierPhoneLeak, `${target.export} accesses supplier.phone`).toBe(false);
    }
  });

  it("supplier-facing queries never expose client real names, emails, or phones", () => {
    for (const target of SUPPLIER_FACING_QUERIES) {
      const source = readSource(target.module);
      const block = exportedBlock(source, target.export);

      const clientNameLeak = /client(Org|Organization)?\?*\.name\b/.test(block);
      const clientEmailLeak = /client(Org|Organization)?\?*\.email\b/.test(block);
      const clientPhoneLeak = /client(Org|Organization)?\?*\.phone\b/.test(block);

      expect(clientNameLeak, `${target.export} accesses client.name`).toBe(false);
      expect(clientEmailLeak, `${target.export} accesses client.email`).toBe(false);
      expect(clientPhoneLeak, `${target.export} accesses client.phone`).toBe(false);
    }
  });

  it("cross-party row builders only return the opposing party as an anonymous id", () => {
    for (const target of CROSS_PARTY_BUILDERS) {
      const source = readSource(target.module);
      const block = functionBlock(source, target.fn);
      if (target.role === "supplier") {
        expect(block).toContain("clientAnonymousId");
        expect(/client(Org|Organization)?\?*\.name\b/.test(block)).toBe(false);
      } else {
        expect(block).toContain("supplierAnonymousId");
        expect(/supplier(Org)?\?*\.name\b/.test(block)).toBe(false);
      }
    }
  });

  it("client-facing quote responses never expose supplier raw cost prices", () => {
    const quotes = readSource("convex/quotes.ts");

    const comparison = exportedBlock(quotes, "getRfqQuoteComparison");
    expect(comparison).not.toContain("supplierUnitPrice");
    expect(comparison).not.toContain("supplierTotalPrice");
    expect(comparison).toContain("clientFinalUnitPrice");
    expect(comparison).toContain("clientFinalTotalPrice");

    const released = exportedBlock(quotes, "listReleasedRfqsForClient");
    expect(released).not.toContain("supplierUnitPrice");
    expect(released).not.toContain("supplierTotalPrice");
  });

  it("supplier-facing quote responses never expose final client prices or margins", () => {
    const quotes = readSource("convex/quotes.ts");

    const supplierQuote = exportedBlock(quotes, "getQuoteForAssignment");
    expect(supplierQuote).not.toContain("clientFinalUnitPrice");
    expect(supplierQuote).not.toContain("clientFinalTotalPrice");
    expect(supplierQuote).not.toContain("marginPercent");
    expect(supplierQuote).not.toContain("currentMarginPercent");
  });

  it("admin queues are the only path that loads opposing-party real names", () => {
    const quotes = readSource("convex/quotes.ts");
    const submittedForAdmin = exportedBlock(quotes, "listSubmittedQuotesForRfq");

    expect(submittedForAdmin).toContain("quote:apply_margin");
    expect(submittedForAdmin).toContain("supplier?.name");
    expect(submittedForAdmin).toContain("clientOrg?.name");
  });
});
