import {
  DRILL_PHASES,
  FORMAT_KEY_PATTERN,
  INTENSITIES,
  LEVELS,
  type DrillPhase,
  type Intensity,
  type Level,
} from "@/db/enums";

/**
 * Library filters live in the URL so a filtered view can be bookmarked and shared (and back/forward
 * just work). Parsing is LENIENT — anything malformed is dropped, never thrown — because the URL is
 * untrusted input. Pure and client-safe.
 */

export const PAGE_SIZE = 12;
export const MAX_PAGE = 500;

export const DURATION_BANDS = {
  short: { min: 1, max: 10 },
  medium: { min: 11, max: 20 },
  long: { min: 21, max: 240 },
} as const;
export type DurationBand = keyof typeof DURATION_BANDS;
export const DURATION_BAND_KEYS = Object.keys(DURATION_BANDS) as DurationBand[];

export const SCOPES = ["all", "library", "mine"] as const;
export type Scope = (typeof SCOPES)[number];

export const SORTS = ["relevance", "recent", "title", "duration"] as const;
export type Sort = (typeof SORTS)[number];

export interface DrillFilters {
  q: string;
  category?: string;
  skill?: string;
  level?: Level;
  age?: number;
  players?: number;
  duration?: DurationBand;
  equipment?: string;
  intensity?: Intensity;
  /** How many-on-how-many (individual, 1v1, 3v3…); the allowed values belong to the sport. */
  format?: string;
  /** Where in a session the drill fits (warm_up, skill, …). */
  phase?: DrillPhase;
  /** Only the viewer's own favorites. */
  favorites: boolean;
  scope: Scope;
  sort: Sort;
  page: number;
}

export type RawParams = Record<string, string | string[] | undefined>;

const KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const oneOf = <T extends string>(list: readonly T[], v: string | undefined): T | undefined =>
  v && (list as readonly string[]).includes(v) ? (v as T) : undefined;
const key = (v: string | undefined) => (v && KEY_RE.test(v) ? v : undefined);
/** Format keys may start with a digit (1v1, 3v3), unlike catalog keys. */
const formatKey = (v: string | undefined) => (v && FORMAT_KEY_PATTERN.test(v) ? v : undefined);
const int = (v: string | undefined, min: number, max: number) => {
  if (!v || !/^\d{1,3}$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
};

export function parseFilters(sp: RawParams): DrillFilters {
  const q = (first(sp.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const requestedSort = oneOf(SORTS, first(sp.sort));
  // "relevance" only means something when there is a search term
  const sort: Sort =
    requestedSort === "relevance" && !q
      ? "recent"
      : (requestedSort ?? (q ? "relevance" : "recent"));
  return {
    q,
    category: key(first(sp.category)),
    skill: key(first(sp.skill)),
    level: oneOf(LEVELS, first(sp.level)),
    age: int(first(sp.age), 3, 99),
    players: int(first(sp.players), 1, 60),
    duration: oneOf(DURATION_BAND_KEYS, first(sp.duration)),
    equipment: key(first(sp.equipment)),
    intensity: oneOf(INTENSITIES, first(sp.intensity)),
    format: formatKey(first(sp.format)),
    phase: oneOf(DRILL_PHASES, first(sp.phase)),
    favorites: first(sp.favorites) === "1",
    scope: oneOf(SCOPES, first(sp.scope)) ?? "all",
    sort,
    page: int(first(sp.page), 1, MAX_PAGE) ?? 1,
  };
}

/** Canonical query string for a filter set; defaults are omitted so URLs stay short and shareable. */
export function filtersToSearchParams(f: Partial<DrillFilters>): URLSearchParams {
  const p = new URLSearchParams();
  const set = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== "") p.set(k, String(v));
  };
  set("q", f.q);
  set("category", f.category);
  set("skill", f.skill);
  set("level", f.level);
  set("age", f.age);
  set("players", f.players);
  set("duration", f.duration);
  set("equipment", f.equipment);
  set("intensity", f.intensity);
  set("format", f.format);
  set("phase", f.phase);
  if (f.favorites) set("favorites", 1);
  if (f.scope && f.scope !== "all") set("scope", f.scope);
  const defaultSort: Sort = f.q ? "relevance" : "recent";
  if (f.sort && f.sort !== defaultSort) set("sort", f.sort);
  if (f.page && f.page > 1) set("page", f.page);
  return p;
}

/** Number of narrowing filters applied (search text counts; paging and sorting do not). */
export function activeFilterCount(f: DrillFilters): number {
  return [
    f.q,
    f.category,
    f.skill,
    f.level,
    f.age,
    f.players,
    f.duration,
    f.equipment,
    f.intensity,
    f.format,
    f.phase,
    f.favorites ? "favorites" : undefined,
    f.scope !== "all" ? f.scope : undefined,
  ].filter((v) => v !== undefined && v !== "").length;
}

export const hrefFor = (basePath: string, f: Partial<DrillFilters>): string => {
  const qs = filtersToSearchParams(f).toString();
  return qs ? `${basePath}?${qs}` : basePath;
};
