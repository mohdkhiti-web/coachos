import type { CourtPack, CourtRef } from "@/engines/diagram";

/**
 * A sport is CODE (geometry, diagram vocabulary, facets) plus DATA (taxonomy in the database).
 * ARCHITECTURE.md §8: behaviour that must be type-checked and tested lives here; categories, skills
 * and equipment that admins refine live in the `sports`/`categories`/`skills`/`equipment_types` tables.
 *
 * Adding a sport = a new folder implementing this interface + seeding its taxonomy + flipping
 * `sports.status` to "active". No `if (sport === "basketball")` may exist outside src/sports/basketball.
 */
export const SPORT_KEYS = ["basketball"] as const;
export type SportKey = (typeof SPORT_KEYS)[number];

export interface SportModule {
  key: SportKey;
  /** Court/pitch packs keyed by `courtKey()`. */
  courts: Readonly<Record<string, CourtPack>>;
  defaultCourt: CourtRef;
  /** Values allowed for a drill's `space` facet. Labels: messages `sports.spaces.<value>`. */
  spaces: readonly string[];
  /**
   * Values allowed for a drill's `format` facet (how many-on-how-many), in the order shown as quick-filter
   * chips. Labels: messages `drills.formats.<value>`. Owned by the sport, like `spaces`, so a sport without
   * "3v3" never has to carry it.
   */
  formats: readonly string[];
  defaults: { sessionMinutes: number };
}

export const courtKey = (c: CourtRef) => `${c.type}:${c.variant}`;
