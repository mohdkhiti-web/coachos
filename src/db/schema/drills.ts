import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { categories, equipmentTypes, skills, sports } from "./sports";

/**
 * Drills (ARCHITECTURE.md §9). Filterable facets are real, indexed columns; long-form coaching text is
 * validated JSON (`content`, versioned). Skills, equipment and diagrams are normalised into child
 * tables so they can be filtered, reused and (later) aggregated by the session builder.
 *
 * Ownership & visibility (§7.3):
 *   library drill       organization = the reserved PLATFORM org, visibility = public, created_by NULL
 *   organization drill  organization = a workspace, visibility = organization (all members)
 *   personal drill      visibility = private (creator only)
 * Row-level security (drizzle/0003_*.sql) enforces all of this in the database; the app layer's
 * `can()` checks are a second layer, not the only one.
 */

export const drills = pgTable(
  "drills",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id),
    categoryId: uuid("category_id").notNull(),

    title: text("title").notNull(),
    /** One-paragraph summary used on cards and in search results. */
    description: text("description").notNull(),
    locale: text("locale").notNull().default("en"),

    visibility: text("visibility").notNull().default("private"),
    status: text("status").notNull().default("published"),
    level: text("level").notNull(),

    ageMin: smallint("age_min").notNull(),
    ageMax: smallint("age_max").notNull(),
    playersMin: smallint("players_min").notNull(),
    playersMax: smallint("players_max").notNull(),
    durationMin: smallint("duration_min").notNull(),
    durationMax: smallint("duration_max").notNull(),
    /** Sport facet (e.g. half_court); allowed values come from the sport module. */
    space: text("space").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    /** Objective, setup, instructions, coaching points, mistakes, safety, progressions… (Zod-validated, versioned). */
    content: jsonb("content").notNull(),

    sourceKind: text("source_kind").notNull().default("original"),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    /** Stable key for idempotent seeding of library drills. */
    seedKey: text("seed_key"),

    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Lineage when a drill was copied ("fork") from another. */
    forkedFromId: uuid("forked_from_id"),
    /** Optimistic concurrency: updates must present the version they read. */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // a drill's category must belong to the drill's own sport
    foreignKey({
      name: "drills_category_sport_fk",
      columns: [t.categoryId, t.sportId],
      foreignColumns: [categories.id, categories.sportId],
    }),
    foreignKey({
      name: "drills_forked_from_fk",
      columns: [t.forkedFromId],
      foreignColumns: [t.id],
    }).onDelete("set null"),
    // target of composite FKs from child tables
    unique("drills_id_sport_uq").on(t.id, t.sportId),
    uniqueIndex("drills_seed_key_uq")
      .on(t.organizationId, t.seedKey)
      .where(sql`${t.seedKey} IS NOT NULL`),
    index("drills_org_sport_status_idx").on(t.organizationId, t.sportId, t.status),
    index("drills_library_idx").on(t.sportId, t.visibility, t.status, t.categoryId),
    index("drills_level_idx").on(t.sportId, t.level),
    index("drills_created_idx").on(t.sportId, t.createdAt.desc()),

    check("drills_title_len_chk", sql`char_length(${t.title}) BETWEEN 3 AND 120`),
    check("drills_description_len_chk", sql`char_length(${t.description}) BETWEEN 10 AND 300`),
    check("drills_visibility_chk", sql`${t.visibility} IN ('private','organization','public')`),
    check("drills_status_chk", sql`${t.status} IN ('draft','published','archived')`),
    check("drills_level_chk", sql`${t.level} IN ('beginner','intermediate','advanced')`),
    check("drills_source_kind_chk", sql`${t.sourceKind} IN ('original','adapted','external')`),
    check(
      "drills_source_url_chk",
      sql`${t.sourceUrl} IS NULL OR ${t.sourceUrl} ~ '^https://[^\\s]+$'`,
    ),
    check(
      "drills_age_chk",
      sql`${t.ageMin} BETWEEN 3 AND 99 AND ${t.ageMax} BETWEEN ${t.ageMin} AND 99`,
    ),
    check(
      "drills_players_chk",
      sql`${t.playersMin} BETWEEN 1 AND 60 AND ${t.playersMax} BETWEEN ${t.playersMin} AND 60`,
    ),
    check(
      "drills_duration_chk",
      sql`${t.durationMin} BETWEEN 1 AND 240 AND ${t.durationMax} BETWEEN ${t.durationMin} AND 240`,
    ),
    check("drills_tags_chk", sql`cardinality(${t.tags}) <= 8`),
    check("drills_content_chk", sql`jsonb_typeof(${t.content}) = 'object'`),
    check("drills_space_len_chk", sql`char_length(${t.space}) BETWEEN 1 AND 32`),
  ],
);

/** A drill trains one PRIMARY skill and up to a few secondary ones. */
export const drillSkills = pgTable(
  "drill_skills",
  {
    drillId: uuid("drill_id").notNull(),
    skillId: uuid("skill_id").notNull(),
    /** Denormalised so composite FKs can prove drill and skill share a sport. */
    sportId: uuid("sport_id").notNull(),
    role: text("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.drillId, t.skillId] }),
    foreignKey({
      name: "drill_skills_drill_fk",
      columns: [t.drillId, t.sportId],
      foreignColumns: [drills.id, drills.sportId],
    }).onDelete("cascade"),
    foreignKey({
      name: "drill_skills_skill_fk",
      columns: [t.skillId, t.sportId],
      foreignColumns: [skills.id, skills.sportId],
    }),
    uniqueIndex("drill_skills_one_primary_uq")
      .on(t.drillId)
      .where(sql`${t.role} = 'primary'`),
    index("drill_skills_skill_idx").on(t.skillId, t.drillId),
    check("drill_skills_role_chk", sql`${t.role} IN ('primary','secondary')`),
  ],
);

/** Structured equipment (§9.1): lets the session builder aggregate needs and validators check "14 players, 7 balls → pairs OK". */
export const drillEquipment = pgTable(
  "drill_equipment",
  {
    drillId: uuid("drill_id")
      .notNull()
      .references(() => drills.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid("equipment_type_id")
      .notNull()
      .references(() => equipmentTypes.id),
    rule: text("rule").notNull(),
    quantity: smallint("quantity").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.drillId, t.equipmentTypeId] }),
    index("drill_equipment_type_idx").on(t.equipmentTypeId, t.drillId),
    check("drill_equipment_rule_chk", sql`${t.rule} IN ('fixed','per_player','per_pair')`),
    check("drill_equipment_qty_chk", sql`${t.quantity} BETWEEN 1 AND 60`),
  ],
);

/** A drill can have several diagrams (setup, progression 1…). `data` is the structured diagram JSON (engines/diagram). */
export const drillDiagrams = pgTable(
  "drill_diagrams",
  {
    id: uuid("id").primaryKey(),
    drillId: uuid("drill_id")
      .notNull()
      .references(() => drills.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    title: text("title").notNull().default(""),
    schemaVersion: integer("schema_version").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [
    unique("drill_diagrams_position_uq").on(t.drillId, t.position),
    check("drill_diagrams_position_chk", sql`${t.position} BETWEEN 0 AND 4`),
    check("drill_diagrams_title_chk", sql`char_length(${t.title}) <= 60`),
    check("drill_diagrams_data_chk", sql`jsonb_typeof(${t.data}) = 'object'`),
  ],
);
