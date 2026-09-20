import type { FieldErrors } from "@/lib/result";
import type { SportModule } from "@/sports/types";
import type { DrillInput } from "./validators";

/**
 * The parts of drill validation that depend on WHICH sport this is: the catalog (categories, skills and
 * their sub-skills, equipment) and the sport module's own vocabularies (spaces, formats). Pure — no
 * database, no framework — so the create/edit command and the seed loader apply the SAME rules and seed
 * content can never drift from what the app accepts. Messages are `validation.*` keys.
 */

export type CatalogView = {
  categories: ReadonlyArray<{ key: string }>;
  /** `parentKey` set = a sub-skill of that top-level skill. */
  skills: ReadonlyArray<{ key: string; parentKey?: string | null }>;
  equipment: ReadonlyArray<{ key: string }>;
};

type Checked = Pick<
  DrillInput,
  "category" | "primarySkill" | "secondarySkills" | "subSkills" | "equipment" | "space" | "format"
>;

export function checkAgainstCatalog(
  mod: Pick<SportModule, "spaces" | "formats">,
  catalog: CatalogView,
  input: Checked,
): FieldErrors {
  const errors: FieldErrors = {};
  const skill = (key: string) => catalog.skills.find((s) => s.key === key);
  const topLevel = (key: string) => {
    const s = skill(key);
    return s !== undefined && !s.parentKey;
  };

  if (!catalog.categories.some((c) => c.key === input.category)) errors.category = ["invalid"];
  // the main and secondary skills are top-level skills; finer focus goes in `subSkills`
  if (!topLevel(input.primarySkill)) errors.primarySkill = ["invalid"];
  if (!input.secondarySkills.every(topLevel)) errors.secondarySkills = ["invalid"];

  const parents = new Set([input.primarySkill, ...input.secondarySkills]);
  for (const key of input.subSkills) {
    const s = skill(key);
    if (!s || !s.parentKey) {
      errors.subSkills = ["invalid"];
      break;
    }
    if (!parents.has(s.parentKey)) {
      errors.subSkills = ["sub_skill_parent"]; // a sub-skill only makes sense under a skill the drill trains
      break;
    }
  }

  if (!input.equipment.every((e) => catalog.equipment.some((x) => x.key === e.type)))
    errors.equipment = ["invalid"];
  if (!mod.spaces.includes(input.space)) errors.space = ["invalid"];
  if (input.format !== "" && !mod.formats.includes(input.format)) errors.format = ["invalid"];
  return errors;
}
