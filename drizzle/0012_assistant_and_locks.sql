CREATE TABLE "assistant_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sport_key" text NOT NULL,
	"plan_id" uuid,
	"title" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assistant_conversations_title_chk" CHECK (char_length("assistant_conversations"."title") <= 120)
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_messages_role_chk" CHECK ("assistant_messages"."role" IN ('user','assistant')),
	CONSTRAINT "assistant_messages_size_chk" CHECK (pg_column_size("assistant_messages"."content") <= 262144)
);
--> statement-breakpoint
CREATE TABLE "assistant_usage" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "assistant_usage_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "assistant_usage_nonneg_chk" CHECK ("assistant_usage"."messages" >= 0 AND "assistant_usage"."input_tokens" >= 0 AND "assistant_usage"."output_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "plan_activities" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_id_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_conversations_user_idx" ON "assistant_conversations" USING btree ("user_id","updated_at" DESC NULLS LAST) WHERE "assistant_conversations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "assistant_messages_conv_idx" ON "assistant_messages" USING btree ("conversation_id","seq");
-- ===============================================================================================================
-- Step 8 (hand-written): access rules for the AI Coaching Assistant's memory. A schema diff cannot express these.
-- A conversation, its messages and a person's usage are PRIVATE to that one person in that one workspace: no colleague,
-- owner or admin can read them. (Nothing in here is ever shared, and there is no public reader.)
-- ===============================================================================================================
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "assistant_conversations" TO coachos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "assistant_messages" TO coachos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "assistant_usage" TO coachos_app;
--> statement-breakpoint
ALTER TABLE "assistant_conversations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "assistant_conversations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "assistant_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "assistant_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "assistant_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "assistant_usage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ---- conversations: mine, in my workspace; about a session I may read (or none) ---------------------------------------
CREATE POLICY "assistant_conversations_select" ON "assistant_conversations" AS PERMISSIVE FOR SELECT
  USING (user_id = app_user_id() AND organization_id = app_org_id());
--> statement-breakpoint
CREATE POLICY "assistant_conversations_insert" ON "assistant_conversations" AS PERMISSIVE FOR INSERT
  WITH CHECK (
    user_id = app_user_id()
    AND organization_id = app_org_id()
    AND deleted_at IS NULL
    AND (plan_id IS NULL OR EXISTS (SELECT 1 FROM "plans" p WHERE p.id = plan_id))
  );
--> statement-breakpoint
CREATE POLICY "assistant_conversations_update" ON "assistant_conversations" AS PERMISSIVE FOR UPDATE
  USING (user_id = app_user_id() AND organization_id = app_org_id())
  WITH CHECK (
    user_id = app_user_id()
    AND organization_id = app_org_id()
    AND (plan_id IS NULL OR EXISTS (SELECT 1 FROM "plans" p WHERE p.id = plan_id))
  );
--> statement-breakpoint

-- ---- messages: mine, inside one of my own conversations --------------------------------------------------------------
CREATE POLICY "assistant_messages_select" ON "assistant_messages" AS PERMISSIVE FOR SELECT
  USING (user_id = app_user_id() AND organization_id = app_org_id());
--> statement-breakpoint
CREATE POLICY "assistant_messages_insert" ON "assistant_messages" AS PERMISSIVE FOR INSERT
  WITH CHECK (
    user_id = app_user_id()
    AND organization_id = app_org_id()
    AND EXISTS (
      SELECT 1 FROM "assistant_conversations" c
      WHERE c.id = conversation_id AND c.user_id = app_user_id() AND c.deleted_at IS NULL
    )
  );
--> statement-breakpoint
CREATE POLICY "assistant_messages_update" ON "assistant_messages" AS PERMISSIVE FOR UPDATE
  USING (user_id = app_user_id() AND organization_id = app_org_id())
  WITH CHECK (user_id = app_user_id() AND organization_id = app_org_id());
--> statement-breakpoint

-- ---- usage: mine ------------------------------------------------------------------------------------------------------
CREATE POLICY "assistant_usage_select" ON "assistant_usage" AS PERMISSIVE FOR SELECT
  USING (user_id = app_user_id() AND organization_id = app_org_id());
--> statement-breakpoint
CREATE POLICY "assistant_usage_insert" ON "assistant_usage" AS PERMISSIVE FOR INSERT
  WITH CHECK (user_id = app_user_id() AND organization_id = app_org_id());
--> statement-breakpoint
CREATE POLICY "assistant_usage_update" ON "assistant_usage" AS PERMISSIVE FOR UPDATE
  USING (user_id = app_user_id() AND organization_id = app_org_id())
  WITH CHECK (user_id = app_user_id() AND organization_id = app_org_id());
--> statement-breakpoint

-- What no policy can say: who owns a conversation, where it lives and what sport it is about never change; a message keeps
-- its place and its author — only what a proposal in it has become (its content) may change afterwards.
CREATE FUNCTION assistant_conversations_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.sport_key IS DISTINCT FROM OLD.sport_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a conversation''s owner, workspace and sport cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "assistant_conversations_guard_trg" BEFORE UPDATE ON "assistant_conversations"
  FOR EACH ROW EXECUTE FUNCTION assistant_conversations_guard();
--> statement-breakpoint
CREATE FUNCTION assistant_messages_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.seq IS DISTINCT FROM OLD.seq
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'only the content of a message can change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "assistant_messages_guard_trg" BEFORE UPDATE ON "assistant_messages"
  FOR EACH ROW EXECUTE FUNCTION assistant_messages_guard();
