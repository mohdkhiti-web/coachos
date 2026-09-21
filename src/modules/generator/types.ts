import type { DrillPhase, Intensity, Level } from "@/db/enums";

/**
 * The generator's vocabulary (Step 8). Pure data: no database, no framework. A `DrillCandidate` is the small
 * projection of a drill the rules need (metadata only, never the long content), so ranking hundreds of drills
 * costs nothing and nothing private has to go anywhere.
 */

export interface DrillCandidate {
  id: string;
  title: string;
  level: Level;
  ageMin: number;
  ageMax: number;
  playersMin: number;
  playersMax: number;
  durationMin: number;
  durationMax: number;
  /** half_court | full_court | partial_court | any_space */
  space: string;
  intensity: Intensity;
  /** individual, 1v1, 3v3, group, team … */
  format: string | null;
  phases: readonly DrillPhase[];
  category: string;
  primarySkill: string | null;
  secondarySkills: readonly string[];
  subSkills: readonly string[];
  equipment: ReadonlyArray<{
    key: string;
    rule: "fixed" | "per_player" | "per_pair";
    quantity: number;
  }>;
  scope: "library" | "workspace" | "mine";
}

/** An objective as the rules see it: the skills it covers (sub-skills included) and its categories. */
export interface ObjectiveRule {
  key: string;
  name: string;
  coveredSkillKeys: readonly string[];
  categoryKeys: readonly string[];
}

export const SESSION_TYPES = ["practice", "skills", "game_prep", "conditioning"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/** Why a drill was chosen or a warning was raised: a code plus values, translated by the UI, never free text from a model. */
export interface Reason {
  code:
    | "primary_objective"
    | "secondary_objective"
    | "phase_fit"
    | "level_fit"
    | "age_fit"
    | "players_fit"
    | "groups"
    | "equipment_ok"
    | "intensity_fit"
    | "variety"
    | "locked";
  values?: Record<string, string | number>;
}

export type SlotPhase = DrillPhase;

export interface GeneratedItem {
  kind: "drill" | "break";
  /** The library/workspace drill (null for a break). Always a REAL drill from the candidates — never invented. */
  drillId: string | null;
  title: string;
  phase: SlotPhase | null;
  durationMin: number;
  /** How many groups the players split into to fit this drill (1 = everyone together). */
  groups: number;
  reasons: Reason[];
  /** The next best drills for the same slot, best first: what "replace this drill" offers. */
  alternatives: Array<{ drillId: string; title: string; score: number }>;
  /** Locked by the coach: never changed by a regeneration. */
  locked: boolean;
}

export type IssueSeverity = "error" | "warning";
export interface Issue {
  code:
    | "empty"
    | "duration_mismatch"
    | "too_many_activities"
    | "players_below_min"
    | "equipment_short"
    | "space_not_available"
    | "objective_uncovered"
    | "age_mismatch"
    | "level_mismatch"
    | "no_warm_up"
    | "no_cool_down"
    | "high_intensity_run"
    | "duplicate_drill"
    | "duration_outside_range"
    | "no_drill_for_phase";
  severity: IssueSeverity;
  values?: Record<string, string | number>;
  /** Which activity (0-based position among items), when the issue is about one. */
  at?: number;
}

export interface ValidationReport {
  /** No errors (warnings do not fail a session). */
  ok: boolean;
  issues: Issue[];
}
