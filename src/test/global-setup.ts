import {
  bootstrapRoles,
  localUrls,
  runMigrations,
  startCluster,
  TEST_CLUSTER,
} from "../../scripts/lib/local-db";

/**
 * Real PostgreSQL for integration tests — no mocked DB (ARCHITECTURE.md §20). A throwaway embedded
 * cluster is created fresh each run, roles bootstrapped and migrations applied exactly as in dev/prod.
 */
export default async function setup() {
  const pg = await startCluster(TEST_CLUSTER, { fresh: true, quiet: true });
  const urls = localUrls(TEST_CLUSTER);
  await bootstrapRoles(urls.admin);
  await runMigrations(urls.owner);

  return async () => {
    await pg.stop();
  };
}
