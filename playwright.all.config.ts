/**
 * Slice 26 — Playwright config for multi-portal E2E testing.
 * Three separate projects, each targeting a different port.
 * The single-portal Playwright config is left as-is; this one is
 * used via: pnpm test:e2e:all
 */
import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const localEnvPath = resolve(process.cwd(), ".env.local");
if (existsSync(localEnvPath)) {
  for (const line of readFileSync(localEnvPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*?)(?:\s+#.*)?$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // portals share backend; run sequentially for determinism
  retries: 1,
  reporter: [["html", { outputFolder: "playwright-report/all" }], ["list"]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "client-portal",
      testMatch: /client\..+\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173"
      }
    },
    {
      name: "supplier-portal",
      testMatch: /supplier\..+\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5174"
      }
    },
    {
      name: "backoffice-portal",
      testMatch: /admin\..+\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5175"
      }
    },
    {
      name: "anonymity",
      testMatch: /anonymity\..+\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173"
      }
    }
  ]
});
