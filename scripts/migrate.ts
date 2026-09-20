/**
 * `npm run db:migrate` — apply pending migrations as the owner role (forward-only).
 * In deployed environments this runs as a pipeline step *before* promotion, never on app boot.
 */
import { loadLocalEnv, runMigrations } from "./lib/local-db";

async function main() {
  loadLocalEnv();
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) {
    console.error("DATABASE_OWNER_URL is not set (see .env.example).");
    process.exit(1);
  }
  await runMigrations(url);
  console.log("✔ Migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
