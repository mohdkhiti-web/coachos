import { addDays, PAST_WEEKS, trainingWindow } from "@/lib/calendar";

/**
 * What a team sheet shows beyond names: how the squad is made up (ages from dates of birth, wheelchair classification
 * points) and how the team has been training (its sessions, matched by the team name the coach gives a session).
 * Pure — every number comes from rows handed in and today's date; nothing is estimated or filled in. A player
 * without a date of birth simply has no age; a team with no sessions has no pulse.
 */

export interface SessionLite {
  id: string;
  title: string;
  teamName: string | null;
  scheduledDate: string | null;
  startTime: string | null;
  totalMinutes: number;
}

export interface TeamPulse {
  /** Sessions and minutes on the calendar in the 28 days up to today. */
  sessions28: number;
  minutes28: number;
  next: SessionLite | null;
  last: SessionLite | null;
  /** Up to three sessions from today on (soonest first) and the three before today (latest first). */
  upcoming: SessionLite[];
  recent: SessionLite[];
  /** Minutes per week: six weeks back, this week, next week (the dashboard's window). */
  weeks: number[];
}

export interface SquadProfile {
  /** Players by age in whole years, youngest first (only players with a date of birth). */
  ages: { age: number; count: number }[];
  withAge: number;
  minAge: number | null;
  maxAge: number | null;
  medianAge: number | null;
  /** Wheelchair-basketball classification points present in the squad, lowest first. */
  classifications: { points: number; count: number }[];
}

const sameTeam = (a: string | null, b: string) =>
  !!a && a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** Whole years between a date of birth and today (YYYY-MM-DD strings, no time zones involved). */
export function ageOn(dob: string, today: string): number {
  const [by, bm, bd] = dob.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export function teamPulse(
  teamName: string,
  sessions: readonly SessionLite[],
  today: string,
): TeamPulse {
  const mine = sessions.filter((s) => s.scheduledDate && sameTeam(s.teamName, teamName));
  const byDate = [...mine].sort((a, b) =>
    `${a.scheduledDate} ${a.startTime ?? ""}`.localeCompare(
      `${b.scheduledDate} ${b.startTime ?? ""}`,
    ),
  );
  const from28 = addDays(today, -27);
  const recent = mine.filter((s) => s.scheduledDate! >= from28 && s.scheduledDate! <= today);
  const { from } = trainingWindow(today);
  const weeks = Array.from({ length: PAST_WEEKS + 2 }, (_, i) => {
    const start = addDays(from, 7 * i);
    const end = addDays(start, 6);
    return mine
      .filter((s) => s.scheduledDate! >= start && s.scheduledDate! <= end)
      .reduce((n, s) => n + s.totalMinutes, 0);
  });
  return {
    sessions28: recent.length,
    minutes28: recent.reduce((n, s) => n + s.totalMinutes, 0),
    next:
      byDate.find((s) => s.scheduledDate! > today) ??
      byDate.find((s) => s.scheduledDate === today) ??
      null,
    last: [...byDate].reverse().find((s) => s.scheduledDate! < today) ?? null,
    weeks,
    upcoming: byDate.filter((s) => s.scheduledDate! >= today).slice(0, 3),
    recent: byDate
      .filter((s) => s.scheduledDate! < today)
      .reverse()
      .slice(0, 3),
  };
}

export function squadProfile(
  players: readonly { dateOfBirth: string | null; classification: number | null }[],
  today: string,
): SquadProfile {
  const ages = players
    .filter((p) => p.dateOfBirth)
    .map((p) => ageOn(p.dateOfBirth!, today))
    .sort((a, b) => a - b);
  const count = <T>(xs: readonly T[]) => {
    const m = new Map<T, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const mid = Math.floor(ages.length / 2);
  return {
    ages: [...count(ages)].map(([age, n]) => ({ age, count: n })),
    withAge: ages.length,
    minAge: ages[0] ?? null,
    maxAge: ages[ages.length - 1] ?? null,
    medianAge:
      ages.length === 0
        ? null
        : ages.length % 2
          ? ages[mid]!
          : Math.round(((ages[mid - 1]! + ages[mid]!) / 2) * 10) / 10,
    classifications: [
      ...count(players.map((p) => p.classification).filter((c): c is number => c !== null)),
    ]
      .map(([points, n]) => ({ points, count: n }))
      .sort((a, b) => a.points - b.points),
  };
}
