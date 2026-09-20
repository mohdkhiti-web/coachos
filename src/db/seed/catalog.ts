/**
 * Reference data, applied idempotently by `npm run db:seed` (keyed by stable `key`s, so it can be
 * re-run safely and extended in review). ARCHITECTURE.md §8.4: adding a sport = its code module +
 * its taxonomy here + flipping `status` to "active".
 */

export interface CatalogSport {
  key: string;
  name: string;
  status: "active" | "beta" | "planned";
}

/**
 * Only basketball is implemented. The rest are RESERVED rows so the data model demonstrably supports
 * more sports; their status is "planned", which keeps them out of navigation and routes entirely.
 */
export const SPORTS: readonly CatalogSport[] = [
  { key: "basketball", name: "Basketball", status: "active" },
  { key: "football", name: "Football", status: "planned" },
  { key: "volleyball", name: "Volleyball", status: "planned" },
  { key: "handball", name: "Handball", status: "planned" },
  { key: "swimming", name: "Swimming", status: "planned" },
  { key: "athletics", name: "Athletics", status: "planned" },
  { key: "cricket", name: "Cricket", status: "planned" },
  { key: "tennis", name: "Tennis", status: "planned" },
];

export interface CatalogItem {
  key: string;
  name: string;
  description?: string;
}

export const BASKETBALL_CATEGORIES: readonly CatalogItem[] = [
  {
    key: "warm_up",
    name: "Warm-up & Activation",
    description: "Prepare the body and get the ball moving.",
  },
  {
    key: "ball_handling",
    name: "Ball Handling",
    description: "Dribbling control, change of pace and direction.",
  },
  {
    key: "passing",
    name: "Passing & Catching",
    description: "Accurate, on-time passes and secure catches.",
  },
  { key: "shooting", name: "Shooting", description: "Form, balance and repeatable mechanics." },
  {
    key: "finishing",
    name: "Finishing at the Rim",
    description: "Layups and finishes with control.",
  },
  { key: "footwork", name: "Footwork & Body Control", description: "Stops, pivots and balance." },
  {
    key: "individual_defense",
    name: "Individual Defense",
    description: "Stance, slides and containing the ball.",
  },
  { key: "rebounding", name: "Rebounding", description: "Boxing out and securing the ball." },
  {
    key: "team_offense",
    name: "Team Offense",
    description: "Spacing, cutting and screening together.",
  },
  { key: "team_defense", name: "Team Defense", description: "Help, rotation and communication." },
  { key: "transition", name: "Transition", description: "Fast breaks and getting back." },
  { key: "conditioning", name: "Conditioning", description: "Basketball-specific fitness." },
  { key: "competition", name: "Games & Competition", description: "Pressure, scoring and fun." },
];

export const BASKETBALL_SKILLS: readonly CatalogItem[] = [
  { key: "dribbling", name: "Dribbling" },
  { key: "ball_control", name: "Ball control" },
  { key: "passing", name: "Passing" },
  { key: "catching", name: "Catching" },
  { key: "shooting_form", name: "Shooting form" },
  { key: "free_throws", name: "Free throws" },
  { key: "finishing", name: "Finishing at the rim" },
  { key: "footwork", name: "Footwork" },
  { key: "pivoting", name: "Pivoting" },
  { key: "cutting", name: "Cutting" },
  { key: "screening", name: "Screening" },
  { key: "spacing", name: "Spacing" },
  { key: "decision_making", name: "Decision making" },
  { key: "on_ball_defense", name: "On-ball defense" },
  { key: "closeouts", name: "Closeouts" },
  { key: "help_defense", name: "Help defense" },
  { key: "boxing_out", name: "Boxing out" },
  { key: "rebounding", name: "Rebounding" },
  { key: "communication", name: "Communication" },
  { key: "speed_agility", name: "Speed & agility" },
  { key: "conditioning", name: "Conditioning" },
  { key: "competitiveness", name: "Competitiveness" },
];

export interface CatalogEquipment extends CatalogItem {
  /** null = generic (usable by any sport). */
  sport: string | null;
}

export const EQUIPMENT: readonly CatalogEquipment[] = [
  { key: "basketball", name: "Basketballs", sport: "basketball" },
  { key: "hoop", name: "Basket / hoop", sport: "basketball" },
  { key: "cones", name: "Cones", sport: null },
  { key: "markers", name: "Flat markers / spots", sport: null },
  { key: "bibs", name: "Bibs / pinnies", sport: null },
  { key: "chairs", name: "Chairs", sport: null },
  { key: "stopwatch", name: "Stopwatch / timer", sport: null },
  { key: "agility_ladder", name: "Agility ladder", sport: null },
];
