import { describe, expect, it } from "vitest";
import taxonomy from "../../../content/basketball/taxonomy.json";
import {
  COACH_AGE_GROUPS,
  COACH_PRIORITIES,
  COACHING_EXPERIENCES,
  COACHING_STYLES,
  TEAM_SIZE_BANDS,
} from "@/db/enums";
import {
  EMPTY_COACHING_PROFILE,
  PRIORITY_QUERY,
  coachingContext,
  hasCoachingProfile,
  recommendationAge,
  recommendationQueries,
  type CoachingProfileDto,
} from "./coaching-profile";
import { coachOnboardingSchema, coachingProfileSchema } from "./validators";

const category = new Set(taxonomy.categories.map((c) => c.key));
const skill = new Set(taxonomy.skills.map((s) => s.key));

describe("coaching profile ↔ the real basketball catalog", () => {
  it("every priority is found in the drill library by a category or skill that really exists", () => {
    for (const p of COACH_PRIORITIES) {
      const q = PRIORITY_QUERY[p];
      expect(q.category || q.skill, p).toBeTruthy();
      if (q.category) expect(category.has(q.category), `${p} → category ${q.category}`).toBe(true);
      if (q.skill) expect(skill.has(q.skill), `${p} → skill ${q.skill}`).toBe(true);
    }
  });

  it("the age groups are exactly the catalog's age groups", () => {
    expect([...COACH_AGE_GROUPS]).toEqual(taxonomy.ageGroups.map((a) => a.key));
  });

  it("offers the choices the onboarding needs", () => {
    expect(COACHING_EXPERIENCES).toHaveLength(5);
    expect(COACHING_STYLES).toContain("balanced");
    expect(TEAM_SIZE_BANDS.map((b) => b.players)).toEqual([6, 9, 12, 14, 16]);
  });
});

describe("recommendations", () => {
  it("narrows by age only when the coach has exactly one age group", () => {
    expect(recommendationAge(["u14"])).toBe(13);
    expect(recommendationAge(["u12", "u14"])).toBeUndefined();
    expect(recommendationAge([])).toBeUndefined();
  });

  it("follows the order the coach chose, never repeats a query, and stops at the limit", () => {
    const qs = recommendationQueries([
      "shooting",
      "basketball_iq",
      "decision_making",
      "passing",
      "defense",
      "footwork",
    ]);
    expect(qs.map((q) => q.priority)).toEqual(["shooting", "basketball_iq", "passing", "defense"]);
    expect(recommendationQueries([])).toEqual([]);
  });
});

describe("what the AI Coach is told", () => {
  it("is null for a coach who told us nothing (a skipped onboarding)", () => {
    expect(hasCoachingProfile(EMPTY_COACHING_PROFILE)).toBe(false);
    expect(coachingContext(EMPTY_COACHING_PROFILE)).toBeNull();
    expect(coachingContext(null)).toBeNull();
  });

  it("includes only what was answered", () => {
    const partial: CoachingProfileDto = {
      ...EMPTY_COACHING_PROFILE,
      experience: "developing",
      priorities: ["shooting"],
    };
    expect(coachingContext(partial)).toEqual({
      coachingExperience: "developing",
      developmentPriorities: ["shooting"],
    });
  });
});

const good = {
  coachingExperience: "developing",
  ageGroups: ["u14"],
  typicalPlayers: 12,
  priorities: ["shooting", "ball_handling"],
  needs: ["practice_planning"],
  coachingStyles: ["skill_development"],
};

describe("coachingProfileSchema", () => {
  it("accepts a complete profile", () => {
    expect(coachingProfileSchema.safeParse(good).success).toBe(true);
  });

  it("stores each list in the option order, once", () => {
    const r = coachingProfileSchema.parse({
      ...good,
      ageGroups: ["u16", "u12", "u12"],
      priorities: ["defense", "shooting", "shooting"],
    });
    expect(r.ageGroups).toEqual(["u12", "u16"]);
    expect(r.priorities).toEqual(["shooting", "defense"]);
  });

  it('"All of the above" replaces the specific needs', () => {
    expect(
      coachingProfileSchema.parse({ ...good, needs: ["drill_discovery", "all"] }).needs,
    ).toEqual(["all"]);
  });

  it("rejects empty picks, unknown keys and an impossible squad size", () => {
    for (const bad of [
      { ...good, ageGroups: [] },
      { ...good, priorities: [] },
      { ...good, coachingStyles: ["chaos"] },
      { ...good, coachingExperience: "god_tier" },
      { ...good, typicalPlayers: 0 },
      { ...good, typicalPlayers: 61 },
      { ...good, typicalPlayers: 11.5 },
    ]) {
      expect(coachingProfileSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("coachOnboardingSchema", () => {
  it("falls back to UTC for a timezone it does not know (never blocks onboarding)", () => {
    expect(coachOnboardingSchema.parse({ coaching: good, timezone: "Mars/Olympus" }).timezone).toBe(
      "UTC",
    );
    expect(coachOnboardingSchema.parse({ coaching: good, timezone: "Asia/Dubai" }).timezone).toBe(
      "Asia/Dubai",
    );
  });
});
