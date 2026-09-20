/** Pure constants (no imports) so client bundles can share them with the schema without pulling in Drizzle. */

export const PROFESSIONS = ["coach", "pe_teacher", "both"] as const;
export type Profession = (typeof PROFESSIONS)[number];

export const UNITS = ["metric", "imperial"] as const;
export type Units = (typeof UNITS)[number];

// --- Sports & drills (Phase 2) ------------------------------------------------------------------
export const SPORT_STATUSES = ["active", "beta", "planned"] as const;
export type SportStatus = (typeof SPORT_STATUSES)[number];

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

/** private = creator only · organization = all members · public = readable by everyone (platform library only). */
export const VISIBILITIES = ["private", "organization", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const DRILL_STATUSES = ["draft", "published", "archived"] as const;
export type DrillStatus = (typeof DRILL_STATUSES)[number];

/** original = written by the author · adapted = adapted from a public technique (credit in sourceName) · external = link only. */
export const SOURCE_KINDS = ["original", "adapted", "external"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const EQUIPMENT_RULES = ["fixed", "per_player", "per_pair"] as const;
export type EquipmentRule = (typeof EQUIPMENT_RULES)[number];

/** primary = the one main skill · secondary = other skills trained · sub = a focus within one of those skills (e.g. Crossover, under Dribbling). */
export const SKILL_ROLES = ["primary", "secondary", "sub"] as const;
export type SkillRole = (typeof SKILL_ROLES)[number];

// --- Drill library facets (Step 1 of the session-creator work) -----------------------------------
export const INTENSITIES = ["low", "medium", "high"] as const;
export type Intensity = (typeof INTENSITIES)[number];

/**
 * Where in a session a drill fits best. Generic across sports, so the session builder and the
 * rule-based generator can pick drills by slot. A drill may suit several.
 */
export const DRILL_PHASES = [
  "warm_up",
  "skill",
  "small_sided",
  "game",
  "conditioning",
  "cool_down",
] as const;
export type DrillPhase = (typeof DRILL_PHASES)[number];

/** A drill "format" key (1v1, 3v3, individual, team…). The allowed values belong to each sport module. */
export const FORMAT_KEY_PATTERN = /^[a-z0-9][a-z0-9_]{0,15}$/;
