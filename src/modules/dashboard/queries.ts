import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { planActivities, plans } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { tenantTx } from "@/lib/db/tx";
import { parseFilters, searchDrills, type DrillCardDto } from "@/modules/drills";
import { getSportOverview } from "@/modules/drills";
import {
  PRIORITY_QUERY,
  recommendationAge,
  recommendationQueries,
  type Viewer,
} from "@/modules/identity";
import { getPlan, listPlans, type PlanListItemDto } from "@/modules/plans";
import { getSport } from "@/modules/sports";
import type { CoachPriority } from "@/db/enums";
import {
  summarizeTraining,
  trainingWindow,
  type TrainingRow,
  type TrainingSummary,
} from "./training";

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

/** One block of a session's running tally: an activity's minutes and phase, in session order. */
export interface TallyBlock {
  id: string;
  minutes: number;
  phase: string | null;
  title: string;
}

/** The session the dashboard puts on court: the next scheduled one, else the most recently updated. */
export interface FeaturedSession {
  plan: PlanListItemDto;
  kind: "next" | "latest";
  blocks: TallyBlock[];
}

export interface CommandCenterDto {
  featured: FeaturedSession | null;
  /** How many published library drills this sport has (the real count, for the sheet strip). */
  libraryCount: number;
  /** The next scheduled session (today or later), if any. */
  nextSession: PlanListItemDto | null;
  recentSessions: PlanListItemDto[];
  sessionCount: number;
  favoriteCount: number;
  recommendations: Recommendation[];
  /** Weekly load and skill coverage from the coach's scheduled sessions. */
  training: TrainingSummary;
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

  const today = todayIn(profile.timezone);
  const window = trainingWindow(today);
  const [rows, overview, upcoming, recent, favorites, library, ...perPriority] = await Promise.all([
    trainingRows(actor, sportKey, window.from, window.to),
    getSportOverview(actor, sportKey),
    listPlans(actor, sportKey, { from: today, statuses: [...LIVE], limit: 30 }),
    listPlans(actor, sportKey, { statuses: [...LIVE], limit: 3 }),
    searchDrills(actor, sportKey, { ...base, favorites: true }, { pageSize: 1 }),
    searchDrills(actor, sportKey, { ...base, scope: "library" }, { pageSize: 1 }),
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

  // the featured session's activities, for its tally (one extra read, only when there is a session to show)
  const featuredPlan = nextSession ?? recent?.items[0] ?? null;
  const detail = featuredPlan ? await getPlan(actor, sportKey, featuredPlan.id) : null;
  const featured: FeaturedSession | null = featuredPlan
    ? {
        plan: featuredPlan,
        kind: nextSession ? "next" : "latest",
        blocks: (detail?.activities ?? []).map((a) => ({
          id: a.id,
          minutes: a.durationMin,
          phase: a.kind === "break" ? "break" : a.phase,
          title: a.title,
        })),
      }
    : null;

  // the coach's priorities that map onto a library category, named as the library names them
  const names = new Map((overview?.categories ?? []).map((c) => [c.key, c.name]));
  const priorityCategories = [
    ...new Set(
      profile.coaching.priorities
        .map((p) => PRIORITY_QUERY[p]?.category)
        .filter((k): k is string => !!k && names.has(k)),
    ),
  ].map((key) => ({ key, name: names.get(key)! }));

  return {
    training: summarizeTraining(rows, today, priorityCategories),
    featured,
    libraryCount: library?.total ?? 0,
    nextSession,
    recentSessions: recent?.items ?? [],
    // `total` counts every live session, not just the three returned
    sessionCount: recent?.total ?? 0,
    favoriteCount: favorites?.total ?? 0,
    recommendations,
  };
}

/** One row per activity of the live, dated sessions in [from, to] — the raw material of the training charts. */
async function trainingRows(
  actor: Actor,
  sportKey: string,
  from: string,
  to: string,
): Promise<TrainingRow[]> {
  const sport = await getSport(sportKey);
  if (!sport) return [];
  return tenantTx(actor, (tx) =>
    tx
      .select({
        date: sql<string>`${plans.scheduledDate}::text`,
        planId: plans.id,
        phase: planActivities.phase,
        kind: planActivities.kind,
        minutes: planActivities.durationMin,
        categoryKey: sql<string | null>`${planActivities.snapshot} -> 'category' ->> 'key'`,
        categoryName: sql<string | null>`${planActivities.snapshot} -> 'category' ->> 'name'`,
      })
      .from(planActivities)
      .innerJoin(plans, eq(plans.id, planActivities.planId))
      .where(
        and(
          eq(plans.sportId, sport.id),
          isNull(plans.deletedAt),
          inArray(plans.status, [...LIVE]),
          sql`${plans.scheduledDate} BETWEEN ${from} AND ${to}`,
        ),
      ),
  );
}
