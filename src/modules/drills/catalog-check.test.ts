import { describe, expect, it } from "vitest";
import { checkAgainstCatalog, type CatalogView } from "./catalog-check";

const mod = { spaces: ["half_court", "any_space"], formats: ["individual", "1v1", "3v3", "team"] };
const catalog: CatalogView = {
  categories: [{ key: "passing" }, { key: "shooting" }],
  skills: [
    { key: "dribbling" },
    { key: "crossover", parentKey: "dribbling" },
    { key: "weak_hand", parentKey: "dribbling" },
    { key: "passing" },
    { key: "skip_passes", parentKey: "passing" },
    { key: "footwork" },
  ],
  equipment: [{ key: "cones" }, { key: "basketball" }],
};
const good = {
  category: "passing",
  primarySkill: "dribbling",
  secondarySkills: ["footwork"],
  subSkills: ["crossover"],
  equipment: [{ type: "cones", rule: "fixed" as const, quantity: 2 }],
  space: "half_court",
  format: "3v3",
};
const check = (over: Partial<typeof good> = {}) =>
  checkAgainstCatalog(mod, catalog, { ...good, ...over });

describe("checkAgainstCatalog (shared by the create/edit command and the seed loader)", () => {
  it("accepts a coherent drill", () => {
    expect(check()).toEqual({});
  });

  it("needs a real category, equipment type and space", () => {
    expect(check({ category: "nope" })).toEqual({ category: ["invalid"] });
    expect(check({ equipment: [{ type: "snitch", rule: "fixed", quantity: 1 }] })).toEqual({
      equipment: ["invalid"],
    });
    expect(check({ space: "moon" })).toEqual({ space: ["invalid"] });
  });

  it("format is optional, but when given it must be one the sport offers", () => {
    expect(check({ format: "" })).toEqual({});
    for (const f of mod.formats) expect(check({ format: f }), f).toEqual({});
    expect(check({ format: "9v9" })).toEqual({ format: ["invalid"] });
  });

  it("the main and secondary skills must be top-level skills", () => {
    expect(check({ primarySkill: "crossover", subSkills: [] })).toEqual({
      primarySkill: ["invalid"],
    });
    expect(check({ primarySkill: "nope", subSkills: [] })).toEqual({ primarySkill: ["invalid"] });
    expect(check({ secondarySkills: ["weak_hand"], subSkills: [] })).toEqual({
      secondarySkills: ["invalid"],
    });
  });

  it("a sub-skill must exist, be a sub-skill, and sit under a skill the drill trains", () => {
    expect(check({ subSkills: ["nope"] })).toEqual({ subSkills: ["invalid"] });
    expect(check({ subSkills: ["footwork"] })).toEqual({ subSkills: ["invalid"] }); // top-level, not a sub-skill
    expect(check({ subSkills: ["skip_passes"] })).toEqual({ subSkills: ["sub_skill_parent"] }); // parent "passing" not trained
    // trained as a SECONDARY skill is enough
    expect(check({ secondarySkills: ["passing"], subSkills: ["skip_passes"] })).toEqual({});
    expect(check({ subSkills: ["crossover", "weak_hand"] })).toEqual({});
  });

  it("reports every problem at once, keyed by field", () => {
    expect(
      Object.keys(
        check({ category: "nope", format: "9v9", subSkills: ["nope"], space: "moon" }),
      ).sort(),
    ).toEqual(["category", "format", "space", "subSkills"]);
  });
});
