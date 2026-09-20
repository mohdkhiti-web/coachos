import path from "node:path";
import { defineConfig } from "vitest/config";
import { localUrls, TEST_CLUSTER } from "./scripts/lib/local-db";

const urls = localUrls(TEST_CLUSTER);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside a React Server environment; tests run in plain Node.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    globalSetup: ["./src/test/global-setup.ts"],
    // One shared real Postgres: run files serially so DB-touching suites don't interleave.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: urls.app, // the runtime role: RLS applies, exactly like production
      DATABASE_OWNER_URL: urls.owner,
      DATABASE_ADMIN_URL: urls.admin,
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
      APP_URL: "http://localhost:3000",
      MAIL_TRANSPORT: "console",
      AUTH_BREACH_CHECK: "false",
    },
  },
});
