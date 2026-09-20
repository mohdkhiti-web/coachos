/**
 * `npm run db:bootstrap` — one-time setup of the coachos_owner / coachos_app roles on a hosted
 * database (e.g. a Neon branch). Run with a privileged URL:
 *
 *   DATABASE_ADMIN_URL=... COACHOS_OWNER_PASSWORD=... COACHOS_APP_PASSWORD=... npm run db:bootstrap
 *
 * Then set DATABASE_OWNER_URL (owner role) and DATABASE_URL (app role) to URLs using those passwords.
 */
import { bootstrapRoles, loadLocalEnv } from "./lib/local-db";

async function main() {
  loadLocalEnv();
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const owner = process.env.COACHOS_OWNER_PASSWORD;
  const app = process.env.COACHOS_APP_PASSWORD;
  if (!adminUrl || !owner || !app) {
    console.error("Set DATABASE_ADMIN_URL, COACHOS_OWNER_PASSWORD and COACHOS_APP_PASSWORD.");
    process.exit(1);
  }
  await bootstrapRoles(adminUrl, { owner, app });
  console.log("✔ Roles bootstrapped");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
