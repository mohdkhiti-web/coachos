/**
 * `npm run db:seed` — apply reference data (sports, taxonomy, equipment) and the curated library drills.
 * Idempotent; run after `db:migrate` (in deployed environments: as a pipeline step, owner role).
 */
import { seedAll } from "../src/db/seed/run";
import { loadLocalEnv } from "./lib/local-db";

async function main() {
  loadLocalEnv();
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) {
    console.error("DATABASE_OWNER_URL is not set (see .env.example).");
    process.exit(1);
  }
  const s = await seedAll(url, (m) => console.log(`✔ ${m}`));
  if (s.drills === 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
