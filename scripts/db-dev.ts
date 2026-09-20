/**
 * Local database: an embedded PostgreSQL 18 cluster (no Docker/psql/cloud account needed).
 * Real Postgres — the same engine, roles and RLS behaviour as Neon in production.
 *
 *   npm run db:dev                     start the dev cluster (creates + migrates on first run)
 *   npm run db:dev -- --fresh          wipe local data first
 *   --cluster=e2e --ready-port=54332   used by Playwright: throwaway cluster + a readiness URL
 *                                      that answers only once roles + migrations are applied
 */
import { createServer } from "node:http";
import {
  bootstrapRoles,
  DEV_CLUSTER,
  E2E_CLUSTER,
  localUrls,
  runMigrations,
  startCluster,
} from "./lib/local-db";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

async function main() {
  const fresh = process.argv.includes("--fresh");
  const cluster = arg("cluster") === "e2e" ? E2E_CLUSTER : DEV_CLUSTER;
  const readyPort = arg("ready-port");

  const pg = await startCluster(cluster, { fresh, quiet: true });
  const urls = localUrls(cluster);
  await bootstrapRoles(urls.admin);
  await runMigrations(urls.owner);

  if (readyPort) {
    createServer((_req, res) => res.end("ready")).listen(Number(readyPort), "127.0.0.1");
  }

  console.log(
    `\n✔ Local Postgres ready on 127.0.0.1:${cluster.port} (database "${cluster.database}")`,
  );
  console.log(`  Leave this terminal open while developing. Press Ctrl+C to stop.\n`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\nStopping Postgres…");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  setInterval(() => {}, 1 << 30); // keep the process alive
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
