ALTER TABLE "profiles" ADD COLUMN "sounds_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "sound_volume" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_sound_volume_chk" CHECK ("profiles"."sound_volume" IN (0,25,50,75,100));