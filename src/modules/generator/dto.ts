import type { Requirements } from "./requirements";
import type { DrillCandidate, GeneratedItem, ValidationReport } from "./types";

/**
 * What crosses from the generator's server side to the screen: plain data only (pure and client-safe).
 * A preview is the answer to "what would you build for this request?" — nothing is written until a coach creates it.
 */
export interface GenerationPreview {
  requirements: Requirements;
  items: GeneratedItem[];
  validation: ValidationReport;
  /** Peak need per counted item (basketball, cones…), for the coach's kit list. */
  equipment: Record<string, number>;
  considered: { total: number; eligible: number };
  /** Every drill the items and their alternatives name, so the screen never has to guess. */
  drills: Record<string, DrillCandidate>;
}

/** Text the timeline needs that only the interface can translate. */
export interface GenerationLabels {
  breakTitle: string;
  /** Used when the coach gave the session no title: given the objective's name and the minutes. */
  title: (objective: string, minutes: number) => string;
}
