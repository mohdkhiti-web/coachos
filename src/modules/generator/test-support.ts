import fs from "node:fs";
import path from "node:path";
import { requirementsSchema, type Requirements, type RequirementsInput } from "./requirements";
import type { DrillCandidate, ObjectiveRule } from "./types";

/**
 * Test fixtures for the generator, built from the REAL basketball content (drills + taxonomy), so the rules are exercised
 * against the metadata a coach's library really has — never hand-made stand-ins. Used only by tests.
 */

const ROOT = path.resolve(__dirname, "../../../content/basketball");

interface RawDrill {
  seedKey: string;
  title: string;
  category: string;
  primarySkill: string;
  secondarySkills?: string[];
  subSkills?: string[];
  level: DrillCandidate["level"];
  ageMin: number;
  ageMax: number;
  playersMin: number;
  playersMax: number;
  durationMin: number;
  durationMax: number;
  space: string;
  format: string | null;
  intensity: DrillCandidate["intensity"];
  phases: DrillCandidate["phases"];
  equipment: Array<{ type: string; rule: "fixed" | "per_player" | "per_pair"; quantity: number }>;
}

/** A stable fake UUID per seed key, so tests can name drills by their key. */
export const drillIdOf = (seedKey: string): string => {
  let h = 0;
  for (const c of seedKey) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `00000000-0000-4000-8000-${hex.padStart(12, "0")}`;
};

export function libraryCandidates(): DrillCandidate[] {
  const dir = path.join(ROOT, "drills");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as RawDrill)
    .map((r) => ({
      id: drillIdOf(r.seedKey),
      title: r.title,
      level: r.level,
      ageMin: r.ageMin,
      ageMax: r.ageMax,
      playersMin: r.playersMin,
      playersMax: r.playersMax,
      durationMin: r.durationMin,
      durationMax: r.durationMax,
      space: r.space,
      intensity: r.intensity,
      format: r.format,
      phases: r.phases,
      category: r.category,
      primarySkill: r.primarySkill,
      secondarySkills: r.secondarySkills ?? [],
      subSkills: r.subSkills ?? [],
      equipment: r.equipment.map((e) => ({ key: e.type, rule: e.rule, quantity: e.quantity })),
      scope: "library" as const,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

interface Taxonomy {
  skills: Array<{ key: string; children?: Array<{ key: string }> }>;
  objectives: Array<{ key: string; name: string; skills: string[]; categories: string[] }>;
  ageGroups: Array<{ key: string; ageMin: number; ageMax: number }>;
}

export function taxonomy(): Taxonomy {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "taxonomy.json"), "utf8")) as Taxonomy;
}

export function objectiveRules(): ObjectiveRule[] {
  const t = taxonomy();
  return t.objectives.map((o) => {
    const covered = new Set(o.skills);
    for (const s of t.skills)
      if (covered.has(s.key)) for (const c of s.children ?? []) covered.add(c.key);
    return { key: o.key, name: o.name, coveredSkillKeys: [...covered], categoryKeys: o.categories };
  });
}

/** A valid request with sensible defaults; override what the test is about. */
export function request(over: Partial<RequirementsInput> = {}): Requirements {
  const t = taxonomy();
  const group = t.ageGroups.find((g) => g.key === (over.ageGroup ?? "u14"));
  return requirementsSchema.parse({
    players: 12,
    durationMin: 75,
    ageGroup: "u14",
    ageMin: group?.ageMin ?? null,
    ageMax: group?.ageMax ?? null,
    level: "beginner",
    primaryObjective: "ball_handling",
    ...over,
  });
}
