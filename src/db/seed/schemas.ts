import { z } from "zod";
import { SPORT_STATUSES } from "../enums";

/**
 * Shapes of the content files under `content/` (the seed's source of truth). Drill files are validated
 * with the app's own `drillInputSchema` plus the catalog and diagram rules — see load.ts — so this file
 * only describes the catalog files and the file-name convention.
 */

const key = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, { error: "keys are lower_snake_case" });
const name = z.string().trim().min(2).max(80);

/** A drill file `content/<sport>/drills/<seedKey>.json` must be named after its `seedKey`. */
export const SEED_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const sportsFileSchema = z.array(
  z.strictObject({ key, name, status: z.enum(SPORT_STATUSES) }),
);

/** `sport: null` = generic equipment usable by any sport (cones, bibs…). */
export const equipmentFileSchema = z.array(z.strictObject({ key, name, sport: key.nullable() }));

const age = z.number().int().min(3).max(99);

export const taxonomyFileSchema = z.strictObject({
  categories: z.array(
    z.strictObject({ key, name, description: z.string().trim().max(200).optional() }),
  ),
  /** Two levels only: a top-level skill and its sub-skills (mirrors the database rule). */
  skills: z.array(
    z.strictObject({
      key,
      name,
      children: z.array(z.strictObject({ key, name })).default([]),
    }),
  ),
  /**
   * What a coach says a session is FOR (Shooting, Transition, Defense…). Each maps onto the detailed catalog above:
   * the skills it covers (a top-level skill stands for its sub-skills too) and the drill categories.
   */
  objectives: z
    .array(
      z.strictObject({
        key,
        name,
        skills: z.array(key).default([]),
        categories: z.array(key).default([]),
      }),
    )
    .default([]),
  /** Age bands a session can be planned for (U8 … Senior). The ages are the band's TYPICAL range. */
  ageGroups: z
    .array(
      z
        .strictObject({ key, name, ageMin: age, ageMax: age })
        .refine((g) => g.ageMin <= g.ageMax, { path: ["ageMax"], error: "ageMax is below ageMin" }),
    )
    .default([]),
});
