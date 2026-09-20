/**
 * Objectives: the coach-facing umbrella over the detailed skill catalog. Pure — no database, no framework — so
 * the session builder, the seed tests and (later) the generator all use the SAME rule to decide which drills
 * serve an objective.
 *
 * An objective covers a set of skills and a set of categories. A top-level skill stands for its sub-skills too
 * (covering "Shooting form" covers "Catch and shoot" and "Off the dribble"), exactly as the drill library's
 * skill filter already behaves.
 */

export type ObjectiveDef = {
  key: string;
  name: string;
  /** Skills named directly (top-level or sub-skills). */
  skillKeys: readonly string[];
  categoryKeys: readonly string[];
};

export type SkillNode = { key: string; parentKey?: string | null };

/** Every skill key an objective covers: the ones it names, plus the sub-skills of any top-level skill it names. */
export function coveredSkillKeys(
  objective: Pick<ObjectiveDef, "skillKeys">,
  skills: readonly SkillNode[],
): Set<string> {
  const covered = new Set(objective.skillKeys);
  for (const s of skills) if (s.parentKey && covered.has(s.parentKey)) covered.add(s.key);
  return covered;
}

export type DrillFacts = {
  category: string;
  primarySkill: string;
  secondarySkills: readonly string[];
  subSkills: readonly string[];
};

/** Does this drill serve the objective? By its category, or by any skill it trains (primary, secondary or focus area). */
export function drillMatchesObjective(
  objective: ObjectiveDef,
  skills: readonly SkillNode[],
  drill: DrillFacts,
): boolean {
  if (objective.categoryKeys.includes(drill.category)) return true;
  const covered = coveredSkillKeys(objective, skills);
  return [drill.primarySkill, ...drill.secondarySkills, ...drill.subSkills].some((k) =>
    covered.has(k),
  );
}
