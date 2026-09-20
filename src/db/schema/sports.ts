import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
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
    /** A sub-skill points at its parent skill (two levels only, enforced by a trigger). NULL = a top-level skill. */
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("skills_sport_key_uq").on(t.sportId, t.key),
    unique("skills_id_sport_uq").on(t.id, t.sportId),
    // a sub-skill belongs to the same sport as its parent
    foreignKey({
      name: "skills_parent_sport_fk",
      columns: [t.parentId, t.sportId],
      foreignColumns: [t.id, t.sportId],
    }),
    index("skills_parent_idx").on(t.sportId, t.parentId),
    check("skills_parent_not_self_chk", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
  ],
);

/**
 * Age bands a coach picks from (U8 … Senior). Per sport, because the bands differ between sports and federations.
 * `age_min`/`age_max` are the TYPICAL ages of the band — a session keeps its own numeric range, so "U12 with
 * 11-year-olds" can be stated exactly, and the generator can match drills by age either way.
 */
export const ageGroups = pgTable(
  "age_groups",
  {
    id: uuid("id").primaryKey(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    ageMin: smallint("age_min").notNull(),
    ageMax: smallint("age_max").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("age_groups_sport_key_uq").on(t.sportId, t.key),
    // target of composite foreign keys: guarantees a session's age group belongs to the session's sport
    unique("age_groups_id_sport_uq").on(t.id, t.sportId),
    check(
      "age_groups_age_chk",
      sql`${t.ageMin} BETWEEN 3 AND 99 AND ${t.ageMax} BETWEEN ${t.ageMin} AND 99`,
    ),
  ],
);

/**
 * What a coach says a session is FOR: "Shooting", "Transition", "Defense" — normal coaching language, not the
 * internal taxonomy. An objective is an umbrella over the detailed catalog: it points at skills (a top-level
 * skill also stands for its sub-skills) and at categories, and that mapping is what lets the session builder
 * and, later, the generator find matching drills. Skills, sub-skills and drill validation are untouched.
 */
export const objectives = pgTable(
  "objectives",
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
    unique("objectives_sport_key_uq").on(t.sportId, t.key),
    // target of composite foreign keys: guarantees a session's objective belongs to the session's sport
    unique("objectives_id_sport_uq").on(t.id, t.sportId),
  ],
);

/** The detailed skills an objective covers. Pointing at a top-level skill covers its sub-skills too. */
export const objectiveSkills = pgTable(
  "objective_skills",
  {
    objectiveId: uuid("objective_id").notNull(),
    skillId: uuid("skill_id").notNull(),
    /** Denormalised so composite FKs can prove objective and skill share a sport. */
    sportId: uuid("sport_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.objectiveId, t.skillId] }),
    foreignKey({
      name: "objective_skills_objective_fk",
      columns: [t.objectiveId, t.sportId],
      foreignColumns: [objectives.id, objectives.sportId],
    }).onDelete("cascade"),
    foreignKey({
      name: "objective_skills_skill_fk",
      columns: [t.skillId, t.sportId],
      foreignColumns: [skills.id, skills.sportId],
    }).onDelete("cascade"),
    index("objective_skills_skill_idx").on(t.skillId),
  ],
);

/** The drill categories an objective covers (Transition → the Transition category). */
export const objectiveCategories = pgTable(
  "objective_categories",
  {
    objectiveId: uuid("objective_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    sportId: uuid("sport_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.objectiveId, t.categoryId] }),
    foreignKey({
      name: "objective_categories_objective_fk",
      columns: [t.objectiveId, t.sportId],
      foreignColumns: [objectives.id, objectives.sportId],
    }).onDelete("cascade"),
    foreignKey({
      name: "objective_categories_category_fk",
      columns: [t.categoryId, t.sportId],
      foreignColumns: [categories.id, categories.sportId],
    }).onDelete("cascade"),
    index("objective_categories_category_idx").on(t.categoryId),
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
