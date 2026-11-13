/**
 * Calendar dates as `YYYY-MM-DD` strings — the form scheduled sessions and dates of birth are stored in. Day arithmetic
 * runs in UTC on those strings, so no time zone can shift a date; only `todayIn` looks at the clock.
 */

const DAY = 86_400_000;
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

export function addDays(day: string, n: number): string {
  return new Date(toDate(day).getTime() + n * DAY).toISOString().slice(0, 10);
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const dow = (toDate(day).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

/** Weeks of history in the training window (before the current week). */
export const PAST_WEEKS = 6;

/** The eight-week training window: six weeks back, this week and next, Monday to Sunday. */
export function trainingWindow(today: string): { from: string; to: string } {
  const current = weekStart(today);
  return { from: addDays(current, -7 * PAST_WEEKS), to: addDays(current, 13) };
}

/** Today's date (YYYY-MM-DD) in the coach's own timezone. */
export function todayIn(timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone ?? "UTC" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  }
}
