import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { drills } from "./drills";
import { ageGroups, objectives, sports } from "./sports";
import { documentTemplates } from "./templates";

/**
 * Plans (ARCHITECTURE.md §11, D8): the one model behind a training session (and, later, a lesson plan).
 *
 *   plans             the session: who owns it, what it is for, when it happens
 *   plan_objectives   its objectives, as references into the sport's existing skills catalog
 *   plan_activities   its timeline: drills (snapshotted), custom activities and breaks, in order
 *
 * Two rules shape everything below:
 *  - NOTHING DERIVED IS STORED. The session's total length is SUM(plan_activities.duration_min) and its end
 *    time is start time + that total (view `plan_totals`, drizzle/0005_*.sql). Neither can drift.
 *  - A drill added to a session is COPIED (`snapshot`), never referenced for content. Editing the library
 *    afterwards changes nothing in the session; the coach updates deliberately, or not at all.
 *
 * Ownership, visibility, lifecycle and the extra integrity rules that a schema diff cannot express
 * (row-level security, triggers, the view) live in drizzle/0005_*.sql; the application's can() is a second layer.
 */

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id),
    /** Discriminator (D8): only `training_session` today; a lesson plan will reuse this table. */
    type: text("type").notNull().default("training_session"),
    title: text("title").notNull(),
    /** draft → published ("final") → archived. Deleting is separate: see `deletedAt`. */
    status: text("status").notNull().default("draft"),
    /** private = creator only · organization = every member of the workspace. */
    visibility: text("visibility").notNull().default("private"),

    // ---- what the session is for (filterable, so real columns) -------------------------------------
    teamName: text("team_name"),
    ageGroupId: uuid("age_group_id"),
    /** The actual ages of the players; may be narrower than the age group's typical range. Both or neither. */
    ageMin: smallint("age_min"),
    ageMax: smallint("age_max"),
    level: text("level"),
    /** How many players are expected. */
    players: smallint("players"),
    /** What the coach is aiming for, in minutes. NOT the session's length: that is the sum of its activities. */
    targetMinutes: smallint("target_minutes").notNull(),
    /** One sentence: what this session is about. */
    objective: text("objective").notNull().default(""),

    // ---- scheduling: local wall-clock time in an IANA zone; there is deliberately NO end time column ----
    scheduledDate: date("scheduled_date", { mode: "string" }),
    startTime: time("start_time", { precision: 0 }),
    timezone: text("timezone"),

    /** Location, season, session number, coach, club/school/academy, coach notes: validated, versioned JSON. */
    details: jsonb("details")
      .notNull()
      .default(sql`'{"schemaVersion":1}'::jsonb`),

    /**
     * How the printed session looks and the coach's reflection text: validated, versioned JSON (the documents
     * module's `documentSettingsSchema`). `{}` = never customised. Design only ever lives here as the session's
     * OVERRIDE of a preset; the presets themselves are code.
     */
    documentSettings: jsonb("document_settings")
      .notNull()
      .default(sql`'{}'::jsonb`),

    /**
     * The saved template this session's design was based on, and the revision of it that was applied. The frozen copy of
     * the template's layer lives in `document_settings`; these two columns are the queryable relationship. The
     * template must belong to the session's workspace (a trigger, drizzle/0010_*.sql).
     */
    templateId: uuid("template_id").references(() => documentTemplates.id, {
      onDelete: "set null",
    }),
    templateRevision: integer("template_revision"),

    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Lineage when a session was duplicated (a future action; the column keeps the door open). */
    forkedFromId: uuid("forked_from_id"),
    /** Optimistic concurrency: every change to the session or its timeline bumps it, and writers must present the one they read. */
    version: integer("version").notNull().default(1),
    /** Soft delete: the row stays (restorable, auditable); the app hides it from every normal list. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // a session's age group must belong to the session's own sport
    foreignKey({
      name: "plans_age_group_sport_fk",
      columns: [t.ageGroupId, t.sportId],
      foreignColumns: [ageGroups.id, ageGroups.sportId],
    }),
    foreignKey({
      name: "plans_forked_from_fk",
      columns: [t.forkedFromId],
      foreignColumns: [t.id],
    }).onDelete("set null"),
    // target of composite FKs from child tables (proves plan and child share a sport)
    unique("plans_id_sport_uq").on(t.id, t.sportId),
    index("plans_org_list_idx")
      .on(t.organizationId, t.status, t.updatedAt.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    index("plans_org_date_idx")
      .on(t.organizationId, t.scheduledDate)
      .where(sql`${t.scheduledDate} IS NOT NULL`),
    index("plans_created_by_idx").on(t.createdBy, t.updatedAt.desc()),
    index("plans_forked_from_idx")
      .on(t.forkedFromId)
      .where(sql`${t.forkedFromId} IS NOT NULL`),

    check("plans_type_chk", sql`${t.type} IN ('training_session')`),
    check("plans_status_chk", sql`${t.status} IN ('draft','published','archived')`),
    check("plans_visibility_chk", sql`${t.visibility} IN ('private','organization')`),
    check("plans_title_len_chk", sql`char_length(${t.title}) BETWEEN 1 AND 120`),
    check(
      "plans_team_len_chk",
      sql`${t.teamName} IS NULL OR char_length(${t.teamName}) BETWEEN 1 AND 80`,
    ),
    check(
      "plans_level_chk",
      sql`${t.level} IS NULL OR ${t.level} IN ('beginner','intermediate','advanced')`,
    ),
    check("plans_players_chk", sql`${t.players} IS NULL OR ${t.players} BETWEEN 1 AND 60`),
    check(
      "plans_age_chk",
      sql`(${t.ageMin} IS NULL) = (${t.ageMax} IS NULL) AND (${t.ageMin} IS NULL OR (${t.ageMin} BETWEEN 3 AND 99 AND ${t.ageMax} BETWEEN ${t.ageMin} AND 99))`,
    ),
    check("plans_target_chk", sql`${t.targetMinutes} BETWEEN 5 AND 480`),
    check("plans_objective_len_chk", sql`char_length(${t.objective}) <= 500`),
    // a start time is minutes-precise, means nothing without a date, and both need a zone to be a real moment
    check(
      "plans_start_minutes_chk",
      sql`${t.startTime} IS NULL OR extract(second FROM ${t.startTime}) = 0`,
    ),
    check(
      "plans_start_needs_date_chk",
      sql`${t.startTime} IS NULL OR ${t.scheduledDate} IS NOT NULL`,
    ),
    check(
      "plans_schedule_needs_zone_chk",
      sql`(${t.scheduledDate} IS NULL AND ${t.startTime} IS NULL) OR ${t.timezone} IS NOT NULL`,
    ),
    check(
      "plans_timezone_len_chk",
      sql`${t.timezone} IS NULL OR char_length(${t.timezone}) BETWEEN 1 AND 64`,
    ),
    check(
      "plans_details_chk",
      sql`jsonb_typeof(${t.details}) = 'object' AND octet_length(${t.details}::text) <= 16000`,
    ),
    check(
      "plans_document_settings_chk",
      sql`jsonb_typeof(${t.documentSettings}) = 'object' AND octet_length(${t.documentSettings}::text) <= 16000`,
    ),
    check(
      "plans_template_revision_chk",
      sql`${t.templateRevision} IS NULL OR ${t.templateRevision} >= 1`,
    ),
    index("plans_template_idx")
      .on(t.templateId)
      .where(sql`${t.templateId} IS NOT NULL`),
    check("plans_version_chk", sql`${t.version} >= 1`),
  ],
);

/**
 * A session's objectives, in a coach's own words ("Shooting", "Transition"): references into the sport's
 * objectives catalog, which maps each one onto the detailed skills and categories drills are matched by.
 * One primary, a few secondary. No free text.
 */
