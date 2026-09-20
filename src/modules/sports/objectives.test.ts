import { describe, expect, it } from "vitest";
import { coveredSkillKeys, drillMatchesObjective, type SkillNode } from "./objectives";

const skills: SkillNode[] = [
  { key: "shooting_form" },
  { key: "catch_and_shoot", parentKey: "shooting_form" },
  { key: "shooting_off_the_dribble", parentKey: "shooting_form" },
  { key: "free_throws" },
  { key: "dribbling" },
  { key: "crossover", parentKey: "dribbling" },
  { key: "numbers_advantage", parentKey: "decision_making" },
  { key: "decision_making" },
];
const shooting = {
  key: "shooting",
  name: "Shooting",
  skillKeys: ["shooting_form", "free_throws"],
  categoryKeys: ["shooting"],
};
const transition = {
  key: "transition",
  name: "Transition",
  skillKeys: ["numbers_advantage"],
  categoryKeys: ["transition"],
};
const drill = (over: Partial<Parameters<typeof drillMatchesObjective>[2]> = {}) => ({
  category: "warm_up",
  primarySkill: "dribbling",
  secondarySkills: [] as string[],
  subSkills: [] as string[],
  ...over,
});

describe("objectives cover the detailed skills underneath", () => {
  it("a top-level skill stands for its sub-skills: Shooting covers Catch-and-Shoot and Pull-Up", () => {
    const covered = coveredSkillKeys(shooting, skills);
    for (const k of ["shooting_form", "catch_and_shoot", "shooting_off_the_dribble", "free_throws"])
      expect(covered.has(k), k).toBe(true);
    expect(covered.has("dribbling")).toBe(false);
    expect(covered.has("crossover")).toBe(false);
  });

  it("naming a sub-skill directly covers just that sub-skill", () => {
    const covered = coveredSkillKeys(transition, skills);
    expect([...covered]).toEqual(["numbers_advantage"]);
  });
});

describe("which drills serve an objective", () => {
  it("by category", () => {
    expect(drillMatchesObjective(shooting, skills, drill({ category: "shooting" }))).toBe(true);
    expect(drillMatchesObjective(transition, skills, drill({ category: "transition" }))).toBe(true);
    expect(drillMatchesObjective(shooting, skills, drill({ category: "transition" }))).toBe(false);
  });

  it("by primary skill, secondary skill or focus area — a focus area under a covered skill counts", () => {
    expect(drillMatchesObjective(shooting, skills, drill({ primarySkill: "free_throws" }))).toBe(
      true,
    );
    expect(
      drillMatchesObjective(shooting, skills, drill({ secondarySkills: ["shooting_form"] })),
    ).toBe(true);
    expect(drillMatchesObjective(shooting, skills, drill({ subSkills: ["catch_and_shoot"] }))).toBe(
      true,
    );
  });

  it("not by an unrelated skill", () => {
    expect(
      drillMatchesObjective(
        shooting,
        skills,
        drill({ primarySkill: "dribbling", subSkills: ["crossover"] }),
      ),
    ).toBe(false);
  });
});
