/**
 * Database tooling shared by the dev DB runner, the migrate/bootstrap scripts, the Vitest global
 * setup and the Playwright global setup. Tooling only — never imported by app code.
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// __dirname works under tsx (CJS), Vitest (vite-node) and Playwright's TS loader alike.
export const ROOT = path.resolve(__dirname, "..", "..");

/** Local-only credentials for the embedded dev/test clusters. Never used outside localhost. */
export const LOCAL = {
  superuser: "postgres",
  superpassword: "postgres",
  ownerRole: "coachos_owner",
  ownerPassword: "coachos_owner_local",
  appRole: "coachos_app",
  appPassword: "coachos_app_local",
} as const;

export type Cluster = { port: number; dir: string; database: string };

export const DEV_CLUSTER: Cluster = { port: 54329, dir: ".data/pg-dev", database: "coachos" };
export const TEST_CLUSTER: Cluster = {
  port: 54330,
  dir: ".data/pg-test",
  database: "coachos_test",
};
export const E2E_CLUSTER: Cluster = { port: 54331, dir: ".data/pg-e2e", database: "coachos_e2e" };

export function localUrls(c: Cluster) {
  const host = `127.0.0.1:${c.port}`;
  return {
    admin: `postgres://${LOCAL.superuser}:${LOCAL.superpassword}@${host}/${c.database}`,
    adminMaintenance: `postgres://${LOCAL.superuser}:${LOCAL.superpassword}@${host}/postgres`,
    owner: `postgres://${LOCAL.ownerRole}:${LOCAL.ownerPassword}@${host}/${c.database}`,
    app: `postgres://${LOCAL.appRole}:${LOCAL.appPassword}@${host}/${c.database}`,
  };
}

/** Start (initialising on first run) an embedded PostgreSQL cluster and ensure its database exists. */
export async function startCluster(c: Cluster, opts: { fresh?: boolean; quiet?: boolean } = {}) {
  const dir = path.resolve(ROOT, c.dir);
  if (opts.fresh && existsSync(dir)) await rm(dir, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    port: c.port,
    user: LOCAL.superuser,
    password: LOCAL.superpassword,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    // Local-only: skip fsync durability for speed on test clusters.
    postgresFlags: opts.fresh ? ["-c", "fsync=off", "-c", "synchronous_commit=off"] : [],
    onLog: opts.quiet ? () => {} : (m) => process.stdout.write(`[pg] ${m}\n`),
    onError: opts.quiet ? () => {} : (m) => process.stderr.write(`[pg] ${String(m)}\n`),
  });

  if (!existsSync(path.join(dir, "PG_VERSION"))) await pg.initialise();
  await pg.start();

  const maintenance = new Client({ connectionString: localUrls(c).adminMaintenance });
  await maintenance.connect();
  try {
    const exists = await maintenance.query("select 1 from pg_database where datname = $1", [
      c.database,
    ]);
    if (exists.rowCount === 0) await maintenance.query(`create database "${c.database}"`);
  } finally {
    await maintenance.end();
  }
  return pg;
}

/**
 * Create the two runtime roles and lock down the public schema (ARCHITECTURE.md §4.1 "Roles").
 * Idempotent. Run as a privileged user against the target database:
 *   coachos_owner — owns tables, runs migrations, never used by the running app
 *   coachos_app   — runtime; NOSUPERUSER + NOBYPASSRLS, DML only, cannot DDL
 */
export async function bootstrapRoles(
  adminUrl: string,
  passwords: { owner: string; app: string } = {
    owner: LOCAL.ownerPassword,
    app: LOCAL.appPassword,
  },
) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const q = (v: string) => client.escapeLiteral(v);
    const upsertRole = async (name: string, password: string) => {
      const exists = await client.query("select 1 from pg_roles where rolname = $1", [name]);
      const attrs = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS";
      await client.query(
        exists.rowCount === 0
          ? `create role ${name} ${attrs} password ${q(password)}`
          : `alter role ${name} ${attrs} password ${q(password)}`,
      );
    };
    await upsertRole(LOCAL.ownerRole, passwords.owner);
    await upsertRole(LOCAL.appRole, passwords.app);

    const { rows } = await client.query<{ db: string }>("select current_database() as db");
    const db = rows[0]!.db;
    // Managed providers may forbid some of these; each is best-effort.
    const bestEffort = async (sql: string) => {
      try {
        await client.query(sql);
      } catch (err) {
        console.warn(`[bootstrap] skipped (${(err as Error).message}): ${sql}`);
      }
    };
    await bestEffort(`alter database "${db}" owner to ${LOCAL.ownerRole}`);
    await bestEffort(`alter schema public owner to ${LOCAL.ownerRole}`);
    await client.query(`revoke all on schema public from public`);
    await client.query(`grant usage on schema public to ${LOCAL.appRole}`);
    await client.query(`grant usage, create on schema public to ${LOCAL.ownerRole}`);
    await client.query(`grant connect on database "${db}" to ${LOCAL.appRole}, ${LOCAL.ownerRole}`);
  } finally {
    await client.end();
  }
}

/** Apply ./drizzle migrations as the owner role. Forward-only (§21.3). */
export async function runMigrations(ownerUrl: string) {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(ROOT, "drizzle") });
  } finally {
    await client.end();
  }
}

/** Load .env.local into process.env if present (Node's built-in loader; does not override). */
export function loadLocalEnv() {
  const file = path.join(ROOT, ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}
