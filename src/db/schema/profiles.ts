import { check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { PROFESSIONS, UNITS } from "../enums";
import { user } from "./auth";

export { PROFESSIONS, UNITS } from "../enums";
export type { Profession, Units } from "../enums";

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
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    /** Set the first time the user saves Preferences — drives a real dashboard checklist item. */
    preferencesReviewedAt: timestamp("preferences_reviewed_at", { withTimezone: true }),
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
  ],
);
