import { boolean, check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  COACH_AGE_GROUPS,
  COACH_LIMITS,
  COACH_NEEDS,
  COACH_PRIORITIES,
  COACHING_EXPERIENCES,
  COACHING_STYLES,
  DEFAULT_SOUND_VOLUME,
  PROFESSIONS,
  SOUND_VOLUMES,
  UNITS,
} from "../enums";
import { user } from "./auth";

export { PROFESSIONS, UNITS } from "../enums";
export type { Profession, Units } from "../enums";

/** A SQL list of quoted literals from a constant tuple: 'a','b'. The values are our own constants, never input. */
const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(",");

/**
 * 1:1 with `user`. Profession drives UX personalisation only — it is NOT a permission (§6.1).
 * User-scoped row-level security: a row is visible only when `user_id = app.user_id`.
 */
export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    profession: text("profession", { enum: PROFESSIONS }),
    /** IANA timezone, e.g. "Europe/Paris". Null until onboarding. */
    timezone: text("timezone"),
    locale: text("locale").notNull().default("en"),
    units: text("units", { enum: UNITS }).notNull().default("metric"),
    /** Interaction sounds (Settings → Preferences → Sounds): on/off and a volume in percent. On by default, at a subtle level. */
    soundsEnabled: boolean("sounds_enabled").notNull().default(true),
    soundVolume: integer("sound_volume").notNull().default(DEFAULT_SOUND_VOLUME),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    /** Set the first time the user saves Preferences — drives a real dashboard checklist item. */
    preferencesReviewedAt: timestamp("preferences_reviewed_at", { withTimezone: true }),
    /**
     * The basketball coaching profile (onboarding + Settings → Coaching profile). It personalises the dashboard, the AI
     * Coach and the generator. Every column is optional/empty until the coach answers, and `coachingProfileCompletedAt`
     * is set only when they answered all six onboarding questions (skipping leaves it null, which drives a dashboard prompt).
     */
    coachingExperience: text("coaching_experience", { enum: COACHING_EXPERIENCES }),
    ageGroups: text("age_groups")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    typicalPlayers: integer("typical_players"),
    priorities: text("priorities")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    needs: text("needs")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    coachingStyles: text("coaching_styles")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    coachingProfileCompletedAt: timestamp("coaching_profile_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    check(
      "profiles_profession_chk",
      sql`${t.profession} IS NULL OR ${t.profession} IN ('coach','pe_teacher','both')`,
    ),
    check("profiles_units_chk", sql`${t.units} IN ('metric','imperial')`),
    check(
      "profiles_sound_volume_chk",
      sql`${t.soundVolume} IN (${sql.raw(SOUND_VOLUMES.join(","))})`,
    ),
    check(
      "profiles_coaching_experience_chk",
      sql`${t.coachingExperience} IS NULL OR ${t.coachingExperience} IN (${sql.raw(list(COACHING_EXPERIENCES))})`,
    ),
    check(
      "profiles_age_groups_chk",
      sql`${t.ageGroups} <@ ARRAY[${sql.raw(list(COACH_AGE_GROUPS))}]::text[]`,
    ),
    check(
      "profiles_typical_players_chk",
      sql`${t.typicalPlayers} IS NULL OR ${t.typicalPlayers} BETWEEN ${sql.raw(String(COACH_LIMITS.minPlayers))} AND ${sql.raw(String(COACH_LIMITS.maxPlayers))}`,
    ),
    check(
      "profiles_priorities_chk",
      sql`${t.priorities} <@ ARRAY[${sql.raw(list(COACH_PRIORITIES))}]::text[]`,
    ),
    check("profiles_needs_chk", sql`${t.needs} <@ ARRAY[${sql.raw(list(COACH_NEEDS))}]::text[]`),
    check(
      "profiles_coaching_styles_chk",
      sql`${t.coachingStyles} <@ ARRAY[${sql.raw(list(COACHING_STYLES))}]::text[]`,
    ),
  ],
);