export const planObjectives = pgTable(
  "plan_objectives",
  {
    planId: uuid("plan_id").notNull(),
    objectiveId: uuid("objective_id").notNull(),
    /** Denormalised so composite FKs can prove plan and objective share a sport. */
    sportId: uuid("sport_id").notNull(),
    role: text("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.objectiveId] }),
    foreignKey({
      name: "plan_objectives_plan_fk",
      columns: [t.planId, t.sportId],
      foreignColumns: [plans.id, plans.sportId],
    }).onDelete("cascade"),
    foreignKey({
      name: "plan_objectives_objective_fk",
      columns: [t.objectiveId, t.sportId],
      foreignColumns: [objectives.id, objectives.sportId],
    }),
    uniqueIndex("plan_objectives_one_primary_uq")
      .on(t.planId)
      .where(sql`${t.role} = 'primary'`),
    index("plan_objectives_objective_idx").on(t.objectiveId, t.planId),
    check("plan_objectives_role_chk", sql`${t.role} IN ('primary','secondary')`),
  ],
);

/**
 * One block of the timeline. Start and end offsets are NOT stored: they are the running total of the
 * durations in `position` order (00:00–10:00 warm-up, 10:00–20:00 ball handling…), computed on read.
 */
export const planActivities = pgTable(
  "plan_activities",
  {
    id: uuid("id").primaryKey(),
    planId: uuid("plan_id").notNull(),
    /** Denormalised so composite FKs can prove plan, drill and activity share a sport. */
    sportId: uuid("sport_id").notNull(),
    /** Order in the timeline, 0-based. Unique per plan, checked at the end of the statement so one UPDATE can reorder them all. */
    position: smallint("position").notNull(),
    /** Where in the session this sits (warm_up, skill, small_sided, game, conditioning, cool_down); null for a break. */
    phase: text("phase"),
    kind: text("kind").notNull(),
    /** What the timeline shows. Starts as the drill's title; the coach may rename it. */
    title: text("title").notNull(),
    durationMin: smallint("duration_min").notNull(),
    repetitions: smallint("repetitions"),
    players: smallint("players"),
    notes: text("notes").notNull().default(""),

    /** Lineage only: WHERE this drill came from. The content is in `snapshot`; this link can go stale or be cut (SET NULL). */
    sourceDrillId: uuid("source_drill_id"),
    /** The library drill's `version` at the moment it was copied. Newer in the library = "an update is available". */
    sourceDrillVersion: integer("source_drill_version"),
    /** Everything the document needs, frozen at the moment of copying (validated, versioned JSON). Null for a break. */
    snapshot: jsonb("snapshot"),
    /** True once the coach changed the copied content: an update from the library must then be a deliberate choice. */
    customized: boolean("customized").notNull().default(false),
    /** The coach has locked this activity: neither the generator nor the assistant may change, replace, move or remove it. */
    locked: boolean("locked").notNull().default(false),
    /** Why the coach replaced or changed this activity, in their own words (optional). */
    changeReason: text("change_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "plan_activities_plan_fk",
      columns: [t.planId, t.sportId],
      foreignColumns: [plans.id, plans.sportId],
    }).onDelete("cascade"),
    // the source drill must be of the same sport; if the drill ever disappears only the link is cut, never the activity (see 0005)
    foreignKey({
      name: "plan_activities_source_fk",
      columns: [t.sourceDrillId, t.sportId],
      foreignColumns: [drills.id, drills.sportId],
    }).onDelete("set null"),
    // DEFERRABLE (INITIALLY IMMEDIATE) in 0005: checked at the end of each statement, so one UPDATE can reorder every row
    unique("plan_activities_position_uq").on(t.planId, t.position),
    index("plan_activities_source_idx")
      .on(t.sourceDrillId)
      .where(sql`${t.sourceDrillId} IS NOT NULL`),

    check("plan_activities_kind_chk", sql`${t.kind} IN ('drill','custom','break')`),
    check("plan_activities_position_chk", sql`${t.position} BETWEEN 0 AND 59`),
    check(
      "plan_activities_phase_chk",
      sql`${t.phase} IS NULL OR ${t.phase} IN ('warm_up','skill','small_sided','game','conditioning','cool_down')`,
    ),
    check("plan_activities_title_len_chk", sql`char_length(${t.title}) BETWEEN 1 AND 120`),
    // never zero, never negative
    check("plan_activities_duration_chk", sql`${t.durationMin} BETWEEN 1 AND 240`),
    check(
      "plan_activities_repetitions_chk",
      sql`${t.repetitions} IS NULL OR ${t.repetitions} BETWEEN 1 AND 99`,
    ),
    check(
      "plan_activities_players_chk",
      sql`${t.players} IS NULL OR ${t.players} BETWEEN 1 AND 60`,
    ),
    check("plan_activities_notes_len_chk", sql`char_length(${t.notes}) <= 2000`),
    check(
      "plan_activities_reason_len_chk",
      sql`${t.changeReason} IS NULL OR char_length(${t.changeReason}) BETWEEN 1 AND 300`,
    ),
    // what each kind must (and must not) carry
    check(
      "plan_activities_kind_shape_chk",
      sql`(${t.kind} = 'drill' AND ${t.snapshot} IS NOT NULL AND ${t.sourceDrillVersion} IS NOT NULL
             AND (${t.snapshot} -> 'provenance' ->> 'drillVersion') IS NOT DISTINCT FROM ${t.sourceDrillVersion}::text)
        OR (${t.kind} = 'custom' AND ${t.sourceDrillId} IS NULL AND ${t.sourceDrillVersion} IS NULL)
        OR (${t.kind} = 'break' AND ${t.snapshot} IS NULL AND ${t.sourceDrillId} IS NULL AND ${t.sourceDrillVersion} IS NULL)`,
    ),
    check(
      "plan_activities_snapshot_chk",
      sql`${t.snapshot} IS NULL OR (jsonb_typeof(${t.snapshot}) = 'object' AND ${t.snapshot} ? 'schemaVersion' AND octet_length(${t.snapshot}::text) <= 200000)`,
    ),
  ],
);

/**
 * The session's calculated numbers — a read-only view (drizzle/0005_*.sql), never a column:
 * total length = SUM of the activity durations, end = start + total. Read with the caller's row-level security.
 */
export const planTotals = pgView("plan_totals", {
  planId: uuid("plan_id").notNull(),
  totalMinutes: integer("total_minutes").notNull(),
  activityCount: integer("activity_count").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
}).existing();
