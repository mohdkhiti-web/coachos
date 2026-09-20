CREATE TABLE "age_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sport_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"age_min" smallint NOT NULL,
	"age_max" smallint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "age_groups_sport_key_uq" UNIQUE("sport_id","key"),
	CONSTRAINT "age_groups_id_sport_uq" UNIQUE("id","sport_id"),
	CONSTRAINT "age_groups_age_chk" CHECK ("age_groups"."age_min" BETWEEN 3 AND 99 AND "age_groups"."age_max" BETWEEN "age_groups"."age_min" AND 99)
);
--> statement-breakpoint
CREATE TABLE "plan_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"phase" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"duration_min" smallint NOT NULL,
	"repetitions" smallint,
	"players" smallint,
	"notes" text DEFAULT '' NOT NULL,
	"source_drill_id" uuid,
	"source_drill_version" integer,
	"snapshot" jsonb,
	"customized" boolean DEFAULT false NOT NULL,
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_activities_position_uq" UNIQUE("plan_id","position") DEFERRABLE INITIALLY IMMEDIATE,
	CONSTRAINT "plan_activities_kind_chk" CHECK ("plan_activities"."kind" IN ('drill','custom','break')),
	CONSTRAINT "plan_activities_position_chk" CHECK ("plan_activities"."position" BETWEEN 0 AND 59),
	CONSTRAINT "plan_activities_phase_chk" CHECK ("plan_activities"."phase" IS NULL OR "plan_activities"."phase" IN ('warm_up','skill','small_sided','game','conditioning','cool_down')),
	CONSTRAINT "plan_activities_title_len_chk" CHECK (char_length("plan_activities"."title") BETWEEN 1 AND 120),
	CONSTRAINT "plan_activities_duration_chk" CHECK ("plan_activities"."duration_min" BETWEEN 1 AND 240),
	CONSTRAINT "plan_activities_repetitions_chk" CHECK ("plan_activities"."repetitions" IS NULL OR "plan_activities"."repetitions" BETWEEN 1 AND 99),
	CONSTRAINT "plan_activities_players_chk" CHECK ("plan_activities"."players" IS NULL OR "plan_activities"."players" BETWEEN 1 AND 60),
	CONSTRAINT "plan_activities_notes_len_chk" CHECK (char_length("plan_activities"."notes") <= 2000),
	CONSTRAINT "plan_activities_reason_len_chk" CHECK ("plan_activities"."change_reason" IS NULL OR char_length("plan_activities"."change_reason") BETWEEN 1 AND 300),
	CONSTRAINT "plan_activities_kind_shape_chk" CHECK (("plan_activities"."kind" = 'drill' AND "plan_activities"."snapshot" IS NOT NULL AND "plan_activities"."source_drill_version" IS NOT NULL
             AND ("plan_activities"."snapshot" -> 'provenance' ->> 'drillVersion') IS NOT DISTINCT FROM "plan_activities"."source_drill_version"::text)
        OR ("plan_activities"."kind" = 'custom' AND "plan_activities"."source_drill_id" IS NULL AND "plan_activities"."source_drill_version" IS NULL)
        OR ("plan_activities"."kind" = 'break' AND "plan_activities"."snapshot" IS NULL AND "plan_activities"."source_drill_id" IS NULL AND "plan_activities"."source_drill_version" IS NULL)),
	CONSTRAINT "plan_activities_snapshot_chk" CHECK ("plan_activities"."snapshot" IS NULL OR (jsonb_typeof("plan_activities"."snapshot") = 'object' AND "plan_activities"."snapshot" ? 'schemaVersion' AND octet_length("plan_activities"."snapshot"::text) <= 200000))
);
--> statement-breakpoint
CREATE TABLE "plan_objectives" (
	"plan_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "plan_objectives_plan_id_skill_id_pk" PRIMARY KEY("plan_id","skill_id"),
	CONSTRAINT "plan_objectives_role_chk" CHECK ("plan_objectives"."role" IN ('primary','secondary'))
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"type" text DEFAULT 'training_session' NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"team_name" text,
	"age_group_id" uuid,
	"age_min" smallint,
	"age_max" smallint,
	"level" text,
	"players" smallint,
	"target_minutes" smallint NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"scheduled_date" date,
	"start_time" time(0),
	"timezone" text,
	"details" jsonb DEFAULT '{"schemaVersion":1}'::jsonb NOT NULL,
	"created_by" uuid,
	"forked_from_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_id_sport_uq" UNIQUE("id","sport_id"),
	CONSTRAINT "plans_type_chk" CHECK ("plans"."type" IN ('training_session')),
	CONSTRAINT "plans_status_chk" CHECK ("plans"."status" IN ('draft','published','archived')),
	CONSTRAINT "plans_visibility_chk" CHECK ("plans"."visibility" IN ('private','organization')),
	CONSTRAINT "plans_title_len_chk" CHECK (char_length("plans"."title") BETWEEN 1 AND 120),
	CONSTRAINT "plans_team_len_chk" CHECK ("plans"."team_name" IS NULL OR char_length("plans"."team_name") BETWEEN 1 AND 80),
	CONSTRAINT "plans_level_chk" CHECK ("plans"."level" IS NULL OR "plans"."level" IN ('beginner','intermediate','advanced')),
	CONSTRAINT "plans_players_chk" CHECK ("plans"."players" IS NULL OR "plans"."players" BETWEEN 1 AND 60),
	CONSTRAINT "plans_age_chk" CHECK (("plans"."age_min" IS NULL) = ("plans"."age_max" IS NULL) AND ("plans"."age_min" IS NULL OR ("plans"."age_min" BETWEEN 3 AND 99 AND "plans"."age_max" BETWEEN "plans"."age_min" AND 99))),
	CONSTRAINT "plans_target_chk" CHECK ("plans"."target_minutes" BETWEEN 5 AND 480),
	CONSTRAINT "plans_objective_len_chk" CHECK (char_length("plans"."objective") <= 500),
	CONSTRAINT "plans_start_minutes_chk" CHECK ("plans"."start_time" IS NULL OR extract(second FROM "plans"."start_time") = 0),
	CONSTRAINT "plans_start_needs_date_chk" CHECK ("plans"."start_time" IS NULL OR "plans"."scheduled_date" IS NOT NULL),
	CONSTRAINT "plans_schedule_needs_zone_chk" CHECK (("plans"."scheduled_date" IS NULL AND "plans"."start_time" IS NULL) OR "plans"."timezone" IS NOT NULL),
	CONSTRAINT "plans_timezone_len_chk" CHECK ("plans"."timezone" IS NULL OR char_length("plans"."timezone") BETWEEN 1 AND 64),
	CONSTRAINT "plans_details_chk" CHECK (jsonb_typeof("plans"."details") = 'object' AND octet_length("plans"."details"::text) <= 16000),
	CONSTRAINT "plans_version_chk" CHECK ("plans"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "age_groups" ADD CONSTRAINT "age_groups_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_plan_fk" FOREIGN KEY ("plan_id","sport_id") REFERENCES "public"."plans"("id","sport_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_source_fk" FOREIGN KEY ("source_drill_id","sport_id") REFERENCES "public"."drills"("id","sport_id") ON DELETE set null ("source_drill_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_objectives" ADD CONSTRAINT "plan_objectives_plan_fk" FOREIGN KEY ("plan_id","sport_id") REFERENCES "public"."plans"("id","sport_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_objectives" ADD CONSTRAINT "plan_objectives_skill_fk" FOREIGN KEY ("skill_id","sport_id") REFERENCES "public"."skills"("id","sport_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_age_group_sport_fk" FOREIGN KEY ("age_group_id","sport_id") REFERENCES "public"."age_groups"("id","sport_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_forked_from_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_activities_source_idx" ON "plan_activities" USING btree ("source_drill_id") WHERE "plan_activities"."source_drill_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_objectives_one_primary_uq" ON "plan_objectives" USING btree ("plan_id") WHERE "plan_objectives"."role" = 'primary';--> statement-breakpoint
CREATE INDEX "plan_objectives_skill_idx" ON "plan_objectives" USING btree ("skill_id","plan_id");--> statement-breakpoint
CREATE INDEX "plans_org_list_idx" ON "plans" USING btree ("organization_id","status","updated_at" DESC NULLS LAST) WHERE "plans"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "plans_org_date_idx" ON "plans" USING btree ("organization_id","scheduled_date") WHERE "plans"."scheduled_date" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "plans_created_by_idx" ON "plans" USING btree ("created_by","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "plans_forked_from_idx" ON "plans" USING btree ("forked_from_id") WHERE "plans"."forked_from_id" IS NOT NULL;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------------------------
-- Hand-written: privileges, row-level security, integrity triggers and the totals view (ARCHITECTURE.md §7, §11, §19).
--
-- Who may do what, enforced HERE in the database (the application's can() is a second layer):
--   • read     a session of MY workspace: every member sees 'organization' sessions, only the creator sees 'private' ones.
--              Nobody reads another workspace's sessions, whatever their role. (A soft-deleted session stays readable so
--              it can be listed in a trash and restored; the application hides it everywhere else.)
--   • create   as myself, in my active workspace, and only if I really am an owner/admin/coach/teacher of it —
--              membership is checked against the member table, not just trusted from the session context.
--   • change   my own sessions, or any session of a workspace I own/administer (which I can read). Never a deleted
--              or archived one's timeline: those are frozen until restored.
--   • children (objectives, activities) follow the parent: readable when the session is, writable when it is.
--   • no DELETE on sessions for the runtime role: sessions are archived or soft-deleted, never erased by a user.
-- ---------------------------------------------------------------------------------------------------------------
GRANT SELECT ON "age_groups" TO coachos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "plans" TO coachos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "plan_objectives" TO coachos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "plan_activities" TO coachos_app;
--> statement-breakpoint

-- Helper predicates (SECURITY INVOKER: they run with the caller's own privileges and RLS).
-- Is the current actor an owner/admin/coach/teacher of this workspace? (assistants read, they do not author)
CREATE FUNCTION org_authors(org uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT EXISTS (
    SELECT 1 FROM "member" m
    WHERE m.organization_id = org AND m.user_id = app_user_id()
      AND m.role IN ('owner', 'admin', 'coach', 'teacher')
  ) $$;
--> statement-breakpoint
-- May the current actor change this session's timeline (and therefore its objectives and activities)?
CREATE FUNCTION can_write_plan(p_plan uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT EXISTS (
    SELECT 1 FROM "plans" p
    WHERE p.id = p_plan
      AND p.organization_id = app_org_id()
      AND p.deleted_at IS NULL
      AND p.status <> 'archived'
      AND (p.created_by = app_user_id() OR org_manages(p.organization_id))
      AND org_authors(p.organization_id)
  ) $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plans" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "plans_select" ON "plans" AS PERMISSIVE FOR SELECT
  USING (organization_id = app_org_id() AND (visibility = 'organization' OR created_by = app_user_id()));
--> statement-breakpoint
CREATE POLICY "plans_insert" ON "plans" AS PERMISSIVE FOR INSERT
  WITH CHECK (
    organization_id = app_org_id()
    AND created_by = app_user_id()
    AND deleted_at IS NULL
    AND org_authors(organization_id)
  );
--> statement-breakpoint
CREATE POLICY "plans_update" ON "plans" AS PERMISSIVE FOR UPDATE
  USING (
    organization_id = app_org_id()
    AND (created_by = app_user_id() OR org_manages(organization_id))
    AND org_authors(organization_id)
  )
  WITH CHECK (
    organization_id = app_org_id()
    AND (created_by = app_user_id() OR org_manages(organization_id))
    AND org_authors(organization_id)
  );
--> statement-breakpoint

-- Integrity that no policy can express (a policy cannot see the OLD row):
--  • the time zone must be a real one (the totals view and every document depend on it);
--  • ownership never moves, whatever an UPDATE says — except that Postgres itself may clear `created_by` when the
--    creator's account is erased (ON DELETE SET NULL), which is recognised by the user really being gone;
--  • a deleted session is frozen until it is restored, an archived one until its status changes.
CREATE FUNCTION plans_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_ignored constant text[] := ARRAY['version', 'updated_at', 'forked_from_id', 'created_by'];
BEGIN
  IF NEW.timezone IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.timezone IS DISTINCT FROM OLD.timezone)
     AND NOT EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = NEW.timezone)
  THEN
    RAISE EXCEPTION 'unknown time zone: %', NEW.timezone USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       AND NOT (NEW.created_by IS NULL AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = OLD.created_by))
    THEN
      RAISE EXCEPTION 'session ownership (creator) is immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.sport_id IS DISTINCT FROM OLD.sport_id
       OR NEW.type IS DISTINCT FROM OLD.type
    THEN
      RAISE EXCEPTION 'session ownership (workspace, sport, type) is immutable' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - v_ignored) IS DISTINCT FROM (to_jsonb(OLD) - v_ignored) THEN
      IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'a deleted session cannot be edited: restore it first' USING ERRCODE = '42501';
      END IF;
      IF OLD.status = 'archived' AND NEW.status = 'archived' THEN
        RAISE EXCEPTION 'an archived session cannot be edited: change its status first' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "plans_guard_trg" BEFORE INSERT OR UPDATE ON "plans"
  FOR EACH ROW EXECUTE FUNCTION plans_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------------
-- plan_objectives
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE "plan_objectives" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_objectives" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "plan_objectives_select" ON "plan_objectives" AS PERMISSIVE FOR SELECT
  USING (EXISTS (SELECT 1 FROM "plans" p WHERE p.id = plan_id));
--> statement-breakpoint
CREATE POLICY "plan_objectives_insert" ON "plan_objectives" AS PERMISSIVE FOR INSERT
  WITH CHECK (can_write_plan(plan_id));
--> statement-breakpoint
CREATE POLICY "plan_objectives_delete" ON "plan_objectives" AS PERMISSIVE FOR DELETE
  USING (can_write_plan(plan_id));
--> statement-breakpoint
-- one primary + at most four secondary objectives (mirrors PLAN_LIMITS.maxSecondaryObjectives)
CREATE FUNCTION plan_objectives_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF (SELECT count(*) FROM "plan_objectives" o WHERE o.plan_id = NEW.plan_id) >= 5 THEN
    RAISE EXCEPTION 'a session has at most one primary and four secondary objectives' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "plan_objectives_guard_trg" BEFORE INSERT ON "plan_objectives"
  FOR EACH ROW EXECUTE FUNCTION plan_objectives_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------------
-- plan_activities
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE "plan_activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_activities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "plan_activities_select" ON "plan_activities" AS PERMISSIVE FOR SELECT
  USING (EXISTS (SELECT 1 FROM "plans" p WHERE p.id = plan_id));
--> statement-breakpoint
CREATE POLICY "plan_activities_insert" ON "plan_activities" AS PERMISSIVE FOR INSERT
  WITH CHECK (can_write_plan(plan_id));
--> statement-breakpoint
CREATE POLICY "plan_activities_update" ON "plan_activities" AS PERMISSIVE FOR UPDATE
  USING (can_write_plan(plan_id)) WITH CHECK (can_write_plan(plan_id));
--> statement-breakpoint
CREATE POLICY "plan_activities_delete" ON "plan_activities" AS PERMISSIVE FOR DELETE
  USING (can_write_plan(plan_id));
--> statement-breakpoint

-- Integrity a policy cannot express:
--  • an activity never moves to another session;
--  • a drill can only be ADDED (or swapped in) if the actor may read it — checked when the link is set, through the
--    drills policies. A source that merely becomes unreadable later (made private, archived…) never blocks editing
--    the activity, and its snapshot stays valid: that is the whole point of the snapshot;
--  • the session's activities together stay within PLAN_LIMITS.maxSessionMinutes (720).
CREATE FUNCTION plan_activities_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_others integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    RAISE EXCEPTION 'an activity cannot move to another session' USING ERRCODE = '42501';
  END IF;
  IF NEW.source_drill_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.source_drill_id IS DISTINCT FROM OLD.source_drill_id)
     AND NOT EXISTS (SELECT 1 FROM "drills" d WHERE d.id = NEW.source_drill_id)
  THEN
    RAISE EXCEPTION 'that drill is not available to you' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(SUM(a.duration_min), 0) INTO v_others
    FROM "plan_activities" a WHERE a.plan_id = NEW.plan_id AND a.id <> NEW.id;
  IF v_others + NEW.duration_min > 720 THEN
    RAISE EXCEPTION 'a session cannot be longer than 720 minutes in total' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "plan_activities_guard_trg" BEFORE INSERT OR UPDATE ON "plan_activities"
  FOR EACH ROW EXECUTE FUNCTION plan_activities_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------------
-- plan_totals: the ONLY place a session's length and end time exist. Never stored, so never stale.
--   total_minutes = SUM(plan_activities.duration_min)
--   starts_at     = the local date + start time in the session's zone, as an instant
--   ends_at       = starts_at + total_minutes of elapsed time (so a DST change during the session is honoured)
-- security_invoker: the view is read with the CALLER's row-level security, not the owner's — it can never show
-- totals of sessions the caller cannot see.
-- ---------------------------------------------------------------------------------------------------------------
CREATE VIEW "plan_totals" WITH (security_invoker = true) AS
SELECT
  p.id AS plan_id,
  COALESCE(SUM(a.duration_min), 0)::integer AS total_minutes,
  COUNT(a.id)::integer AS activity_count,
  CASE WHEN p.scheduled_date IS NOT NULL AND p.start_time IS NOT NULL
    THEN (p.scheduled_date + p.start_time) AT TIME ZONE p.timezone
  END AS starts_at,
  CASE WHEN p.scheduled_date IS NOT NULL AND p.start_time IS NOT NULL
    THEN (p.scheduled_date + p.start_time) AT TIME ZONE p.timezone
         + make_interval(mins => COALESCE(SUM(a.duration_min), 0)::integer)
  END AS ends_at
FROM "plans" p
LEFT JOIN "plan_activities" a ON a.plan_id = p.id
GROUP BY p.id;
--> statement-breakpoint
GRANT SELECT ON "plan_totals" TO coachos_app;
