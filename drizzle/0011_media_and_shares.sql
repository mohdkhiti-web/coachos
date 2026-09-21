CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text DEFAULT 'logo' NOT NULL,
	"mime" text NOT NULL,
	"name" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_assets_kind_chk" CHECK ("media_assets"."kind" IN ('logo')),
	CONSTRAINT "media_assets_mime_chk" CHECK ("media_assets"."mime" IN ('image/png','image/jpeg','image/svg+xml')),
	CONSTRAINT "media_assets_size_chk" CHECK ("media_assets"."byte_size" BETWEEN 1 AND 1048576),
	CONSTRAINT "media_assets_bytes_chk" CHECK (octet_length("media_assets"."data") = "media_assets"."byte_size"),
	CONSTRAINT "media_assets_dimensions_chk" CHECK ("media_assets"."width" BETWEEN 16 AND 4096 AND "media_assets"."height" BETWEEN 16 AND 4096),
	CONSTRAINT "media_assets_name_chk" CHECK (char_length("media_assets"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "plan_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid,
	"plan_created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "plan_shares_expiry_chk" CHECK ("plan_shares"."expires_at" IS NULL OR "plan_shares"."expires_at" > "plan_shares"."created_at")
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_org_idx" ON "media_assets" USING btree ("organization_id","kind","created_at" DESC NULLS LAST) WHERE "media_assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_shares_one_live_uq" ON "plan_shares" USING btree ("plan_id") WHERE "plan_shares"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "plan_shares_plan_idx" ON "plan_shares" USING btree ("plan_id","created_at" DESC NULLS LAST);
-- ===============================================================================================================
-- Step 7 (hand-written): access rules for stored media and shared sessions. A schema diff cannot express these.
-- ===============================================================================================================

-- Who is reading? Alongside app_user_id() / app_org_id(): a PUBLIC visitor to a share link has neither a user nor a
-- workspace, only the id of the share their link named. Set by `shareTx` (transaction-local), read by the policies below.
CREATE FUNCTION app_share_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.share_id', true), '')::uuid $$;
--> statement-breakpoint

-- Is this share usable right now (not revoked, not past its expiry)? It reads plan_shares through ITS policy, which lets a
-- reader see only the one row whose id they hold.
CREATE FUNCTION share_is_live(p_share uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT EXISTS (
    SELECT 1 FROM "plan_shares" s
    WHERE s.id = p_share AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())
  ) $$;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON "media_assets" TO coachos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "plan_shares" TO coachos_app;
--> statement-breakpoint
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_shares" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_shares" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ---- plan_shares -----------------------------------------------------------------------------------------------
-- Read: the share whose id you hold (a visitor), or, inside your workspace, the shares you made, the shares of sessions
-- you wrote, and — for owners/admins — all of them. (It never reads `plans`: that policy reads this table.)
CREATE POLICY "plan_shares_select" ON "plan_shares" AS PERMISSIVE FOR SELECT
  USING (
    id = app_share_id()
    OR (
      organization_id = app_org_id()
      AND (created_by = app_user_id() OR plan_created_by = app_user_id() OR org_manages(organization_id))
    )
  );
--> statement-breakpoint
-- Make one: as yourself, in your workspace, for a session you may change (can_write_plan: live, not archived, yours or
-- you manage the workspace), and as an author (assistants read, they do not share).
CREATE POLICY "plan_shares_insert" ON "plan_shares" AS PERMISSIVE FOR INSERT
  WITH CHECK (
    organization_id = app_org_id()
    AND created_by = app_user_id()
    AND revoked_at IS NULL
    AND org_authors(organization_id)
    AND can_write_plan(plan_id)
  );
--> statement-breakpoint
-- Revoke: whoever made it, the session's author, or a manager — and still an author.
CREATE POLICY "plan_shares_update" ON "plan_shares" AS PERMISSIVE FOR UPDATE
  USING (
    organization_id = app_org_id()
    AND (created_by = app_user_id() OR plan_created_by = app_user_id() OR org_manages(organization_id))
    AND org_authors(organization_id)
  )
  WITH CHECK (
    organization_id = app_org_id()
    AND (created_by = app_user_id() OR plan_created_by = app_user_id() OR org_manages(organization_id))
    AND org_authors(organization_id)
  );
--> statement-breakpoint

-- What no policy can say: a share is made for a session of ITS workspace (the workspace and the author are copied from the
-- session, never trusted from the request), and afterwards the only change is revoking it — once, for good.
CREATE FUNCTION plan_shares_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_org uuid;
  v_author uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.organization_id, p.created_by INTO v_org, v_author FROM "plans" p WHERE p.id = NEW.plan_id;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'a share needs a session you can see' USING ERRCODE = '23514';
    END IF;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'a share belongs to its session''s workspace' USING ERRCODE = '23514';
    END IF;
    NEW.plan_created_by := v_author;
    RETURN NEW;
  END IF;

  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.plan_created_by IS DISTINCT FROM OLD.plan_created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'a share cannot be changed, only revoked' USING ERRCODE = '42501';
  END IF;
  -- the creator may only be cleared (Postgres itself does that when an account is erased)
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'share ownership is immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'a revoked share stays revoked: make a new link' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "plan_shares_guard_trg" BEFORE INSERT OR UPDATE ON "plan_shares"
  FOR EACH ROW EXECUTE FUNCTION plan_shares_guard();
--> statement-breakpoint

-- ---- plans: what a public visitor may read ---------------------------------------------------------------------------
-- The ONE session their link names, while the link is live and the session is (not deleted, not archived). Everything
-- hanging off a session (activities, objectives, totals) is read through the plans policies, so this opens exactly
-- that session and nothing else. They cannot write anything: there is no write policy for them.
CREATE POLICY "plans_select_shared" ON "plans" AS PERMISSIVE FOR SELECT
  USING (
    deleted_at IS NULL
    AND status <> 'archived'
    AND EXISTS (
      SELECT 1 FROM "plan_shares" s
      WHERE s.id = app_share_id() AND s.plan_id = plans.id
        AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())
    )
  );
--> statement-breakpoint

-- ---- media_assets ----------------------------------------------------------------------------------------------------
-- Read: your workspace's logos (the application lists and serves only live ones — the row must stay visible to its own
-- workspace so it can be soft-deleted); or, for a visitor, the LIVE logos of the workspace of the session their live link
-- names (the application then serves only the one that session's design uses).
CREATE POLICY "media_assets_select" ON "media_assets" AS PERMISSIVE FOR SELECT
  USING (
    organization_id = app_org_id()
    OR (
      deleted_at IS NULL
      AND app_share_id() IS NOT NULL
      AND share_is_live(app_share_id())
      AND EXISTS (
        SELECT 1 FROM "plan_shares" s JOIN "plans" p ON p.id = s.plan_id
        WHERE s.id = app_share_id() AND p.organization_id = media_assets.organization_id
      )
    )
  );
--> statement-breakpoint
CREATE POLICY "media_assets_insert" ON "media_assets" AS PERMISSIVE FOR INSERT
  WITH CHECK (
    organization_id = app_org_id()
    AND created_by = app_user_id()
    AND deleted_at IS NULL
    AND org_authors(organization_id)
  );
--> statement-breakpoint
CREATE POLICY "media_assets_update" ON "media_assets" AS PERMISSIVE FOR UPDATE
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

-- A stored image is never edited (upload a new one); the only change is deleting it, for good. The uploader may be cleared
-- when their account is erased.
CREATE FUNCTION media_assets_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF (to_jsonb(NEW) - 'deleted_at' - 'created_by') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'created_by') THEN
    RAISE EXCEPTION 'a stored image cannot be changed: upload a new one' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'image ownership is immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'a deleted image stays deleted: upload it again' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "media_assets_guard_trg" BEFORE UPDATE ON "media_assets"
  FOR EACH ROW EXECUTE FUNCTION media_assets_guard();
