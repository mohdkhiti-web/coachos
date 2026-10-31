CREATE TABLE "players" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid,
	"name" text NOT NULL,
	"date_of_birth" date,
	"classification" numeric(2, 1),
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_name_len_chk" CHECK (char_length("players"."name") BETWEEN 1 AND 80),
	CONSTRAINT "players_notes_len_chk" CHECK (char_length("players"."notes") <= 1000),
	CONSTRAINT "players_status_chk" CHECK ("players"."status" IN ('active','archived')),
	CONSTRAINT "players_version_chk" CHECK ("players"."version" >= 1),
	CONSTRAINT "players_classification_chk" CHECK ("players"."classification" IS NULL OR ("players"."classification" >= 1.0 AND "players"."classification" <= 4.5))
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "teams_name_len_chk" CHECK (char_length("teams"."name") BETWEEN 1 AND 80),
	CONSTRAINT "teams_notes_len_chk" CHECK (char_length("teams"."notes") <= 1000),
	CONSTRAINT "teams_status_chk" CHECK ("teams"."status" IN ('active','archived')),
	CONSTRAINT "teams_version_chk" CHECK ("teams"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "players_org_list_idx" ON "players" USING btree ("organization_id","team_id","status","updated_at" DESC NULLS LAST) WHERE "players"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "teams_org_list_idx" ON "teams" USING btree ("organization_id","sport_id","status","updated_at" DESC NULLS LAST) WHERE "teams"."deleted_at" IS NULL;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------------------------
-- Roster (teams, players): access and integrity (hand-written; see ARCHITECTURE.md §22, modelled on 0010's
-- templates policies). Unlike drills/plans/templates, a roster has no private/organization visibility axis — it
-- is shared workspace data, so read is simply "my workspace" and write is any author-role member, not only the
-- creator. Neither table can be DELETEd by the runtime role: removal is soft (`deleted_at`), so a team removed
-- from the roster still shows correctly on any session history that named it.
-- ---------------------------------------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "teams" TO coachos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "players" TO coachos_app;
--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "teams" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "players" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "teams_select" ON "teams" AS PERMISSIVE FOR SELECT
  USING (organization_id = app_org_id());
--> statement-breakpoint
CREATE POLICY "teams_insert" ON "teams" AS PERMISSIVE FOR INSERT
  WITH CHECK (
    organization_id = app_org_id()
    AND created_by = app_user_id()
    AND deleted_at IS NULL
    AND org_authors(organization_id)
  );
--> statement-breakpoint
CREATE POLICY "teams_update" ON "teams" AS PERMISSIVE FOR UPDATE
  USING (organization_id = app_org_id() AND org_authors(organization_id))
  WITH CHECK (organization_id = app_org_id() AND org_authors(organization_id));
--> statement-breakpoint
-- A player is visible/writable through its OWN organization_id, independent of which team (if any) it's on —
-- team_id is nullable (unassigned players) and reassignable, so it is never part of tenancy.
CREATE POLICY "players_select" ON "players" AS PERMISSIVE FOR SELECT
  USING (organization_id = app_org_id());
--> statement-breakpoint
CREATE POLICY "players_insert" ON "players" AS PERMISSIVE FOR INSERT
  WITH CHECK (
    organization_id = app_org_id()
    AND created_by = app_user_id()
    AND deleted_at IS NULL
    AND org_authors(organization_id)
    AND (team_id IS NULL OR EXISTS (
      SELECT 1 FROM "teams" tm WHERE tm.id = team_id AND tm.organization_id = organization_id
    ))
  );
--> statement-breakpoint
CREATE POLICY "players_update" ON "players" AS PERMISSIVE FOR UPDATE
  USING (organization_id = app_org_id() AND org_authors(organization_id))
  WITH CHECK (
    organization_id = app_org_id()
    AND org_authors(organization_id)
    AND (team_id IS NULL OR EXISTS (
      SELECT 1 FROM "teams" tm WHERE tm.id = team_id AND tm.organization_id = organization_id
    ))
  );
--> statement-breakpoint

-- What no policy can say (it cannot see the OLD row): ownership (workspace, and for teams the sport) never
-- moves; a deleted row is frozen until it is restored. Unlike templates, status ('active'/'archived') is NOT
-- frozen here — archiving a team or player is informational, not a publishing lifecycle, so fixing a typo on an
-- archived row needs no restore-first step.
CREATE FUNCTION teams_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_ignored constant text[] := ARRAY['version', 'updated_at', 'created_by', 'deleted_at'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       AND NOT (NEW.created_by IS NULL AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = OLD.created_by))
    THEN
      RAISE EXCEPTION 'team ownership (creator) is immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.sport_id IS DISTINCT FROM OLD.sport_id
    THEN
      RAISE EXCEPTION 'team ownership (workspace, sport) is immutable' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - v_ignored) IS DISTINCT FROM (to_jsonb(OLD) - v_ignored)
       AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'a deleted team cannot be edited: restore it first' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "teams_guard_trg" BEFORE INSERT OR UPDATE ON "teams"
  FOR EACH ROW EXECUTE FUNCTION teams_guard();
--> statement-breakpoint
CREATE FUNCTION players_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_ignored constant text[] := ARRAY['version', 'updated_at', 'created_by', 'deleted_at'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       AND NOT (NEW.created_by IS NULL AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = OLD.created_by))
    THEN
      RAISE EXCEPTION 'player ownership (creator) is immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'player ownership (workspace) is immutable' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - v_ignored) IS DISTINCT FROM (to_jsonb(OLD) - v_ignored)
       AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'a deleted player cannot be edited: restore it first' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "players_guard_trg" BEFORE INSERT OR UPDATE ON "players"
  FOR EACH ROW EXECUTE FUNCTION players_guard();