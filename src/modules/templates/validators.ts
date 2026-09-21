import { z } from "zod";
import { TEMPLATE_CATEGORIES, TEMPLATE_STATUSES, TEMPLATE_VISIBILITIES } from "@/db/enums";
import {
  diffDesign,
  documentDesignSchema,
  presetDesign,
  PRESET_IDS,
  templateConfigSchema,
  type DocumentDesign,
  type PresetId,
  type TemplateConfig,
} from "@/modules/documents";

/**
 * Input schemas for the template commands (the Server Action payloads). Pure and client-safe. Messages are i18n keys
 * (`validation.*`). The design arrives COMPLETE and validated field by field; what is stored is only the difference
 * from its preset (`buildTemplateConfig`).
 *
 * There is deliberately no field here for anything that belongs to one session — a date, a start time, a number, a
 * timeline, attendance, notes, reflection answers. The schema is strict: such a field is refused, not ignored.
 */

export const templateInputSchema = z.strictObject({
  name: z.string().trim().min(1, { error: "required" }).max(80, { error: "too_long" }),
  description: z.string().trim().max(300, { error: "too_long" }).default(""),
  category: z.enum(TEMPLATE_CATEGORIES).default("general"),
  visibility: z.enum(TEMPLATE_VISIBILITIES).default("private"),
  preset: z.enum(PRESET_IDS),
  design: documentDesignSchema,
  /** Present on updates: the version the editor loaded (optimistic concurrency). */
  version: z.int().min(1).optional(),
});
export type TemplateInput = z.output<typeof templateInputSchema>;
export type TemplateInputRaw = z.input<typeof templateInputSchema>;

export const templateStatusSchema = z.enum(TEMPLATE_STATUSES);

/** The stored form: the preset and only what the design changes on top of it. */
export function buildTemplateConfig(preset: PresetId, design: DocumentDesign): TemplateConfig {
  return templateConfigSchema.parse({
    schemaVersion: 1,
    preset,
    design: diffDesign(presetDesign(preset), design),
  });
}

/** Key-order-independent JSON, so two configs compare equal whatever order a database returned their keys in. */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, x]) => [k, walk(x)]),
      );
    return v;
  };
  return JSON.stringify(walk(value));
}
