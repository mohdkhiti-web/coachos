import { defineConfig } from "drizzle-kit";

// Used by `drizzle-kit generate` (SQL from src/db/schema). Migrations are *applied* by
// scripts/migrate.ts as the owner role.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_OWNER_URL ?? "postgres://localhost:5432/coachos" },
  strict: true,
  verbose: true,
});
