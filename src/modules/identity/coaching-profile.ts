import type {
  CoachAgeGroup,
  CoachNeed,
  CoachPriority,
  CoachingExperience,
  CoachingStyle,
} from "@/db/enums";

/**
 * The basketball coaching profile as the rest of the app sees it, and the pure rules that turn it into real behaviour
 * (which drills to recommend, what the AI Coach is told). Pure and client-safe: no database, no environment.
 */

export interface CoachingProfileDto {
  experience: CoachingExperience | null;
  ageGroups: CoachAgeGroup[];
  typicalPlayers: number | null;
  priorities: CoachPriority[];
  needs: CoachNeed[];
  styles: CoachingStyle[];
  /** True only when the coach answered all six onboarding questions (skipping leaves it false). */
  completed: boolean;
}

export const EMPTY_COACHING_PROFILE: CoachingProfileDto = {
  experience: null,
  ageGroups: [],
  typicalPlayers: null,
  priorities: [],
  needs: [],
  styles: [],
  completed: false,
};

/** Has the coach told us anything at all? (A skipped onboarding is an empty profile.) */
export const hasCoachingProfile = (
  p: CoachingProfileDto | null | undefined,
): p is CoachingProfileDto =>
  !!p &&
  (p.experience !== null ||
    p.ageGroups.length > 0 ||
    p.typicalPlayers !== null ||
    p.priorities.length > 0 ||
    p.needs.length > 0 ||
    p.styles.length > 0);

/**
 * How a coaching priority is found in the drill library: by catalog category, or by skill where a category would be too
 * broad. Keys are the real keys of content/basketball/taxonomy.json (checked by a unit test), so a recommendation is a
 * real query against real drills — never a hand-picked list.
 */
export const PRIORITY_QUERY: Record<CoachPriority, { category?: string; skill?: string }> = {
  shooting: { category: "shooting" },
  ball_handling: { category: "ball_handling" },
  passing: { category: "passing" },
  finishing: { category: "finishing" },
  footwork: { category: "footwork" },
  defense: { category: "individual_defense" },
  rebounding: { category: "rebounding" },
  basketball_iq: { skill: "decision_making" },
  decision_making: { skill: "decision_making" },
  team_offense: { category: "team_offense" },
  team_defense: { category: "team_defense" },
  transition: { category: "transition" },
  conditioning: { category: "conditioning" },
  game_preparation: { category: "special_situations" },
};

/** A typical age for each age group (the drill library filters by a single age). */
const AGE_OF_GROUP: Record<CoachAgeGroup, number> = {
  u8: 7,
  u10: 9,
  u12: 11,
  u14: 13,
  u16: 15,
  u18: 17,
  senior: 20,
};

/**
 * The age to filter drills by: the coach's age group when they coach exactly one. With several groups (or none) there
 * is no honest single age, so recommendations are not narrowed by age at all.
 */
export const recommendationAge = (ageGroups: readonly CoachAgeGroup[]): number | undefined =>
  ageGroups.length === 1 ? AGE_OF_GROUP[ageGroups[0]!] : undefined;

/** The priorities to recommend for, in the order the coach chose them, without repeating a query. */
export function recommendationQueries(
  priorities: readonly CoachPriority[],
  limit = 4,
): Array<{ priority: CoachPriority; category?: string; skill?: string }> {
  const seen = new Set<string>();
  const out: Array<{ priority: CoachPriority; category?: string; skill?: string }> = [];
  for (const priority of priorities) {
    const q = PRIORITY_QUERY[priority];
    const id = `${q.category ?? ""}|${q.skill ?? ""}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ priority, ...q });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The profile as plain data for the AI Coach's system prompt. Only what the coach actually answered is included — a
 * blank answer is omitted, never guessed — and every value is one of our own enum keys, never free text.
 */
export function coachingContext(
  p: CoachingProfileDto | null | undefined,
): Record<string, unknown> | null {
  if (!hasCoachingProfile(p)) return null;
  return {
    ...(p.experience ? { coachingExperience: p.experience } : {}),
    ...(p.ageGroups.length ? { ageGroups: p.ageGroups } : {}),
    ...(p.typicalPlayers ? { typicalPlayers: p.typicalPlayers } : {}),
    ...(p.priorities.length ? { developmentPriorities: p.priorities } : {}),
    ...(p.needs.length ? { wantsMostFromCoachOS: p.needs } : {}),
    ...(p.styles.length ? { coachingStyle: p.styles } : {}),
  };
}
