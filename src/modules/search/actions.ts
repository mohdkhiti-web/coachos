"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { parseFilters, searchDrills } from "@/modules/drills";
import { requireViewer } from "@/modules/identity";
import { listPlans } from "@/modules/plans";
import { isSportKey } from "@/sports/registry";

export type QuickResult = {
  drills: Array<{ id: string; title: string; category: string; scope: string }>;
  sessions: Array<{ id: string; title: string; minutes: number; team: string | null }>;
};

const input = z.strictObject({
  sport: z.string().max(40),
  q: z.string().max(80),
});

const EMPTY: QuickResult = { drills: [], sessions: [] };

/**
 * The command palette's search: the SAME queries the library and My Sessions use (row-level security applies; a
 * coach only ever finds what they may open). Read-only. Authenticates on every call; a bad payload returns nothing.
 */
export async function quickSearchAction(raw: unknown): Promise<QuickResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success || !isSportKey(parsed.data.sport)) return EMPTY;
  const q = parsed.data.q.replace(/\s+/g, " ").trim();
  if (q.length < 2) return EMPTY;
  const { actor } = await requireViewer();
  try {
    const [drills, sessions] = await Promise.all([
      searchDrills(actor, parsed.data.sport, parseFilters({ q }), { pageSize: 6 }),
      listPlans(actor, parsed.data.sport, { q, statuses: ["draft", "published"], limit: 5 }),
    ]);
    return {
      drills: (drills?.items ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category.name,
        scope: d.scope,
      })),
      sessions: (sessions?.items ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        minutes: s.totalMinutes,
        team: s.teamName,
      })),
    };
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "quick_search.failed");
    return EMPTY;
  }
}
