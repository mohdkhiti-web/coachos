/** Shared (server + client) theme constants. The preference lives in a cookie so the server can render the right theme with no flash. */
export const THEME_COOKIE = "coachos-theme";
export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export function parseTheme(value: string | undefined | null): ThemeMode {
  return (THEME_MODES as readonly string[]).includes(value ?? "") ? (value as ThemeMode) : "system";
}
