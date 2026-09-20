/**
 * Session timing — pure functions, no I/O. The rule that matters: NOTHING here is stored.
 *
 *   total length  = the sum of the activities' durations
 *   timeline      = the running total of those durations in order (00:00–10:00, 10:00–20:00…)
 *   end time      = start time + total length
 *
 * so changing one activity's duration (or reordering) can never leave a stale end time behind. The database
 * exposes the same numbers in the `plan_totals` view for lists; a test holds the two to the same answers.
 *
 * A scheduled session is a LOCAL wall-clock date and time in an IANA zone ("Tuesday 7:00 PM in Europe/Paris"),
 * because that is what a coach means — and it keeps meaning that if the zone's rules change. It becomes an
 * instant only here, so an hour lost or gained to daylight saving during the session is honoured.
 */

export const MINUTE_MS = 60_000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A real calendar date in `YYYY-MM-DD` (2025-02-30 is not one). */
export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** A 24-hour clock time `HH:MM`. */
export const isClockTime = (value: string): boolean => TIME_RE.test(value);

/** A zone name the runtime knows (and therefore can compute with). */
export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------
// the timeline
// ---------------------------------------------------------------------------------------------------

export type Timed = { durationMin: number };
export type OnTimeline<T> = T & { startMin: number; endMin: number };

/** The session's total length: the sum of its activities. */
export const totalMinutes = (activities: readonly Timed[]): number =>
  activities.reduce((sum, a) => sum + a.durationMin, 0);

/** Each activity with the minute it starts and ends at, counted from the start of the session. Input order = timeline order. */
export function buildTimeline<T extends Timed>(activities: readonly T[]): OnTimeline<T>[] {
  let at = 0;
  return activities.map((a) => {
    const item = { ...a, startMin: at, endMin: at + a.durationMin };
    at = item.endMin;
    return item;
  });
}

/** Minutes still to fill against the target (negative = over it). */
export const remainingMinutes = (targetMinutes: number, total: number): number =>
  targetMinutes - total;

/** Minutes into the session as the timeline labels them: 0 → "00:00", 10 → "10:00", 65 → "65:00", 90 → "90:00". */
export function formatOffset(minutes: number): string {
  return `${String(minutes).padStart(2, "0")}:00`;
}

// ---------------------------------------------------------------------------------------------------
// wall-clock time ⇄ instants
// ---------------------------------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

type Wall = { date: string; time: string; seconds: number; asUtcMs: number };

/** The local date/time in `timeZone` at an instant. */
function wallClock(instant: Date, timeZone: string): Wall {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const [y, mo, d, h, mi, s] = [
    Number(parts.year),
    Number(parts.month),
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  ] as [number, number, number, number, number, number];
  return {
    date: `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    time: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`,
    seconds: s,
    asUtcMs: Date.UTC(y, mo - 1, d, h, mi, s),
  };
}

/** How far `timeZone` is ahead of UTC at an instant, in minutes. */
const offsetMinutes = (instant: Date, timeZone: string): number =>
  Math.round(
    (wallClock(instant, timeZone).asUtcMs - Math.floor(instant.getTime() / 1000) * 1000) /
      MINUTE_MS,
  );

/**
 * The instant at which a zone's wall clock reads `date` `time`. Times that do not exist (the hour skipped
 * when clocks go forward) and times that happen twice (the hour repeated when they go back) resolve the way
 * PostgreSQL resolves them for `timestamp AT TIME ZONE zone`, so the view and this function agree — a test
 * checks it on both kinds of day.
 */
export function zonedInstant(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const wallMs = Date.UTC(y, mo - 1, d, h, mi);
  // Try the offset in force a day before AND after; whichever lands back on the requested wall time is a valid
  // reading. A repeated hour has two (the LATER one wins, as in PostgreSQL); a skipped hour has none, and then
  // the offset from before the change is used.
  const before = offsetMinutes(new Date(wallMs - 24 * 60 * MINUTE_MS), timeZone);
  const after = offsetMinutes(new Date(wallMs + 24 * 60 * MINUTE_MS), timeZone);
  const candidates = [before, after].map((off) => new Date(wallMs - off * MINUTE_MS));
  const valid = candidates.filter((c) => wallClock(c, timeZone).asUtcMs === wallMs);
  return valid.length > 0 ? new Date(Math.max(...valid.map((c) => c.getTime()))) : candidates[0]!;
}

export type Schedule = {
  startsAt: Date;
  endsAt: Date;
  /** Local end date and time, in the session's zone. */
  endDate: string;
  endTime: string;
  /** The session finishes on a later calendar day than it starts (a late training that runs past midnight). */
  endsNextDay: boolean;
};

/**
 * Start + total length → end, for a scheduled session (a date AND a start time). `null` when the session is
 * not scheduled to a time yet. The total is elapsed time, not wall-clock arithmetic.
 */
export function computeSchedule(input: {
  scheduledDate: string | null;
  startTime: string | null;
  timezone: string | null;
  totalMinutes: number;
}): Schedule | null {
  const { scheduledDate, startTime, timezone } = input;
  if (!scheduledDate || !startTime || !timezone) return null;
  const time = startTime.slice(0, 5); // the database hands back HH:MM:SS
  if (!isIsoDate(scheduledDate) || !isClockTime(time) || !isValidTimeZone(timezone)) return null;
  const startsAt = zonedInstant(scheduledDate, time, timezone);
  const endsAt = new Date(startsAt.getTime() + input.totalMinutes * MINUTE_MS);
  const end = wallClock(endsAt, timezone);
  return {
    startsAt,
    endsAt,
    endDate: end.date,
    endTime: end.time,
    endsNextDay: end.date !== scheduledDate,
  };
}
