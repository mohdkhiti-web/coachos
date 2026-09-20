import type { PlanStatus } from "@/db/enums";
import { isIsoDate } from "./schedule";

/**
 * "My Sessions" filters live in the URL, like the drill library's: a filtered list can be bookmarked and shared,
 * and back/forward just work. Parsing is LENIENT — anything malformed is dropped, never thrown — because the URL
 * is untrusted input. Pure and client-safe.
 */

export const PLAN_PAGE_SIZE = 12;
const MAX_PAGE = 500;

/** No status = the live sessions (drafts and published). Archived and deleted sessions are one click away. */
export const STATUS_FILTERS = ["draft", "published", "archived", "deleted"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export interface PlanFilters {
  /** Free text over title, team and objective statement. */
  q: string;
  status?: StatusFilter;
  /** Age group key (u12…). */
  age?: string;
  /** Exact team name. */
  team?: string;
  /** Scheduled date range, inclusive, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  page: number;
}

export type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;

export function parsePlanFilters(sp: RawParams): PlanFilters {
  const status = first(sp.status);
  const date = (v: string | undefined) => (v && isIsoDate(v) ? v : undefined);
  const from = date(first(sp.from));
  const to = date(first(sp.to));
  const page = Number(first(sp.page));
  const team = (first(sp.team) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const age = first(sp.age);
  return {
    q: (first(sp.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    status: (STATUS_FILTERS as readonly string[]).includes(status ?? "")
      ? (status as StatusFilter)
      : undefined,
    age: age && KEY_RE.test(age) ? age : undefined,
    team: team || undefined,
    from,
    // a range that runs backwards is a typo, not a request: ignore the end rather than show nothing
    to: from && to && to < from ? undefined : to,
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** Canonical query string; defaults are omitted so URLs stay short. */
export function planFiltersToSearchParams(f: Partial<PlanFilters>): URLSearchParams {
  const p = new URLSearchParams();
  const set = (k: string, v: string | undefined) => {
    if (v) p.set(k, v);
  };
  set("q", f.q);
  set("status", f.status);
  set("age", f.age);
  set("team", f.team);
  set("from", f.from);
  set("to", f.to);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  return p;
}

export const planHrefFor = (basePath: string, f: Partial<PlanFilters>): string => {
  const qs = planFiltersToSearchParams(f).toString();
  return qs ? `${basePath}?${qs}` : basePath;
};

/** Number of narrowing filters applied (paging does not count). */
export const activePlanFilterCount = (f: PlanFilters): number =>
  [f.q, f.status, f.age, f.team, f.from, f.to].filter(Boolean).length;

/** How a status filter maps onto the query: which statuses to include, and whether to look in the trash. */
export function statusesFor(status: StatusFilter | undefined): {
  statuses: PlanStatus[];
  trash: boolean;
} {
  if (status === "deleted") return { statuses: [], trash: true };
  if (status) return { statuses: [status], trash: false };
  return { statuses: ["draft", "published"], trash: false };
}
