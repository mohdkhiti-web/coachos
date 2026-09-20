CREATE TABLE "drill_favorites" (
	"user_id" uuid NOT NULL,
	"drill_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_favorites_user_id_drill_id_pk" PRIMARY KEY("user_id","drill_id")
);
--> statement-breakpoint
ALTER TABLE "drill_skills" DROP CONSTRAINT "drill_skills_role_chk";--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "drills" ADD COLUMN "intensity" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "drills" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "drills" ADD COLUMN "phases" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_favorites" ADD CONSTRAINT "drill_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_favorites" ADD CONSTRAINT "drill_favorites_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_favorites_user_idx" ON "drill_favorites" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_parent_sport_fk" FOREIGN KEY ("parent_id","sport_id") REFERENCES "public"."skills"("id","sport_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skills_parent_idx" ON "skills" USING btree ("sport_id","parent_id");--> statement-breakpoint
CREATE INDEX "drills_intensity_idx" ON "drills" USING btree ("sport_id","intensity");--> statement-breakpoint
CREATE INDEX "drills_format_idx" ON "drills" USING btree ("sport_id","format");--> statement-breakpoint
CREATE INDEX "drills_phases_idx" ON "drills" USING gin ("phases");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_parent_not_self_chk" CHECK ("skills"."parent_id" IS NULL OR "skills"."parent_id" <> "skills"."id");--> statement-breakpoint
ALTER TABLE "drill_skills" ADD CONSTRAINT "drill_skills_role_chk" CHECK ("drill_skills"."role" IN ('primary','secondary','sub'));--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_intensity_chk" CHECK ("drills"."intensity" IN ('low','medium','high'));--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_format_chk" CHECK ("drills"."format" IS NULL OR "drills"."format" ~ '^[a-z0-9][a-z0-9_]{0,15}$');--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_phases_chk" CHECK ("drills"."phases" <@ ARRAY['warm_up','skill','small_sided','game','conditioning','cool_down']::text[] AND cardinality("drills"."phases") <= 6);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------------------------
-- Hand-written: privileges, row-level security and integrity rules the schema diff cannot express.
-- ---------------------------------------------------------------------------------------------------------------

-- Favorites belong to the USER. The runtime role may read, add and remove them — never edit.
GRANT SELECT, INSERT, DELETE ON "drill_favorites" TO coachos_app;
--> statement-breakpoint
ALTER TABLE "drill_favorites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "drill_favorites" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- READ / REMOVE: only my own.
CREATE POLICY "drill_favorites_select" ON "drill_favorites" AS PERMISSIVE FOR SELECT
  USING (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY "drill_favorites_delete" ON "drill_favorites" AS PERMISSIVE FOR DELETE
  USING (user_id = app_user_id());
--> statement-breakpoint
-- ADD: as myself, and only for a drill I am allowed to read (the subquery is itself subject to the drills policies,
-- so another user's private drill can neither be favorited nor probed for existence).
CREATE POLICY "drill_favorites_insert" ON "drill_favorites" AS PERMISSIVE FOR INSERT
  WITH CHECK (user_id = app_user_id() AND EXISTS (SELECT 1 FROM "drills" d WHERE d.id = drill_id));
--> statement-breakpoint

-- Skills form a tree of exactly two levels: a top-level skill and its sub-skills.
CREATE FUNCTION skills_two_levels() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "skills" p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'skills have two levels only: a sub-skill cannot be the parent of another skill' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "skills" c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'skills have two levels only: a skill that has sub-skills cannot become one' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "skills_two_levels_trg" BEFORE INSERT OR UPDATE ON "skills"
  FOR EACH ROW EXECUTE FUNCTION skills_two_levels();