import { loadContent, type SeedDrill } from "./load";

export type { SeedDrill };

/**
 * The curated basketball library, loaded and validated from `content/basketball/drills/*.json`.
 * Adding hundreds later = adding files there (checked at load time; `npm run content:check`).
 */
export const SEED_DRILLS: readonly SeedDrill[] = loadContent().bySport["basketball"]!.drills;
