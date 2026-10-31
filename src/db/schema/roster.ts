import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { sports } from "./sports";

/**
 * A coach's roster (ARCHITECTURE.md §22, Phase "wheelchair basketball" Phase 3): teams and the players on
 * them. Shared workspace data, not personal — unlike drills/plans/templates there is no private/organization
 * visibility axis here; any author-role member of the workspace may read and manage the whole roster.
 *
 * `classification` is a wheelchair-basketball functional-classification point value (1.0–4.5), but the
 * column is generic and sport-agnostic: it is stored as pure REFERENCE metadata a coach can note down and
 * see, never read by the rule-based generator or the AI assistant, and never used to restrict, suggest or
 * gate any drill or exercise. A player need not have one, and a team need not be wheelchair-specific.
 *
 * Ownership, RLS and the guard trigger (as for templates) live in drizzle/0015_*.sql.
 */
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id),
    name: text("name").notNull(),
    /** active ⇄ archived. Deleting is separate: see `deletedAt`. */
    status: text("status").notNull().default("active"),
    notes: text("notes").notNull().default(""),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("teams_id_org_uq").on(t.id, t.organizationId),
    index("teams_org_list_idx")
      .on(t.organizationId, t.sportId, t.status, t.updatedAt.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    check("teams_name_len_chk", sql`char_length(${t.name}) BETWEEN 1 AND 80`),
    check("teams_notes_len_chk", sql`char_length(${t.notes}) <= 1000`),
    check("teams_status_chk", sql`${t.status} IN ('active','archived')`),
    check("teams_version_chk", sql`${t.version} >= 1`),
  ],
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Unassigned (no team yet) is allowed; a removed team clears this, it does not remove the player. */
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    /** Wheelchair-basketball functional classification points (1.0–4.5 in 0.5 steps). Optional, reference only. */
    classification: numeric("classification", { precision: 2, scale: 1, mode: "number" }),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("players_org_list_idx")
      .on(t.organizationId, t.teamId, t.status, t.updatedAt.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    check("players_name_len_chk", sql`char_length(${t.name}) BETWEEN 1 AND 80`),
    check("players_notes_len_chk", sql`char_length(${t.notes}) <= 1000`),
    check("players_status_chk", sql`${t.status} IN ('active','archived')`),
    check("players_version_chk", sql`${t.version} >= 1`),
    check(
      "players_classification_chk",
      sql`${t.classification} IS NULL OR (${t.classification} >= 1.0 AND ${t.classification} <= 4.5)`,
    ),
  ],
);
