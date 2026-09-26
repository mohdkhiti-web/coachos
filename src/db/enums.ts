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

// --- Plans: training sessions (Step 2 of the session-creator work) --------------------------------
/** Sessions and (later) lesson plans share one model, told apart by `type` (ARCHITECTURE.md D8). */
export const PLAN_TYPES = ["training_session"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/** draft = still being built · published = the coach's final version · archived = kept, frozen and out of the way. */
export const PLAN_STATUSES = ["draft", "published", "archived"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** private = the creator only · organization = every member of the workspace. Public sharing arrives later, as share links. */
export const PLAN_VISIBILITIES = ["private", "organization"] as const;
export type PlanVisibility = (typeof PLAN_VISIBILITIES)[number];

/** A drill copied into the session, the coach's own activity, or a break (water, transition…). */
export const ACTIVITY_KINDS = ["drill", "custom", "break"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Session objectives reuse the sport's skills; a session has one primary objective and a few secondary ones. */
export const OBJECTIVE_ROLES = ["primary", "secondary"] as const;
export type ObjectiveRole = (typeof OBJECTIVE_ROLES)[number];

/**
 * Hard limits shared by the database (CHECKs / triggers in drizzle/0005_*.sql) and the application, so a
 * direct SQL statement and a command are held to the same numbers. Change them in both places.
 */
export const PLAN_LIMITS = {
  /** Activities per session (positions 0…59). */
  maxActivities: 60,
  /** One activity, in minutes. */
  maxActivityMinutes: 240,
  /** All activities of a session together, in minutes (12 hours: a full-day camp fits). */
  maxSessionMinutes: 720,
  /** The session's target length, in minutes. */
  minTargetMinutes: 5,
  maxTargetMinutes: 480,
  /** One primary objective plus this many secondary ones. */
  maxSecondaryObjectives: 4,
} as const;

/** What a saved template is for (a filter and a label, nothing more). */
export const TEMPLATE_CATEGORIES = [
  "general",
  "practice",
  "game_day",
  "school",
  "academy",
  "youth",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** active ⇄ archived; deleting is separate (`deleted_at`), exactly as for sessions. */
export const TEMPLATE_STATUSES = ["active", "archived"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/** private = its creator only · organization = every member of the workspace can use it. */
export const TEMPLATE_VISIBILITIES = ["private", "organization"] as const;
export type TemplateVisibility = (typeof TEMPLATE_VISIBILITIES)[number];

/** What a stored media asset is for. Only logos exist today. */
export const MEDIA_KINDS = ["logo"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** The image types a logo may be. Anything else is refused at upload. */
export const LOGO_MIMES = ["image/png", "image/jpeg", "image/svg+xml"] as const;
export type LogoMime = (typeof LOGO_MIMES)[number];

// --- Basketball coaching profile (collected in onboarding, editable in settings) -----------------
// Pure constants shared by the schema, the validators and the UI. The age-group and priority keys line up with the
// basketball catalog (content/basketball/taxonomy.json) so a profile can drive real drill recommendations.

export const COACHING_EXPERIENCES = [
  "new",
  "developing",
  "experienced",
  "advanced",
  "elite",
] as const;
export type CoachingExperience = (typeof COACHING_EXPERIENCES)[number];

/** Same keys as the catalog's age groups ("senior" is shown as "Adults"). */
export const COACH_AGE_GROUPS = ["u8", "u10", "u12", "u14", "u16", "u18", "senior"] as const;
export type CoachAgeGroup = (typeof COACH_AGE_GROUPS)[number];

export const COACH_PRIORITIES = [
  "shooting",
  "ball_handling",
  "passing",
  "finishing",
  "footwork",
  "defense",
  "rebounding",
  "basketball_iq",
  "decision_making",
  "team_offense",
  "team_defense",
  "transition",
  "conditioning",
  "game_preparation",
] as const;
export type CoachPriority = (typeof COACH_PRIORITIES)[number];

export const COACH_NEEDS = [
  "practice_planning",
  "session_generation",
  "drill_discovery",
  "player_development",
  "team_management",
  "attendance",
  "game_preparation",
  "ai_coaching",
  "all",
] as const;
export type CoachNeed = (typeof COACH_NEEDS)[number];

export const COACHING_STYLES = [
  "skill_development",
  "player_development",
  "team_tactical",
  "high_intensity",
  "fundamentals_first",
  "game_preparation",
  "balanced",
] as const;
export type CoachingStyle = (typeof COACHING_STYLES)[number];

/** The squad-size choices offered in onboarding; `players` is the number stored when a band is picked (a custom count is also allowed). */
export const TEAM_SIZE_BANDS = [
  { key: "5_7", players: 6 },
  { key: "8_10", players: 9 },
  { key: "11_12", players: 12 },
  { key: "13_15", players: 14 },
  { key: "16_plus", players: 16 },
] as const;

export const COACH_LIMITS = { minPlayers: 1, maxPlayers: 60 } as const;
