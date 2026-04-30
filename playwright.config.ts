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
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry"
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5174",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
