import { z } from "zod";
import { DRILL_PHASES, EQUIPMENT_RULES, FORMAT_KEY_PATTERN, INTENSITIES, LEVELS } from "@/db/enums";
import { diagramSchema } from "@/engines/diagram";
import { drillContentSchema, httpsUrl } from "./content";

/**
 * Input schema for creating/updating a drill (the Server Action payload). Sport-specific facts —
 * which categories/skills/equipment/spaces are valid — are checked against the catalog and the sport
 * module in the command, because they depend on the sport. Messages are i18n keys (`validation.*`).
 */

/** A catalog key (category / skill / equipment / space). Empty means "not chosen yet" → "required", anything else malformed → "invalid". */
const key = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, {
  error: (issue) => (issue.input === "" ? "required" : "invalid"),
});
const int = (min: number, max: number) =>
  z
    .int({ error: "number_invalid" })
    .min(min, { error: "range_invalid" })
    .max(max, { error: "range_invalid" });

export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9 -]{1,23}$/, { error: "tag_invalid" });

export const equipmentInputSchema = z.strictObject({
  type: key,
  rule: z.enum(EQUIPMENT_RULES),
  quantity: int(1, 60),
});

export const diagramInputSchema = z.strictObject({
  title: z.string().trim().max(60, { error: "too_long" }).default(""),
  diagram: diagramSchema,
});

export const drillInputSchema = z
  .strictObject({
    title: z.string().trim().min(3, { error: "too_short" }).max(120, { error: "too_long" }),
    description: z.string().trim().min(10, { error: "too_short" }).max(300, { error: "too_long" }),
    category: key,
    primarySkill: key,
    secondarySkills: z.array(key).max(3, { error: "too_many" }).default([]),
    /** Focus areas within the main/secondary skills (e.g. Crossover under Dribbling). Each must belong to one of them. */
    subSkills: z.array(key).max(3, { error: "too_many" }).default([]),
    level: z.enum(LEVELS, { error: "required" }),
    intensity: z.enum(INTENSITIES, { error: "required" }).default("medium"),
    /** "" = not specified. Allowed values come from the sport module (checked against the catalog in the command). */
    format: z
      .union([z.literal(""), z.string().regex(FORMAT_KEY_PATTERN, { error: "invalid" })])
      .default(""),
    /** Where in a session the drill fits best. */
    phases: z
      .array(z.enum(DRILL_PHASES, { error: "invalid" }))
      .max(DRILL_PHASES.length, { error: "too_many" })
      .default([]),
    ageMin: int(3, 99),
    ageMax: int(3, 99),
    playersMin: int(1, 60),
    playersMax: int(1, 60),
    durationMin: int(1, 240),
    durationMax: int(1, 240),
    space: key,
    tags: z.array(tagSchema).max(8, { error: "too_many" }).default([]),
    equipment: z.array(equipmentInputSchema).max(12, { error: "too_many" }).default([]),
    content: drillContentSchema,
    diagrams: z.array(diagramInputSchema).max(3, { error: "too_many" }).default([]),
    visibility: z.enum(["private", "organization"]).default("private"),
    sourceKind: z.enum(["original", "adapted", "external"]).default("original"),
    sourceName: z.string().trim().max(120, { error: "too_long" }).default(""),
    sourceUrl: z.union([httpsUrl, z.literal("")]).default(""),
    /** Present on updates: the version the editor loaded (optimistic concurrency). */
    version: z.int().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    const pairs: Array<[keyof typeof v, keyof typeof v]> = [
      ["ageMin", "ageMax"],
      ["playersMin", "playersMax"],
      ["durationMin", "durationMax"],
    ];
    for (const [lo, hi] of pairs) {
      if ((v[lo] as number) > (v[hi] as number))
        ctx.addIssue({ code: "custom", path: [hi], message: "range_order" });
    }
    if (v.secondarySkills.includes(v.primarySkill)) {
      ctx.addIssue({ code: "custom", path: ["secondarySkills"], message: "skill_duplicate" });
    }
    if (new Set(v.secondarySkills).size !== v.secondarySkills.length) {
      ctx.addIssue({ code: "custom", path: ["secondarySkills"], message: "skill_duplicate" });
    }
    if (new Set(v.subSkills).size !== v.subSkills.length) {
      ctx.addIssue({ code: "custom", path: ["subSkills"], message: "skill_duplicate" });
    }
    if (new Set(v.phases).size !== v.phases.length) {
      ctx.addIssue({ code: "custom", path: ["phases"], message: "skill_duplicate" });
    }
    if (new Set(v.equipment.map((e) => e.type)).size !== v.equipment.length) {
      ctx.addIssue({ code: "custom", path: ["equipment"], message: "equipment_duplicate" });
    }
    if (v.sourceKind === "adapted" && !v.sourceName) {
      ctx.addIssue({ code: "custom", path: ["sourceName"], message: "source_name_required" });
    }
    if (v.sourceKind === "external" && (!v.sourceUrl || !v.sourceName)) {
      ctx.addIssue({
        code: "custom",
        path: [v.sourceUrl ? "sourceName" : "sourceUrl"],
        message: "source_external_required",
      });
    }
  });

export type DrillInput = z.output<typeof drillInputSchema>;
export type DrillInputRaw = z.input<typeof drillInputSchema>;
