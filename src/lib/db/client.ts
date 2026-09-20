import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Runtime connection: the `coachos_app` role (NOSUPERUSER, NOBYPASSRLS, DML only — §4.1).
 * `pg` Pool (not an HTTP driver) because RLS needs interactive transactions (§4.1 "Driver").
 * Cached on globalThis so dev HMR doesn't leak connections.
 */
const globalForDb = globalThis as unknown as { __coachosPool?: Pool };

export const pool =
  globalForDb.__coachosPool ??
  new Pool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX, idleTimeoutMillis: 30_000 });

if (!env.isProduction) globalForDb.__coachosPool = pool;

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
