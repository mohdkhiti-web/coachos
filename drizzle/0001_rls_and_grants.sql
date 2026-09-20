-- Hand-written: privileges + row-level security (ARCHITECTURE.md §4.1 "Roles", §19.2).
--
-- Model
--   coachos_owner  owns every table, runs migrations. Never used by the running app.
--   coachos_app    runtime role. NOSUPERUSER + NOBYPASSRLS (created by `db:bootstrap`). DML only.
--
-- Tenant context is set per transaction by src/lib/db/tx.ts:
--     select set_config('app.user_id', ..., true), set_config('app.org_id', ..., true)
-- (transaction-local => safe with pooled connections). With no context every policy below
-- evaluates to NULL/false, i.e. RLS fails closed.
--
-- Convention for every future migration that adds a table: grant explicitly, classify it in
-- src/db/classification.ts, and enable + force RLS unless it is identity-managed/global.

CREATE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint

-- Identity-managed tables (Better Auth): DML for the runtime role, no RLS (see classification.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "user", "session", "account", "verification", "organization", "member", "invitation", "rate_limit"
  TO coachos_app;
--> statement-breakpoint

-- profiles: user-scoped.
GRANT SELECT, INSERT, UPDATE, DELETE ON "profiles" TO coachos_app;
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "profiles_self" ON "profiles" AS PERMISSIVE FOR ALL TO coachos_app
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
--> statement-breakpoint

-- audit_events: append-only. The runtime role gets INSERT + SELECT and nothing else, so an
-- attacker (or a bug) cannot rewrite history. Reads are limited to the acting user's own events.
GRANT SELECT, INSERT ON "audit_events" TO coachos_app;
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_events_select_own" ON "audit_events" AS PERMISSIVE FOR SELECT TO coachos_app
  USING (user_id = app_user_id());
--> statement-breakpoint
-- Failed sign-ins have no user yet (user_id / organization_id NULL). A row that names a user or
-- organization must match the transaction's context, so one tenant cannot write into another's trail.
CREATE POLICY "audit_events_insert" ON "audit_events" AS PERMISSIVE FOR INSERT TO coachos_app
  WITH CHECK (
    (user_id IS NULL OR user_id = app_user_id())
    AND (organization_id IS NULL OR organization_id = app_org_id())
  );
