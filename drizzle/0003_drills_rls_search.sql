-- Hand-written: search, privileges and row-level security for sports & drills (ARCHITECTURE.md §4.5, §7, §19.2).
--
-- Ownership model enforced HERE, in the database (the application's can() is a second layer):
--   • library drills  belong to the reserved PLATFORM organization, visibility = 'public', created_by NULL.
--     Everyone can read them; only a platform context (the seed, later admin tooling) can write them.
--   • organization drills belong to a workspace; visibility 'organization' = all its members, 'private' = creator only.
--   • no ordinary user can ever create a 'public' row.
--
-- The policies deliberately carry NO `TO <role>` clause, so they bind the OWNER role too under FORCE ROW LEVEL
-- SECURITY. That lets the seed run as owner (no write privileges granted to the runtime role on catalogs) while
-- still going through the same rules, with `app.org_id` set to the platform organization.

-- ---------------------------------------------------------------------------------------------------------------
-- Search: unaccented full-text + trigram (typo tolerance). Wrapped in IMMUTABLE functions so they can be used in
-- generated columns and indexes.
-- ---------------------------------------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;
--> statement-breakpoint
CREATE FUNCTION f_array_to_string(text[], text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT array_to_string($1, $2) $$;
--> statement-breakpoint
ALTER TABLE "drills" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', f_unaccent(coalesce("title", ''))), 'A') ||
  setweight(to_tsvector('simple', f_unaccent(coalesce("description", ''))), 'B') ||
  setweight(to_tsvector('simple', f_unaccent(coalesce(f_array_to_string("tags", ' '), ''))), 'C')
) STORED;
--> statement-breakpoint
CREATE INDEX "drills_search_idx" ON "drills" USING gin ("search_vector");
--> statement-breakpoint
-- serves both `LIKE '%…%'` and the word-similarity operator `<%` used for typo-tolerant search
CREATE INDEX "drills_title_trgm_idx" ON "drills" USING gin ((lower(f_unaccent("title"))) gin_trgm_ops);
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges. Catalog: read-only for the runtime role. Drills: no DELETE for users (drills are archived, not
-- deleted); children are rewritten on edit, so they need DELETE (guarded by policy).
-- ---------------------------------------------------------------------------------------------------------------
GRANT SELECT ON "sports", "categories", "skills", "equipment_types" TO coachos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "drills" TO coachos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "drill_skills", "drill_equipment", "drill_diagrams" TO coachos_app;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------------
-- Helper predicates (SECURITY INVOKER: they run with the caller's own privileges and RLS).
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION drill_is_platform(org uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT EXISTS (SELECT 1 FROM "organization" o WHERE o.id = org AND o.type = 'platform') $$;
--> statement-breakpoint
CREATE FUNCTION org_manages(org uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT EXISTS (
    SELECT 1 FROM "member" m
    WHERE m.organization_id = org AND m.user_id = app_user_id() AND m.role IN ('owner', 'admin')
  ) $$;
--> statement-breakpoint
-- May the current actor change this drill (and therefore its skills/equipment/diagrams)?
CREATE FUNCTION can_write_drill(p_drill uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT EXISTS (
    SELECT 1 FROM "drills" d
    WHERE d.id = p_drill
      AND d.organization_id = app_org_id()
      AND (
        drill_is_platform(d.organization_id)
        OR (d.visibility <> 'public' AND (d.created_by = app_user_id() OR org_manages(d.organization_id)))
      )
  ) $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------------
-- drills
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE "drills" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "drills" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- READ: my organization's drills (private ones only for their creator) + the published public library.
CREATE POLICY "drills_select" ON "drills" AS PERMISSIVE FOR SELECT
  USING (
    (organization_id = app_org_id() AND (visibility <> 'private' OR created_by = app_user_id()))
    OR (visibility = 'public' AND status = 'published')
  );
--> statement-breakpoint
-- CREATE: in my own organization, as myself, never public.
CREATE POLICY "drills_insert" ON "drills" AS PERMISSIVE FOR INSERT
  WITH CHECK (
    organization_id = app_org_id()
    AND visibility <> 'public'
    AND created_by = app_user_id()
  );
--> statement-breakpoint
-- CHANGE: my own drills, or any drill in an organization I own/administer — never library rows.
CREATE POLICY "drills_update" ON "drills" AS PERMISSIVE FOR UPDATE
  USING (
    organization_id = app_org_id() AND visibility <> 'public'
    AND (created_by = app_user_id() OR org_manages(organization_id))
  )
  WITH CHECK (
    organization_id = app_org_id() AND visibility <> 'public'
    AND (created_by = app_user_id() OR org_manages(organization_id))
  );
--> statement-breakpoint
-- LIBRARY: the platform context (seed / future admin tooling) may do anything to platform-owned rows.
CREATE POLICY "drills_platform" ON "drills" AS PERMISSIVE FOR ALL
  USING (organization_id = app_org_id() AND drill_is_platform(organization_id))
  WITH CHECK (organization_id = app_org_id() AND drill_is_platform(organization_id));
--> statement-breakpoint
-- Defence in depth: ownership can never be moved, whatever an UPDATE statement says.
CREATE FUNCTION drills_immutable_ownership() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.sport_id IS DISTINCT FROM OLD.sport_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'drill ownership (organization, sport, creator) is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "drills_immutable_ownership_trg" BEFORE UPDATE ON "drills"
  FOR EACH ROW EXECUTE FUNCTION drills_immutable_ownership();
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------------
-- Child tables: readable when the parent drill is readable; writable when the parent is writable.
-- (The EXISTS subquery is itself subject to the drills policies above.)
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE "drill_skills" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "drill_skills" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "drill_skills_select" ON "drill_skills" AS PERMISSIVE FOR SELECT
  USING (EXISTS (SELECT 1 FROM "drills" d WHERE d.id = drill_id));
--> statement-breakpoint
CREATE POLICY "drill_skills_write" ON "drill_skills" AS PERMISSIVE FOR ALL
  USING (can_write_drill(drill_id)) WITH CHECK (can_write_drill(drill_id));
--> statement-breakpoint

ALTER TABLE "drill_equipment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "drill_equipment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "drill_equipment_select" ON "drill_equipment" AS PERMISSIVE FOR SELECT
  USING (EXISTS (SELECT 1 FROM "drills" d WHERE d.id = drill_id));
--> statement-breakpoint
CREATE POLICY "drill_equipment_write" ON "drill_equipment" AS PERMISSIVE FOR ALL
  USING (can_write_drill(drill_id)) WITH CHECK (can_write_drill(drill_id));
--> statement-breakpoint

ALTER TABLE "drill_diagrams" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "drill_diagrams" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "drill_diagrams_select" ON "drill_diagrams" AS PERMISSIVE FOR SELECT
  USING (EXISTS (SELECT 1 FROM "drills" d WHERE d.id = drill_id));
--> statement-breakpoint
CREATE POLICY "drill_diagrams_write" ON "drill_diagrams" AS PERMISSIVE FOR ALL
  USING (can_write_drill(drill_id)) WITH CHECK (can_write_drill(drill_id));
