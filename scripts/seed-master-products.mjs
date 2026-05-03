#!/usr/bin/env node
/**
 * Slice 26 — Master product seed runner
 *
 * Triggers the Convex `seedMasterProducts` action via the Convex CLI
 * and prints a structured result.
 *
 * Usage:
 *   node scripts/seed-master-products.mjs
 *
 * Requires:
 *   - npx convex run available
 *   - CONVEX_DEPLOYMENT env var set (or .env.local present)
 */
import { execSync } from "node:child_process";

console.log(`\n🌱  MWRD Master Product Catalog Seed — Slice 23`);
console.log(`   Seeding up to 200+ master products across 10 categories...\n`);

const start = Date.now();

try {
  const resultJson = execSync(
    `npx convex run seed:seedMasterProducts '{}'`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] }
  );

  const result = JSON.parse(resultJson.trim());
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`✅  Done in ${elapsed}s\n`);
  console.log(`📊  Results:`);
  console.log(`   New categories : ${result.categoryCount}`);
  console.log(`   New products   : ${result.productCount}`);
  console.log(`   Skipped (exist): ${result.skippedCount}`);
  console.log(`   Total products : ${result.totalProducts}`);
  console.log();
} catch (err) {
  console.error("❌  Seed failed:", err.message);
  process.exit(1);
}
