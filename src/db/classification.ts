/**
 * Every table in `public` MUST be classified here (default-deny). The CI guard
 * (src/db/rls.guard.test.ts) fails when a table is missing from all three lists or when a
 * tenant table lacks ENABLE + FORCE row-level security (ARCHITECTURE.md §19.1, §19.2).
 */

/**
 * Managed by Better Auth and touched only through `modules/identity`. No RLS, because Better
 * Auth runs its own queries (no tenant context) — e.g. "which orgs does this user belong to?"
 * happens before an active org exists. Authorization for these is enforced in the identity façade.
 */
export const IDENTITY_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "organization",
  "member",
  "invitation",
  "rate_limit",
] as const;

/** Platform-owned catalog data, readable by everyone, writable only via admin tooling (Phase 2+). */
export const GLOBAL_CATALOG_TABLES = [] as const;

/** Tenant/user-scoped tables: RLS must be enabled AND forced. */
export const TENANT_TABLES = ["profiles", "audit_events"] as const;

/** Drizzle's own bookkeeping table. */
export const SYSTEM_TABLES = ["__drizzle_migrations"] as const;
