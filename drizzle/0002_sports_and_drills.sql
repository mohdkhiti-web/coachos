CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sport_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_sport_key_uq" UNIQUE("sport_id","key"),
	CONSTRAINT "categories_id_sport_uq" UNIQUE("id","sport_id")
);
--> statement-breakpoint
CREATE TABLE "equipment_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sport_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sport_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_sport_key_uq" UNIQUE("sport_id","key"),
	CONSTRAINT "skills_id_sport_uq" UNIQUE("id","sport_id")
);
--> statement-breakpoint
CREATE TABLE "sports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_key_unique" UNIQUE("key"),
	CONSTRAINT "sports_status_chk" CHECK ("sports"."status" IN ('active','beta','planned'))
);
--> statement-breakpoint
CREATE TABLE "drill_diagrams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"drill_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"schema_version" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "drill_diagrams_position_uq" UNIQUE("drill_id","position"),
	CONSTRAINT "drill_diagrams_position_chk" CHECK ("drill_diagrams"."position" BETWEEN 0 AND 4),
	CONSTRAINT "drill_diagrams_title_chk" CHECK (char_length("drill_diagrams"."title") <= 60),
	CONSTRAINT "drill_diagrams_data_chk" CHECK (jsonb_typeof("drill_diagrams"."data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "drill_equipment" (
	"drill_id" uuid NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	"rule" text NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "drill_equipment_drill_id_equipment_type_id_pk" PRIMARY KEY("drill_id","equipment_type_id"),
	CONSTRAINT "drill_equipment_rule_chk" CHECK ("drill_equipment"."rule" IN ('fixed','per_player','per_pair')),
	CONSTRAINT "drill_equipment_qty_chk" CHECK ("drill_equipment"."quantity" BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "drill_skills" (
	"drill_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "drill_skills_drill_id_skill_id_pk" PRIMARY KEY("drill_id","skill_id"),
	CONSTRAINT "drill_skills_role_chk" CHECK ("drill_skills"."role" IN ('primary','secondary'))
);
--> statement-breakpoint
CREATE TABLE "drills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"level" text NOT NULL,
	"age_min" smallint NOT NULL,
	"age_max" smallint NOT NULL,
	"players_min" smallint NOT NULL,
	"players_max" smallint NOT NULL,
	"duration_min" smallint NOT NULL,
	"duration_max" smallint NOT NULL,
	"space" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"content" jsonb NOT NULL,
	"source_kind" text DEFAULT 'original' NOT NULL,
	"source_name" text,
	"source_url" text,
	"seed_key" text,
	"created_by" uuid,
	"forked_from_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drills_id_sport_uq" UNIQUE("id","sport_id"),
	CONSTRAINT "drills_title_len_chk" CHECK (char_length("drills"."title") BETWEEN 3 AND 120),
	CONSTRAINT "drills_description_len_chk" CHECK (char_length("drills"."description") BETWEEN 10 AND 300),
	CONSTRAINT "drills_visibility_chk" CHECK ("drills"."visibility" IN ('private','organization','public')),
	CONSTRAINT "drills_status_chk" CHECK ("drills"."status" IN ('draft','published','archived')),
	CONSTRAINT "drills_level_chk" CHECK ("drills"."level" IN ('beginner','intermediate','advanced')),
	CONSTRAINT "drills_source_kind_chk" CHECK ("drills"."source_kind" IN ('original','adapted','external')),
	CONSTRAINT "drills_source_url_chk" CHECK ("drills"."source_url" IS NULL OR "drills"."source_url" ~ '^https://[^\s]+$'),
	CONSTRAINT "drills_age_chk" CHECK ("drills"."age_min" BETWEEN 3 AND 99 AND "drills"."age_max" BETWEEN "drills"."age_min" AND 99),
	CONSTRAINT "drills_players_chk" CHECK ("drills"."players_min" BETWEEN 1 AND 60 AND "drills"."players_max" BETWEEN "drills"."players_min" AND 60),
	CONSTRAINT "drills_duration_chk" CHECK ("drills"."duration_min" BETWEEN 1 AND 240 AND "drills"."duration_max" BETWEEN "drills"."duration_min" AND 240),
	CONSTRAINT "drills_tags_chk" CHECK (cardinality("drills"."tags") <= 8),
	CONSTRAINT "drills_content_chk" CHECK (jsonb_typeof("drills"."content") = 'object'),
	CONSTRAINT "drills_space_len_chk" CHECK (char_length("drills"."space") BETWEEN 1 AND 32)
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_types" ADD CONSTRAINT "equipment_types_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_diagrams" ADD CONSTRAINT "drill_diagrams_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_equipment" ADD CONSTRAINT "drill_equipment_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_equipment" ADD CONSTRAINT "drill_equipment_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_skills" ADD CONSTRAINT "drill_skills_drill_fk" FOREIGN KEY ("drill_id","sport_id") REFERENCES "public"."drills"("id","sport_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_skills" ADD CONSTRAINT "drill_skills_skill_fk" FOREIGN KEY ("skill_id","sport_id") REFERENCES "public"."skills"("id","sport_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_category_sport_fk" FOREIGN KEY ("category_id","sport_id") REFERENCES "public"."categories"("id","sport_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_forked_from_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."drills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_types_sport_idx" ON "equipment_types" USING btree ("sport_id");--> statement-breakpoint
CREATE INDEX "drill_equipment_type_idx" ON "drill_equipment" USING btree ("equipment_type_id","drill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drill_skills_one_primary_uq" ON "drill_skills" USING btree ("drill_id") WHERE "drill_skills"."role" = 'primary';--> statement-breakpoint
CREATE INDEX "drill_skills_skill_idx" ON "drill_skills" USING btree ("skill_id","drill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drills_seed_key_uq" ON "drills" USING btree ("organization_id","seed_key") WHERE "drills"."seed_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "drills_org_sport_status_idx" ON "drills" USING btree ("organization_id","sport_id","status");--> statement-breakpoint
CREATE INDEX "drills_library_idx" ON "drills" USING btree ("sport_id","visibility","status","category_id");--> statement-breakpoint
CREATE INDEX "drills_level_idx" ON "drills" USING btree ("sport_id","level");--> statement-breakpoint
CREATE INDEX "drills_created_idx" ON "drills" USING btree ("sport_id","created_at" DESC NULLS LAST);