import "server-only";
import { parseFilters, searchDrills, type DrillCardDto } from "@/modules/drills";
import { recommendationAge, recommendationQueries, type Viewer } from "@/modules/identity";
import { listPlans, type PlanListItemDto } from "@/modules/plans";
import type { CoachPriority } from "@/db/enums";

/**
 * Everything the Command Center shows, read from the same queries the rest of the app uses — sessions from the plans
 * module, drills from the drill library. Nothing here is invented: an empty answer is returned as empty, and the page
 * turns it into an honest empty state.
 */

export interface Recommendation {
  drill: DrillCardDto;
  /** The coaching priority this drill was recommended for. */
  priority: CoachPriority;
}

export interface CommandCenterDto {
  /** The next scheduled session (today or later), if any. */
  nextSession: PlanListItemDto | null;
  recentSessions: PlanListItemDto[];
  sessionCount: number;
  favoriteCount: number;
  recommendations: Recommendation[];
}

const LIVE = ["draft", "published"] as const;
const MAX_RECOMMENDATIONS = 6;

/** Today's date (YYYY-MM-DD) in the coach's own timezone. */
function todayIn(timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone ?? "UTC" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  }
}

export async function getCommandCenter(
  viewer: Viewer,
  sportKey: string,
): Promise<CommandCenterDto> {
  const { actor, profile } = viewer;
  const base = parseFilters({});
  const age = recommendationAge(profile.coaching.ageGroups);
  const queries = recommendationQueries(profile.coaching.priorities);

  const [upcoming, recent, favorites, ...perPriority] = await Promise.all([
    listPlans(actor, sportKey, { from: todayIn(profile.timezone), statuses: [...LIVE], limit: 30 }),
    listPlans(actor, sportKey, { statuses: [...LIVE], limit: 3 }),
    searchDrills(actor, sportKey, { ...base, favorites: true }, { pageSize: 1 }),
    ...queries.map((q) =>
      searchDrills(
        actor,
        sportKey,
        { ...base, scope: "library", sort: "recent", category: q.category, skill: q.skill, age },
        { pageSize: 3 },
      ),
    ),
  ]);

  const nextSession =
    [...(upcoming?.items ?? [])]
      .filter((p) => p.scheduledDate)
      .sort((a, b) =>
        `${a.scheduledDate} ${a.startTime ?? "00:00"}`.localeCompare(
          `${b.scheduledDate} ${b.startTime ?? "00:00"}`,
        ),
      )[0] ?? null;

  // one drill per priority in turn, so every priority the coach chose is represented, without repeating a drill
  const recommendations: Recommendation[] = [];
  const seen = new Set<string>();
  for (let round = 0; round < 3 && recommendations.length < MAX_RECOMMENDATIONS; round++) {
    perPriority.forEach((page, i) => {
      const drill = page?.items[round];
      if (!drill || seen.has(drill.id) || recommendations.length >= MAX_RECOMMENDATIONS) return;
      seen.add(drill.id);
      recommendations.push({ drill, priority: queries[i]!.priority });
    });
  }

  return {
    nextSession,
    recentSessions: recent?.items ?? [],
    // `total` counts every live session, not just the three returned
    sessionCount: recent?.total ?? 0,
    favoriteCount: favorites?.total ?? 0,
    recommendations,
  };
}
