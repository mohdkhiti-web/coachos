import { SPORT_KEYS, type SportKey } from "@/sports/registry";

/**
 * Which sport workspace a coach last chose, for the pages that have no `[sport]` segment of their
 * own (`/dashboard`) and the ones that redirect into one (`/sports`, `/sessions`, `/assistant`,
 * `/templates`). A cookie, not a profile field: CoachOS still has no per-coach "sport" concept, and
 * this is purely a display preference — switching it never changes what data a coach can see.
 *
 * Shared (client + server) constant and parser only — no `next/headers` import here, so the client-side
 * switcher can import `SPORT_COOKIE` without pulling in a server-only module (the same split `lib/theme.ts`
 * uses for the theme cookie; each server call site reads and parses the cookie itself).
 */
export const SPORT_COOKIE = "coachos-sport";

export function parseSportPref(value: string | undefined | null): SportKey | null {
  return (SPORT_KEYS as readonly string[]).includes(value ?? "") ? (value as SportKey) : null;
}
