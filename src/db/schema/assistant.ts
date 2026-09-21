import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { plans } from "./plans";

/**
 * The AI Coaching Assistant's memory (Step 8). Everything here is PRIVATE to one person in one workspace: a conversation is
 * never visible to a colleague, an owner or an admin — it can hold a coach's half-formed thoughts about their players.
 * Rows are created by the application on the person's behalf and read back only for them (row-level security).
 *
 * A message stores what was said (text) and the PROPOSALS the assistant made — small, validated data structures
 * (`modules/assistant/proposals.ts`), never model output as such, and never anything executable. A proposal changes
 * nothing until the coach applies it; applying goes through the normal commands, and the result is written back here.
 */
export const assistantConversations = pgTable(
  "assistant_conversations",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sportKey: text("sport_key").notNull(),
    /** The session the conversation is about, when it was opened from one. Cleared if the session is deleted for good. */
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    title: text("title").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("assistant_conversations_user_idx")
      .on(t.userId, t.updatedAt.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    check("assistant_conversations_title_chk", sql`char_length(${t.title}) <= 120`),
  ],
);

export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: uuid("id").primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => assistantConversations.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Order inside the conversation. */
    seq: integer("seq").notNull(),
    role: text("role").notNull(),
    /** Validated by `messageContentSchema`; the version is inside. */
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assistant_messages_conv_idx").on(t.conversationId, t.seq),
    check("assistant_messages_role_chk", sql`${t.role} IN ('user','assistant')`),
    check("assistant_messages_size_chk", sql`pg_column_size(${t.content}) <= 262144`),
  ],
);

/** What a person has used today (per day, UTC): the daily limit and a cost record. No message text. */
export const assistantUsage = pgTable(
  "assistant_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    messages: integer("messages").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.day] }),
    check(
      "assistant_usage_nonneg_chk",
      sql`${t.messages} >= 0 AND ${t.inputTokens} >= 0 AND ${t.outputTokens} >= 0`,
    ),
  ],
);
