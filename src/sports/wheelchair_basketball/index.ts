import { courtKey, type SportModule } from "../types";
import { FIBA_FULL_COURT, FIBA_HALF_COURT, FIBA_HALF_COURT_FAR } from "../basketball/court-fiba";

/**
 * Wheelchair basketball is played on the same FIBA court as standing basketball, so this module reuses
 * basketball's court geometry verbatim rather than redrawing it — only the diagram vocabulary (chair
 * markers, see `engines/diagram/schema.ts`'s `mobility` field) and the taxonomy/drills (content/
 * wheelchair_basketball/) are sport-specific.
 */
export const wheelchairBasketball: SportModule = {
  key: "wheelchair_basketball",
  defaultCourt: { type: "half", variant: "fiba" },
  courts: {
    [courtKey({ type: "half", variant: "fiba" })]: FIBA_HALF_COURT,
    [courtKey({ type: "half", variant: "fiba_far" })]: FIBA_HALF_COURT_FAR,
    [courtKey({ type: "full", variant: "fiba" })]: FIBA_FULL_COURT,
  },
  spaces: ["half_court", "full_court", "partial_court", "any_space"],
  formats: ["individual", "1v1", "2v2", "3v3", "4v4", "5v5", "group", "team"],
  defaults: { sessionMinutes: 90 },
};
