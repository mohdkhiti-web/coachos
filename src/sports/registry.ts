import type { CourtPack, CourtRef } from "@/engines/diagram";
import { basketball } from "./basketball";
import { courtKey, SPORT_KEYS, type SportKey, type SportModule } from "./types";

/**
 * The single map from a sport key to its code module. The URL segment `[sport]` is validated against
 * this registry (unknown → 404); nothing else in the app switches on a sport name (ARCHITECTURE.md §8.2).
 */
export const SPORT_MODULES: Readonly<Record<SportKey, SportModule>> = { basketball };

export const isSportKey = (value: string): value is SportKey =>
  (SPORT_KEYS as readonly string[]).includes(value);

export function getSportModule(key: string): SportModule | undefined {
  return isSportKey(key) ? SPORT_MODULES[key] : undefined;
}

/** The court pack for a diagram's `court` reference, or undefined if the sport doesn't offer it. */
export function getCourtPack(sport: string, court: CourtRef): CourtPack | undefined {
  return getSportModule(sport)?.courts[courtKey(court)];
}

export { SPORT_KEYS, courtKey };
export type { SportKey, SportModule };
