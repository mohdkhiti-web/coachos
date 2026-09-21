import { TEMPLATE_CATEGORIES, type TemplateCategory } from "@/db/enums";

/**
 * The Templates page's filters live in the URL, like the drill library's and My Sessions': a filtered list can be
 * bookmarked and shared. Parsing is LENIENT — anything malformed is dropped, never thrown — because the URL is
 * untrusted input. Pure and client-safe.
 */

export const TEMPLATE_PAGE_SIZE = 12;
const MAX_PAGE = 500;

/** Whose templates: mine (personal) or the ones shared with the workspace. No scope = both. */
export const TEMPLATE_SCOPES = ["mine", "organization"] as const;
export type TemplateScope = (typeof TEMPLATE_SCOPES)[number];

/** No status = the live templates. Archived and deleted ones are one click away. */
export const TEMPLATE_STATUS_FILTERS = ["archived", "deleted"] as const;
export type TemplateStatusFilter = (typeof TEMPLATE_STATUS_FILTERS)[number];

export interface TemplateFilters {
  /** Free text over name and description. */
  q: string;
  category?: TemplateCategory;
  scope?: TemplateScope;
  status?: TemplateStatusFilter;
  page: number;
}

export type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const oneOf = <T extends string>(list: readonly T[], v: string | undefined): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined;

export function parseTemplateFilters(sp: RawParams): TemplateFilters {
  const page = Number(first(sp.page));
  return {
    q: (first(sp.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    category: oneOf(TEMPLATE_CATEGORIES, first(sp.category)),
    scope: oneOf(TEMPLATE_SCOPES, first(sp.scope)),
    status: oneOf(TEMPLATE_STATUS_FILTERS, first(sp.status)),
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** Canonical query string; defaults are omitted so URLs stay short. */
export function templateFiltersToSearchParams(f: Partial<TemplateFilters>): URLSearchParams {
  const p = new URLSearchParams();
  const set = (k: string, v: string | undefined) => {
    if (v) p.set(k, v);
  };
  set("q", f.q);
  set("category", f.category);
  set("scope", f.scope);
  set("status", f.status);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  return p;
}

export const templateHrefFor = (basePath: string, f: Partial<TemplateFilters>): string => {
  const qs = templateFiltersToSearchParams(f).toString();
  return qs ? `${basePath}?${qs}` : basePath;
};

/** Number of narrowing filters applied (paging does not count). */
export const activeTemplateFilterCount = (f: TemplateFilters): number =>
  [f.q, f.category, f.scope, f.status].filter(Boolean).length;

/** How a status filter maps onto the query: which statuses to include, and whether to look in the trash. */
export function templateStatusesFor(status: TemplateStatusFilter | undefined): {
  statuses: Array<"active" | "archived">;
  trash: boolean;
} {
  if (status === "deleted") return { statuses: [], trash: true };
  if (status === "archived") return { statuses: ["archived"], trash: false };
  return { statuses: ["active"], trash: false };
}
