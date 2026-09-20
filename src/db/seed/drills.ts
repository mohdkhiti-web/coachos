import { FINISHING_DRILLS } from "./basketball-finishing";
import { SKILL_DRILLS } from "./basketball-skills";
import { TEAM_DRILLS } from "./basketball-team";
import type { SeedDrill } from "./helpers";

/** The initial, curated basketball library. Adding hundreds later = adding entries here (validated at seed time). */
export const SEED_DRILLS: readonly SeedDrill[] = [
  ...SKILL_DRILLS,
  ...FINISHING_DRILLS,
  ...TEAM_DRILLS,
];
