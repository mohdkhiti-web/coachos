import { describe, expect, it } from "vitest";
import { ageOn, squadProfile, teamPulse, type SessionLite } from "./insights";

const TODAY = "2026-11-12"; // Thursday; this week is 9–15 Nov
const s = (
  date: string | null,
  minutes: number,
  team: string | null = "U14 Girls",
): SessionLite => ({
  id: `s-${date}-${minutes}`,
  title: `Session ${date}`,
  teamName: team,
  scheduledDate: date,
  startTime: null,
  totalMinutes: minutes,
});

describe("ages", () => {
  it("counts whole years and only after the birthday", () => {
    expect(ageOn("2012-11-12", TODAY)).toBe(14);
    expect(ageOn("2012-11-13", TODAY)).toBe(13);
    expect(ageOn("2012-12-01", TODAY)).toBe(13);
    expect(ageOn("2012-01-01", TODAY)).toBe(14);
  });
});

describe("squad profile", () => {
  it("builds the age spread and median from players with a date of birth only", () => {
    const p = squadProfile(
      [
        { dateOfBirth: "2012-03-01", classification: null },
        { dateOfBirth: "2012-05-01", classification: 1.5 },
        { dateOfBirth: "2013-01-01", classification: 4.5 },
        { dateOfBirth: "2011-06-01", classification: 1.5 },
        { dateOfBirth: null, classification: null },
      ],
      TODAY,
    );
    expect(p.withAge).toBe(4);
    expect(p.ages).toEqual([
      { age: 13, count: 1 },
      { age: 14, count: 2 },
      { age: 15, count: 1 },
    ]);
    expect([p.minAge, p.maxAge, p.medianAge]).toEqual([13, 15, 14]);
    expect(p.classifications).toEqual([
      { points: 1.5, count: 2 },
      { points: 4.5, count: 1 },
    ]);
  });

  it("an empty squad has no ages, not zeros", () => {
    expect(squadProfile([], TODAY)).toMatchObject({ withAge: 0, minAge: null, medianAge: null });
  });
});

describe("team pulse", () => {
  it("matches sessions by team name (any case), sums the last 28 days, and finds next and last", () => {
    const p = teamPulse(
      "u14 girls ",
      [
        s("2026-11-10", 90),
        s("2026-10-20", 60),
        s("2026-10-10", 75), // older than 28 days
        s("2026-11-18", 80), // next week
        s("2026-11-11", 45, "U16 Boys"), // another team
        s(null, 30), // undated: not on the calendar
      ],
      TODAY,
    );
    expect(p.sessions28).toBe(2);
    expect(p.minutes28).toBe(150);
    expect(p.next?.scheduledDate).toBe("2026-11-18");
    expect(p.last?.scheduledDate).toBe("2026-11-10");
    expect(p.weeks).toHaveLength(8);
    expect(p.weeks[6]).toBe(90); // this week
    expect(p.weeks[7]).toBe(80); // next week
    expect(p.upcoming.map((x) => x.scheduledDate)).toEqual(["2026-11-18"]);
    expect(p.recent.map((x) => x.scheduledDate)).toEqual([
      "2026-11-10",
      "2026-10-20",
      "2026-10-10",
    ]);
  });

  it("today's session counts as next until the day is over", () => {
    const p = teamPulse("U14 Girls", [s(TODAY, 60), s("2026-11-01", 50)], TODAY);
    expect(p.next?.scheduledDate).toBe(TODAY);
    expect(p.last?.scheduledDate).toBe("2026-11-01");
  });
});
