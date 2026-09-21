import { defineConfig, devices } from "@playwright/test";
import { E2E_CLUSTER, localUrls } from "./scripts/lib/local-db";

/**
 * E2E runs against a PRODUCTION build (`next build && next start`) so the real nonce-CSP, real
 * compiled bundles and real Server Actions are exercised (ARCHITECTURE.md §20). A throwaway embedded
 * Postgres is created fresh for each run. Email goes to the `file` transport so tests can read links.
 *
 * Uses the system Microsoft Edge (channel "msedge") so no browser download is needed.
 */
const PORT = 3100;
const READY_PORT = 54332;
const urls = localUrls(E2E_CLUSTER);

export const MAIL_DIR = ".data/mail-e2e";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /responsive\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "msedge",
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], channel: "msedge" },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `npx tsx scripts/db-dev.ts --cluster=e2e --fresh --ready-port=${READY_PORT}`,
      url: `http://127.0.0.1:${READY_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/sign-in`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        NODE_ENV: "production",
        APP_URL: `http://localhost:${PORT}`,
        DATABASE_URL: urls.app,
        DATABASE_OWNER_URL: urls.owner,
        BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-123456",
        MAIL_TRANSPORT: "file",
        MAIL_FILE_DIR: MAIL_DIR,
        ALLOW_DEV_MAIL: "true",
        AUTH_BREACH_CHECK: "false", // no network dependency in tests (the check itself is verified manually)
        AUTH_RATE_LIMIT: "false",
        PDF_RATE_PER_MINUTE: "600", // the export matrix takes dozens of PDFs in a minute
        GENERATOR_RATE_PER_MINUTE: "600",
        AI_PROVIDER: "scripted", // a deterministic stand-in for a model, so the assistant is tested end to end without one
        ALLOW_DEV_AI: "true",
        AI_RATE_PER_MINUTE: "600",
        AI_DAILY_MESSAGES: "1000",
        LOG_LEVEL: "warn",
      },
    },
  ],
});
