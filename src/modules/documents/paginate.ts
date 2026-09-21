import type { Fragment, Group } from "./types";

/**
 * Deterministic pagination: groups of pieces in, pages out. No browser, no measuring — every piece already
 * carries its estimated height (see estimate.ts), so the same session and design always break at the same
 * places, on the server, in the preview and in print.
 *
 * The rules, in the order they matter:
 *  1. A group that fits on one page stays whole: if it does not fit what is left, it starts on the next page
 *     (or the next column). Activities, the overview, the objectives and the equipment list are such groups —
 *     so an activity's diagram is never parted from its activity.
 *  2. A group taller than a whole page (a very long drill, a long timeline) is split BETWEEN its pieces, never
 *     inside one. A heading always travels with at least `lead` pieces, so it is never stranded at the bottom,
 *     and the continuation says it continues.
 *  3. Pieces bigger than a page are cut before they get here (see model.ts), so nothing is ever larger than a page.
 *  4. Pages are created only when there is something to put on them: never an empty page.
 */

export interface Segment {
  groups: Group[];
  columns: 1 | 2;
  /** Start on a fresh page even if the previous one has room. */
  newPage: boolean;
}

export interface BodyPage {
  columns: 1 | 2;
  fragments: Fragment[];
  usedMm: number[];
}

const EPS = 0.01;

export const fragmentHeight = (g: Group, from: number, to: number, continued: boolean): number => {
  const units = g.units.slice(from, to);
  const rows =
    units.reduce((sum, u) => sum + u.heightMm, 0) + Math.max(0, units.length - 1) * g.unitGap;
  return (continued ? g.headMm.continued : g.headMm.first) + rows + g.tailMm;
};

export function paginate(
  segments: readonly Segment[],
  geometry: { bodyHeightMm: number; groupGapMm: number },
): BodyPage[] {
  const slotHeight = geometry.bodyHeightMm;
  const pages: BodyPage[] = [];
  // one holder rather than loose variables: the helpers below reassign it, which TypeScript cannot see through a closure
  const at: { page: BodyPage | null; column: number; previousColumns: 1 | 2 | null } = {
    page: null,
    column: 0,
    previousColumns: null,
  };

  const startPage = (columns: 1 | 2) => {
    const page: BodyPage = {
      columns,
      fragments: [],
      usedMm: Array.from({ length: columns }, () => 0),
    };
    pages.push(page);
    at.page = page;
    at.column = 0;
  };
  const used = () => at.page?.usedMm[at.column] ?? 0;
  /** Move to the next column, or the next page after the last column. A slot that is still empty is never left. */
  const advance = () => {
    const page = at.page;
    if (!page || used() === 0) return;
    if (page.columns === 2 && at.column === 0) at.column = 1;
    else startPage(page.columns);
  };
  const fits = (height: number) =>
    at.page !== null &&
    used() + (used() > 0 ? geometry.groupGapMm : 0) + height <= slotHeight + EPS;

  const put = (g: Group, from: number, to: number, continued: boolean) => {
    const page = at.page;
    if (!page) return;
    const height = fragmentHeight(g, from, to, continued);
    const before = used();
    page.fragments.push({
      groupId: g.id,
      kind: g.kind,
      activity: g.activity,
      continued,
      column: at.column,
      units: g.units.slice(from, to),
      heightMm: height,
    });
    page.usedMm[at.column] = before + (before > 0 ? geometry.groupGapMm : 0) + height;
  };

  const placeGroup = (g: Group) => {
    const n = g.units.length;
    if (n === 0) return;
    const whole = fragmentHeight(g, 0, n, false);
    if (g.keepTogether && whole <= slotHeight + EPS) {
      if (!fits(whole)) advance();
      put(g, 0, n, false);
      return;
    }
    let i = 0;
    let continued = false;
    while (i < n) {
      const leadEnd = Math.min(n, i + Math.max(1, g.lead));
      if (!fits(fragmentHeight(g, i, leadEnd, continued))) advance();
      let j = leadEnd;
      while (j < n && fits(fragmentHeight(g, i, j + 1, continued))) j += 1;
      put(g, i, j, continued);
      i = j;
      continued = true;
      if (i < n) advance();
    }
  };

  for (const segment of segments) {
    if (segment.groups.every((g) => g.units.length === 0)) continue;
    // A fresh page when asked, when the column layout changes, or after a multi-column run (whose columns are not
    // balanced, so nothing can continue underneath). An empty page of the right shape is reused, never left behind.
    const page = at.page;
    const needsNewPage =
      !page || segment.newPage || page.columns !== segment.columns || at.previousColumns === 2;
    const reusable =
      page !== null && page.usedMm.every((u) => u === 0) && page.columns === segment.columns;
    if (needsNewPage && !reusable) startPage(segment.columns);
    at.previousColumns = segment.columns;
    for (const g of segment.groups) placeGroup(g);
  }
  return pages;
}
