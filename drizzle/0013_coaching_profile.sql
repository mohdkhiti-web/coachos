-- Basketball coaching profile (onboarding + Settings → Coaching profile). Additive only: new nullable / defaulted columns
-- on the existing user-scoped `profiles` table, so its grants and row-level security already cover them.
-- Migrations are forward-only in this project; to roll back by hand:
--   ALTER TABLE "profiles" DROP CONSTRAINT "profiles_coaching_styles_chk", DROP CONSTRAINT "profiles_needs_chk",
--     DROP CONSTRAINT "profiles_priorities_chk", DROP CONSTRAINT "profiles_typical_players_chk",
--     DROP CONSTRAINT "profiles_age_groups_chk", DROP CONSTRAINT "profiles_coaching_experience_chk";
--   ALTER TABLE "profiles" DROP COLUMN "coaching_profile_completed_at", DROP COLUMN "coaching_styles",
--     DROP COLUMN "needs", DROP COLUMN "priorities", DROP COLUMN "typical_players", DROP COLUMN "age_groups",
--     DROP COLUMN "coaching_experience";
ALTER TABLE "profiles" ADD COLUMN "coaching_experience" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "age_groups" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "typical_players" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "priorities" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "needs" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "coaching_styles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "coaching_profile_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_coaching_experience_chk" CHECK ("profiles"."coaching_experience" IS NULL OR "profiles"."coaching_experience" IN ('new','developing','experienced','advanced','elite'));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_age_groups_chk" CHECK ("profiles"."age_groups" <@ ARRAY['u8','u10','u12','u14','u16','u18','senior']::text[]);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_typical_players_chk" CHECK ("profiles"."typical_players" IS NULL OR "profiles"."typical_players" BETWEEN 1 AND 60);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_priorities_chk" CHECK ("profiles"."priorities" <@ ARRAY['shooting','ball_handling','passing','finishing','footwork','defense','rebounding','basketball_iq','decision_making','team_offense','team_defense','transition','conditioning','game_preparation']::text[]);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_needs_chk" CHECK ("profiles"."needs" <@ ARRAY['practice_planning','session_generation','drill_discovery','player_development','team_management','attendance','game_preparation','ai_coaching','all']::text[]);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_coaching_styles_chk" CHECK ("profiles"."coaching_styles" <@ ARRAY['skill_development','player_development','team_tactical','high_intensity','fundamentals_first','game_preparation','balanced']::text[]);