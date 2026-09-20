import "server-only";
import { sql } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { db, type Tx } from "./client";

/**
 * The only sanctioned way to touch tenant/user-scoped tables (ARCHITECTURE.md §19.2).
 * Opens a transaction and sets *transaction-local* settings that the RLS policies read
 * (`app_user_id()` / `app_org_id()`), so the context can never leak across pooled connections.
 *
 * Queries on RLS-protected tables outside one of these helpers see no rows and can write none.
 */
export type TenantContext = { userId: string; organizationId: string };

export async function tenantTx<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertUuid(ctx.userId, "userId");
  assertUuid(ctx.organizationId, "organizationId");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.org_id', ${ctx.organizationId}, true)`,
    );
    return fn(tx);
  });
}

/** User-scoped context only — for the moments before an organization is active (sign-up, sign-in). */
export async function userTx<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertUuid(userId, "userId");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/** No identity context: for rows that legitimately have none (e.g. a failed sign-in for an unknown email). */
export async function anonymousTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

function assertUuid(value: string, name: string) {
  if (!isUuid(value)) throw new Error(`tenant context: ${name} must be a UUID`);
}
