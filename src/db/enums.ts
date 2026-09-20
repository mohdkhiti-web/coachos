/** Pure constants (no imports) so client bundles can share them with the schema without pulling in Drizzle. */

export const PROFESSIONS = ["coach", "pe_teacher", "both"] as const;
export type Profession = (typeof PROFESSIONS)[number];

export const UNITS = ["metric", "imperial"] as const;
export type Units = (typeof UNITS)[number];
