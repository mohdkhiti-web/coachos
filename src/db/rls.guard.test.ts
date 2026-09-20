import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/client";
import { GLOBAL_CATALOG_TABLES, IDENTITY_TABLES, TENANT_TABLES } from "./classification";

/**
 * CI GUARD (ARCHITECTURE.md §19.1/§19.2). Fails the build if:
 *  - a table exists that nobody classified (default-deny: a new table must be a conscious decision),
 *  - a tenant table lacks ENABLE + FORCE row-level security,
 *  - a table with an organization_id column is neither RLS-protected nor explicitly identity-managed,
 *  - the runtime role is over-privileged.
 * Runs against the real migrated database, connected as the real runtime role.
 */

afterAll(async () => {
  await pool.end();
});

const q = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await pool.query<T>(sql, params)).rows;

describe("row-level security guard", () => {
  it("every table in public is classified exactly once", async () => {
    const rows = await q<{ relname: string }>(
      "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p') order by 1",
    );
    const lists = { IDENTITY_TABLES, GLOBAL_CATALOG_TABLES, TENANT_TABLES } as Record<
      string,
      readonly string[]
    >;
    const unclassified: string[] = [];
    const duplicated: string[] = [];
    for (const { relname } of rows) {
      const hits = Object.values(lists).filter((l) => l.includes(relname)).length;
      if (hits === 0) unclassified.push(relname);
      if (hits > 1) duplicated.push(relname);
    }
    expect(unclassified, "add new tables to src/db/classification.ts").toEqual([]);
    expect(duplicated).toEqual([]);
    // and the lists mention no table that doesn't exist (typos / stale entries)
    const existing = new Set(rows.map((r) => r.relname));
    for (const t of [...IDENTITY_TABLES, ...GLOBAL_CATALOG_TABLES, ...TENANT_TABLES]) {
      expect(existing.has(t), `classified table "${t}" does not exist`).toBe(true);
    }
  });

  it("every tenant table has row-level security ENABLED and FORCED", async () => {
    const rows = await q<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      "select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1)",
      [[...TENANT_TABLES]],
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...TENANT_TABLES].sort());
    for (const r of rows) {
      expect(r.relrowsecurity, `${r.relname}: RLS not enabled`).toBe(true);
      expect(r.relforcerowsecurity, `${r.relname}: RLS not forced`).toBe(true);
    }
  });

  it("every tenant table has at least one policy", async () => {
    const rows = await q<{ tablename: string }>(
      "select distinct tablename from pg_policies where schemaname = 'public'",
    );
    const withPolicy = new Set(rows.map((r) => r.tablename));
    for (const t of TENANT_TABLES)
      expect(withPolicy.has(t), `${t} has no policy (RLS would deny everything)`).toBe(true);
  });

  it("no table with an organization_id column is left unprotected, except identity-managed ones", async () => {
    const rows = await q<{ table_name: string }>(
      "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'organization_id'",
    );
    for (const { table_name } of rows) {
      const ok =
        (TENANT_TABLES as readonly string[]).includes(table_name) ||
        (IDENTITY_TABLES as readonly string[]).includes(table_name);
      expect(
        ok,
        `${table_name} has organization_id but is not RLS-protected or identity-managed`,
      ).toBe(true);
    }
  });
});

