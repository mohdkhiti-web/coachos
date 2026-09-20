/**
 * Display formatting for sessions — pure and locale-aware, and deliberately NOT arithmetic: every number
 * (totals, offsets, end time) comes from schedule.ts. These only turn already-calculated values into text.
 */

const clock = new Map<string, Intl.DateTimeFormat>();
const dates = new Map<string, Intl.DateTimeFormat>();

/** "19:30" (or "19:30:00") → "7:30 PM" (or "19:30" in a 24-hour locale). */
export function formatClockTime(time: string, locale: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  let f = clock.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
    clock.set(locale, f);
  }
  return f.format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

/** A calendar date with no time zone (`2025-06-10`) → "Tue, Jun 10, 2025". Never shifts a day: it is formatted as UTC. */
export function formatDateOnly(date: string, locale: string, withYear = true): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const key = `${locale}|${withYear}`;
  let f = dates.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
    dates.set(key, f);
  }
  return f.format(new Date(Date.UTC(y, mo - 1, d)));
}

/** An instant (when a session was last changed) → "Jun 10, 2025", in the viewer's own time zone. */
export function formatInstantDate(instant: Date, locale: string, timeZone: string): string {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat(locale, { timeZone });
  } catch {
    tz = "UTC";
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  }).format(instant);
}

/** Minutes → "1 h 30 min" style parts for a headline total: `{ hours: 1, minutes: 30 }`. */
export function splitMinutes(total: number): { hours: number; minutes: number } {
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
