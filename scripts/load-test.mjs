#!/usr/bin/env node
/**
 * Slice 26 — Load test runner
 * 
 * Triggers the Convex `seedLoadTestData` action via the Convex CLI
 * and prints a structured report to stdout.
 *
 * Usage:
 *   node scripts/load-test.mjs [--rfqs=250] [--batches=25] [--clients=3] [--suppliers=5] [--label=my-run]
 *
 * Requires:
 *   - npx convex run available (npx convex must be installed)
 *   - CONVEX_DEPLOYMENT env var set (or .env.local present)
 */
import { execSync } from "node:child_process";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value];
  })
);

const rfqCount    = parseInt(args.rfqs     ?? "250", 10);
const batchSize   = parseInt(args.batches  ?? "25",  10);
const clientCount = parseInt(args.clients  ?? "3",   10);
const supplierCount = parseInt(args.suppliers ?? "5", 10);
const runLabel    = args.label ?? `load-${Date.now()}`;

console.log(`\n🚀  MWRD Load Test — Slice 26`);
console.log(`   Label     : ${runLabel}`);
console.log(`   RFQs      : ${rfqCount}`);
console.log(`   Batch     : ${batchSize}`);
console.log(`   Clients   : ${clientCount}`);
console.log(`   Suppliers : ${supplierCount}`);
console.log(`\n⏳  Seeding... (this may take a minute)\n`);

const start = Date.now();

try {
  const resultJson = execSync(
    `npx convex run seed:seedLoadTestData '${JSON.stringify({
      rfqCount,
      batchSize,
      clientCount,
      supplierCount,
      runLabel
    })}'`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] }
  );

  const result = JSON.parse(resultJson.trim());
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`✅  Done in ${elapsed}s\n`);
  console.log(`📊  Results:`);
  console.log(`   Run label    : ${result.runLabel}`);
  console.log(`   Batches      : ${result.batches}`);
  console.log(`   RFQs created : ${result.createdRfqs}`);
  console.log(`   Orders created: ${result.createdOrders}`);
  console.log(`   Clients used : ${result.clientCount}`);
  console.log(`   Suppliers used: ${result.supplierCount}`);
  console.log();
} catch (err) {
  console.error("❌  Load test failed:", err.message);
  process.exit(1);
}
