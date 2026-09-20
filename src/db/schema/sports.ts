import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Global catalog (ARCHITECTURE.md §4.2, §8.1): platform-owned reference data, readable by everyone,
 * writable only by the owner role (migrations / `npm run db:seed`). The runtime role has SELECT only.
 * No `organization_id`, no RLS — listed in GLOBAL_CATALOG_TABLES (src/db/classification.ts).
 *
 * Code (geometry, diagram vocabulary) lives in src/sports; this is the *taxonomy* that admins refine.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const sports = pgTable(
  "sports",
  {
    id: uuid("id").primaryKey(),
    /** Stable key, matches SportKey in src/sports/types.ts for implemented sports. */
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    /** active = fully implemented · beta = usable, unfinished · planned = reserved (never exposed in the UI). */
    status: text("status").notNull().default("planned"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [check("sports_status_chk", sql`${t.status} IN ('active','beta','planned')`)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("categories_sport_key_uq").on(t.sportId, t.key),
    // target of composite foreign keys: guarantees a drill's category belongs to the drill's sport
    unique("categories_id_sport_uq").on(t.id, t.sportId),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("skills_sport_key_uq").on(t.sportId, t.key),
    unique("skills_id_sport_uq").on(t.id, t.sportId),
  ],
);

/** `sport_id` NULL = generic equipment usable by any sport (cones, bibs, stopwatch…). */
export const equipmentTypes = pgTable(
  "equipment_types",
  {
    id: uuid("id").primaryKey(),
    sportId: uuid("sport_id").references(() => sports.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("equipment_types_sport_idx").on(t.sportId)],
);