describe("runtime role least privilege", () => {
  it("is not a superuser, cannot bypass RLS, cannot create databases or roles", async () => {
    const [r] = await q<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
    }>(
      "select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname = current_user",
    );
    expect(r?.rolname).toBe("coachos_app");
    expect(r?.rolsuper).toBe(false);
    expect(r?.rolbypassrls).toBe(false);
    expect(r?.rolcreatedb).toBe(false);
    expect(r?.rolcreaterole).toBe(false);
  });

  it("cannot run DDL in the public schema", async () => {
    const [r] = await q<{ can: boolean }>(
      "select has_schema_privilege(current_user, 'public', 'CREATE') as can",
    );
    expect(r?.can).toBe(false);
    await expect(pool.query("create table should_not_exist (id int)")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("owns none of the tables (the owner role does)", async () => {
    const rows = await q<{ tableowner: string }>(
      "select distinct tableowner from pg_tables where schemaname = 'public'",
    );
    expect(rows.map((r) => r.tableowner)).toEqual(["coachos_owner"]);
  });

  it("drill_favorites is add/remove only: SELECT + INSERT + DELETE, never UPDATE or TRUNCATE", async () => {
    const [r] = await q<{ ins: boolean; sel: boolean; upd: boolean; del: boolean; trunc: boolean }>(
      `select has_table_privilege(current_user, 'drill_favorites', 'INSERT') as ins,
              has_table_privilege(current_user, 'drill_favorites', 'SELECT') as sel,
              has_table_privilege(current_user, 'drill_favorites', 'UPDATE') as upd,
              has_table_privilege(current_user, 'drill_favorites', 'DELETE') as del,
              has_table_privilege(current_user, 'drill_favorites', 'TRUNCATE') as trunc`,
    );
    expect(r).toEqual({ ins: true, sel: true, upd: false, del: true, trunc: false });
  });

  /** What the runtime role may do to a table, as one comparable object. */
  const privileges = async (table: string) => {
    const [r] = await q<{ ins: boolean; sel: boolean; upd: boolean; del: boolean; trunc: boolean }>(
      `select has_table_privilege(current_user, $1, 'INSERT') as ins,
              has_table_privilege(current_user, $1, 'SELECT') as sel,
              has_table_privilege(current_user, $1, 'UPDATE') as upd,
              has_table_privilege(current_user, $1, 'DELETE') as del,
              has_table_privilege(current_user, $1, 'TRUNCATE') as trunc`,
      [table],
    );
    return r;
  };

  it("plans can be read, created and edited but never DELETED or truncated: they are archived or soft-deleted", async () => {
    expect(await privileges("plans")).toEqual({
      ins: true,
      sel: true,
      upd: true,
      del: false,
      trunc: false,
    });
  });

  it("plan_objectives can be added and removed but never edited in place", async () => {
    expect(await privileges("plan_objectives")).toEqual({
      ins: true,
      sel: true,
      upd: false,
      del: true,
      trunc: false,
    });
  });

  it("plan_activities can be added, edited and removed, but never truncated", async () => {
    expect(await privileges("plan_activities")).toEqual({
      ins: true,
      sel: true,
      upd: true,
      del: true,
      trunc: false,
    });
  });

  it("plan_totals (the calculated length and end time) is a read-only view read with the caller's own rights", async () => {
    expect(await privileges("plan_totals")).toEqual({
      ins: false,
      sel: true,
      upd: false,
      del: false,
      trunc: false,
    });
    const [v] = await q<{ reloptions: string[] | null; relkind: string }>(
      "select reloptions, relkind from pg_class where relname = 'plan_totals'",
    );
    expect(v?.relkind).toBe("v");
    expect(v?.reloptions).toContain("security_invoker=true");
  });

  it("age_groups is reference data: the runtime role can only read it", async () => {
    expect(await privileges("age_groups")).toEqual({
      ins: false,
      sel: true,
      upd: false,
      del: false,
      trunc: false,
    });
  });

  it("the session helper functions and triggers run with the CALLER's rights (none is SECURITY DEFINER)", async () => {
    const rows = await q<{ proname: string; prosecdef: boolean }>(
      `select proname, prosecdef from pg_proc
        where proname in ('org_authors','can_write_plan','plans_guard','plan_activities_guard','plan_objectives_guard')`,
    );
    expect(rows.map((r) => r.proname).sort()).toEqual([
      "can_write_plan",
      "org_authors",
      "plan_activities_guard",
      "plan_objectives_guard",
      "plans_guard",
    ]);
    for (const r of rows) expect(r.prosecdef, r.proname).toBe(false);
  });

  it("audit_events is append-only: INSERT + SELECT only", async () => {
    const [r] = await q<{ ins: boolean; sel: boolean; upd: boolean; del: boolean; trunc: boolean }>(
      `select has_table_privilege(current_user, 'audit_events', 'INSERT') as ins,
              has_table_privilege(current_user, 'audit_events', 'SELECT') as sel,
              has_table_privilege(current_user, 'audit_events', 'UPDATE') as upd,
              has_table_privilege(current_user, 'audit_events', 'DELETE') as del,
              has_table_privilege(current_user, 'audit_events', 'TRUNCATE') as trunc`,
    );
    expect(r).toEqual({ ins: true, sel: true, upd: false, del: false, trunc: false });
  });
});
