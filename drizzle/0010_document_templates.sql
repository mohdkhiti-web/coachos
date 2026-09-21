CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"config" jsonb NOT NULL,
	"created_by" uuid,
	"forked_from_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_templates_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "document_templates_name_len_chk" CHECK (char_length("document_templates"."name") BETWEEN 1 AND 80),
	CONSTRAINT "document_templates_description_len_chk" CHECK (char_length("document_templates"."description") <= 300),
	CONSTRAINT "document_templates_category_chk" CHECK ("document_templates"."category" IN ('general','practice','game_day','school','academy','youth')),
	CONSTRAINT "document_templates_visibility_chk" CHECK ("document_templates"."visibility" IN ('private','organization')),
	CONSTRAINT "document_templates_status_chk" CHECK ("document_templates"."status" IN ('active','archived')),
	CONSTRAINT "document_templates_config_chk" CHECK (jsonb_typeof("document_templates"."config") = 'object' AND octet_length("document_templates"."config"::text) <= 16000),
	CONSTRAINT "document_templates_version_chk" CHECK ("document_templates"."version" >= 1),
	CONSTRAINT "document_templates_revision_chk" CHECK ("document_templates"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "template_revision" integer;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_forked_from_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."document_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_templates_org_list_idx" ON "document_templates" USING btree ("organization_id","sport_id","status","updated_at" DESC NULLS LAST) WHERE "document_templates"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "document_templates_created_by_idx" ON "document_templates" USING btree ("created_by","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plans_template_idx" ON "plans" USING btree ("template_id") WHERE "plans"."template_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_template_revision_chk" CHECK ("plans"."template_revision" IS NULL OR "plans"."template_revision" >= 1);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------------------------
-- Saved templates: access, integrity, and the session ⇄ template relationship (hand-written; see ARCHITECTURE.md §13.6)
-- ---------------------------------------------------------------------------------------------------------------
-- The runtime role can read, create and change templates; it can never DELETE one (a template is deleted softly, so
-- every session that was based on it keeps a name to show and a record of what it used).
GRANT SELECT, INSERT, UPDATE ON "document_templates" TO coachos_app;
--> statement-breakpoint
ALTER TABLE "document_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document_templates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Read: my workspace's templates, except other people's private ones (exactly as for sessions and drills).
CREATE POLICY "document_templates_select" ON "document_templates" AS PERMISSIVE FOR SELECT
  USING (organization_id = app_org_id() AND (visibility = 'organization' OR created_by = app_user_id()));
--> statement-breakpoint
CREATE POLICY "document_templates_insert" ON "document_templates" AS PERMISSIVE FOR INSERT
  WITH CHECK (
    organization_id = app_org_id()
    AND created_by = app_user_id()
    AND deleted_at IS NULL
    AND org_authors(organization_id)
  );
--> statement-breakpoint
CREATE POLICY "document_templates_update" ON "document_templates" AS PERMISSIVE FOR UPDATE
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

-- What no policy can say (it cannot see the OLD row): ownership never moves (except that Postgres itself may clear
-- `created_by` when the creator's account is erased, recognised by the user really being gone); a deleted template is
-- frozen until it is restored, an archived one until its status changes.
CREATE FUNCTION document_templates_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_ignored constant text[] := ARRAY['version', 'updated_at', 'forked_from_id', 'created_by', 'deleted_at'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       AND NOT (NEW.created_by IS NULL AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = OLD.created_by))
    THEN
      RAISE EXCEPTION 'template ownership (creator) is immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.sport_id IS DISTINCT FROM OLD.sport_id
    THEN
      RAISE EXCEPTION 'template ownership (workspace, sport) is immutable' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - v_ignored) IS DISTINCT FROM (to_jsonb(OLD) - v_ignored) THEN
      IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'a deleted template cannot be edited: restore it first' USING ERRCODE = '42501';
      END IF;
      IF OLD.status = 'archived' AND NEW.status = 'archived' THEN
        RAISE EXCEPTION 'an archived template cannot be edited: restore it first' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "document_templates_guard_trg" BEFORE INSERT OR UPDATE ON "document_templates"
  FOR EACH ROW EXECUTE FUNCTION document_templates_guard();
--> statement-breakpoint

-- A session can only be based on a template of its OWN workspace that its author can see. (Runs as the caller, so row
-- level security applies: another member's private template is not "there".) Unchanged links are not re-checked.
CREATE FUNCTION plans_template_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.template_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.template_id IS NOT DISTINCT FROM OLD.template_id THEN
    RETURN NEW;
  END IF;
  IF NEW.template_revision IS NULL THEN
    RAISE EXCEPTION 'a session based on a template must record the template revision' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "document_templates" t
    WHERE t.id = NEW.template_id AND t.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'a session can only be based on a template of its own workspace' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "plans_template_guard_trg" BEFORE INSERT OR UPDATE ON "plans"
  FOR EACH ROW EXECUTE FUNCTION plans_template_guard();
--> statement-breakpoint

-- plans_guard (0005/0008), one refinement: when a template is removed for good, Postgres clears `plans.template_id`
-- (ON DELETE SET NULL) on every session that used it. That is bookkeeping, not an edit, so it must not be refused on a
-- frozen (archived or deleted) session. Everything else about the guard is unchanged.
CREATE OR REPLACE FUNCTION plans_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_ignored constant text[] := ARRAY['version', 'updated_at', 'forked_from_id', 'created_by', 'deleted_at'];
  v_new jsonb;
  v_old jsonb;
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
    v_new := to_jsonb(NEW) - v_ignored;
    v_old := to_jsonb(OLD) - v_ignored;
    IF NEW.template_id IS NULL AND OLD.template_id IS NOT NULL THEN
      v_new := v_new - 'template_id';
      v_old := v_old - 'template_id';
    END IF;
    IF v_new IS DISTINCT FROM v_old THEN
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
