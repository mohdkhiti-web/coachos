-- Objectives: a coach-friendly vocabulary ("Shooting", "Transition", "Defense") over the detailed skills.
--
-- New catalog tables: objectives, and the detailed skills / categories each one covers. Skills, sub-skills and drill
-- validation are untouched. A session's objectives (plan_objectives) now point at objectives instead of raw skills.
--
-- plan_objectives can hold rows only if someone wrote them through the (UI-less) Step 2 commands, so there is nothing
-- to carry over; rather than drop data silently, the migration refuses to run if any exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "plan_objectives") THEN
    RAISE EXCEPTION 'plan_objectives already has rows: map them from skills to objectives before applying this migration';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "objective_categories" (
	"objective_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	CONSTRAINT "objective_categories_objective_id_category_id_pk" PRIMARY KEY("objective_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "objective_skills" (
	"objective_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	CONSTRAINT "objective_skills_objective_id_skill_id_pk" PRIMARY KEY("objective_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sport_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objectives_sport_key_uq" UNIQUE("sport_id","key"),
	CONSTRAINT "objectives_id_sport_uq" UNIQUE("id","sport_id")
);
--> statement-breakpoint
ALTER TABLE "plan_objectives" ADD COLUMN "objective_id" uuid;--> statement-breakpoint
ALTER TABLE "objective_categories" ADD CONSTRAINT "objective_categories_objective_fk" FOREIGN KEY ("objective_id","sport_id") REFERENCES "public"."objectives"("id","sport_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_categories" ADD CONSTRAINT "objective_categories_category_fk" FOREIGN KEY ("category_id","sport_id") REFERENCES "public"."categories"("id","sport_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_skills" ADD CONSTRAINT "objective_skills_objective_fk" FOREIGN KEY ("objective_id","sport_id") REFERENCES "public"."objectives"("id","sport_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_skills" ADD CONSTRAINT "objective_skills_skill_fk" FOREIGN KEY ("skill_id","sport_id") REFERENCES "public"."skills"("id","sport_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "objective_categories_category_idx" ON "objective_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "objective_skills_skill_idx" ON "objective_skills" USING btree ("skill_id");
--> statement-breakpoint
ALTER TABLE "plan_objectives" DROP CONSTRAINT "plan_objectives_skill_fk";
--> statement-breakpoint
DROP INDEX "plan_objectives_skill_idx";--> statement-breakpoint
ALTER TABLE "plan_objectives" DROP CONSTRAINT "plan_objectives_plan_id_skill_id_pk";--> statement-breakpoint
ALTER TABLE "plan_objectives" ALTER COLUMN "objective_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_objectives" ADD CONSTRAINT "plan_objectives_plan_id_objective_id_pk" PRIMARY KEY("plan_id","objective_id");--> statement-breakpoint
ALTER TABLE "plan_objectives" ADD CONSTRAINT "plan_objectives_objective_fk" FOREIGN KEY ("objective_id","sport_id") REFERENCES "public"."objectives"("id","sport_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_objectives_objective_idx" ON "plan_objectives" USING btree ("objective_id","plan_id");--> statement-breakpoint
ALTER TABLE "plan_objectives" DROP COLUMN "skill_id";
--> statement-breakpoint
-- The catalog is reference data: readable by everyone, writable only by the owner role (migrations / seed).
GRANT SELECT ON "objectives", "objective_skills", "objective_categories" TO coachos_app;
