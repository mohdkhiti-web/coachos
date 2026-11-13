/**
 * Training load and skill coverage, from the coach's own scheduled sessions. Pure (no clock, no database): the query
 * hands over one row per planned activity and today's date in the coach's timezone; this turns them into what the
 * Command Center charts. Only sessions with a date count — an undated draft is an idea, not training on the calendar.
 * Breaks are not training time.
 */

import { addDays, PAST_WEEKS, trainingWindow, weekStart } from "@/lib/calendar";

export { PAST_WEEKS, todayIn, trainingWindow, weekStart } from "@/lib/calendar";

export interface TrainingRow {
  /** The session's scheduled date, YYYY-MM-DD. */
  date: string;
  planId: string;
  phase: string | null;
  kind: string;
  minutes: number;
  /** From the drill copied into the session; null for a custom activity. */
  categoryKey: string | null;
  categoryName: string | null;
}

export interface WeekLoad {
  /** Monday and Sunday of the week, YYYY-MM-DD. */
  start: string;
  end: string;
  minutes: number;
  sessions: number;
  /** Minutes by phase, largest first (`unphased` for activities without one). */
  phases: { phase: string; minutes: number }[];
  /** Before this week, this week, or next week (planned ahead). */
  when: "past" | "current" | "next";
}

export interface CategoryLoad {
  /** null = custom activities that are not library drills. */
  key: string | null;
  name: string | null;
  minutes: number;
  /** One of the coach's chosen priorities. */
  priority: boolean;
}

export interface TrainingSummary {
  weeks: WeekLoad[];
  /** Minutes by category over the coverage window, largest first. */
  categories: CategoryLoad[];
  /** Priority categories with no scheduled minutes in the coverage window. */
  untrained: { key: string; name: string }[];
  /** Minutes on this week's calendar. */
  currentMinutes: number;
  /** Mean of the four weeks before this one, or null when none of them had anything scheduled. */
  recentAverage: number | null;
  /** Dated sessions in the whole window. */
  scheduledSessions: number;
  coverageFrom: string;
  coverageTo: string;
}

/** Coverage looks at this week and the three before it. */
export const COVERAGE_WEEKS = 4;

export function summarizeTraining(
  rows: readonly TrainingRow[],
  today: string,
  priorityCategories: readonly { key: string; name: string }[],
): TrainingSummary {
  const current = weekStart(today);
  const { from } = trainingWindow(today);
  const work = rows.filter((r) => r.kind !== "break" && r.minutes > 0);

  const weeks: WeekLoad[] = [];
  for (let i = 0; i < PAST_WEEKS + 2; i++) {
    const start = addDays(from, 7 * i);
    const end = addDays(start, 6);
    const inWeek = work.filter((r) => r.date >= start && r.date <= end);
    const byPhase = new Map<string, number>();
    for (const r of inWeek) {
      const p = r.phase ?? "unphased";
      byPhase.set(p, (byPhase.get(p) ?? 0) + r.minutes);
    }
    weeks.push({
      start,
      end,
      minutes: inWeek.reduce((s, r) => s + r.minutes, 0),
      sessions: new Set(rows.filter((r) => r.date >= start && r.date <= end).map((r) => r.planId))
        .size,
      phases: [...byPhase]
        .map(([phase, minutes]) => ({ phase, minutes }))
        .sort((a, b) => b.minutes - a.minutes || a.phase.localeCompare(b.phase)),
      when: start < current ? "past" : start === current ? "current" : "next",
    });
  }

  const coverageFrom = addDays(current, -7 * (COVERAGE_WEEKS - 1));
  const coverageTo = addDays(current, 6);
  const priorityKeys = new Set(priorityCategories.map((c) => c.key));
  const byCategory = new Map<string, CategoryLoad>();
  for (const r of work) {
    if (r.date < coverageFrom || r.date > coverageTo) continue;
    const id = r.categoryKey ?? "";
    const entry = byCategory.get(id) ?? {
      key: r.categoryKey,
      name: r.categoryName,
      minutes: 0,
      priority: r.categoryKey ? priorityKeys.has(r.categoryKey) : false,
    };
    entry.minutes += r.minutes;
    byCategory.set(id, entry);
  }
  const categories = [...byCategory.values()].sort(
    (a, b) => b.minutes - a.minutes || (a.name ?? "").localeCompare(b.name ?? ""),
  );

  const previous = weeks.filter((w) => w.when === "past").slice(-4);
  const recentAverage = previous.some((w) => w.minutes > 0)
    ? Math.round(previous.reduce((s, w) => s + w.minutes, 0) / previous.length)
    : null;

  return {
    weeks,
    categories,
    untrained: priorityCategories.filter((c) => !byCategory.has(c.key)),
    currentMinutes: weeks.find((w) => w.when === "current")?.minutes ?? 0,
    recentAverage,
    scheduledSessions: new Set(rows.map((r) => r.planId)).size,
    coverageFrom,
    coverageTo,
  };
}
