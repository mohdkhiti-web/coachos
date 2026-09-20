import { courtKey, type SportModule } from "../types";
import { FIBA_FULL_COURT, FIBA_HALF_COURT } from "./court-fiba";

export const basketball: SportModule = {
  key: "basketball",
  defaultCourt: { type: "half", variant: "fiba" },
  courts: {
    [courtKey({ type: "half", variant: "fiba" })]: FIBA_HALF_COURT,
    [courtKey({ type: "full", variant: "fiba" })]: FIBA_FULL_COURT,
  },
  spaces: ["half_court", "full_court", "partial_court", "any_space"],
  formats: ["individual", "1v1", "2v2", "3v3", "4v4", "5v5", "group", "team"],
  defaults: { sessionMinutes: 90 },
};
