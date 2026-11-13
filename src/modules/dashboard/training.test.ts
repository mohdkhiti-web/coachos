import { describe, expect, it } from "vitest";
import { summarizeTraining, trainingWindow, weekStart, type TrainingRow } from "./training";

const row = (date: string, minutes: number, extra: Partial<TrainingRow> = {}): TrainingRow => ({
  date,
  planId: `p-${date}`,
  phase: "skill",
  kind: "drill",
  minutes,
  categoryKey: "shooting",
  categoryName: "Shooting",
  ...extra,
});

// Thursday 12 November 2026 → this week runs Mon 9 – Sun 15 November
const TODAY = "2026-11-12";
const PRIORITIES = [
  { key: "shooting", name: "Shooting" },
  { key: "rebounding", name: "Rebounding" },
];

describe("training summary", () => {
  it("weeks start on Monday and the window runs six weeks back to the end of next week", () => {
    expect(weekStart(TODAY)).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday belongs to the week before it
    expect(trainingWindow(TODAY)).toEqual({ from: "2026-09-28", to: "2026-11-22" });
  });

  it("sums each week's minutes and sessions, tags past/current/next, and leaves breaks out", () => {
    const s = summarizeTraining(
      [
        row("2026-11-10", 20),
        row("2026-11-10", 15, { phase: "warm_up" }),
        row("2026-11-10", 5, { kind: "break", phase: null }),
        row("2026-11-17", 30),
        row("2026-10-20", 40),
      ],
      TODAY,
      PRIORITIES,
    );
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks.map((w) => w.when)).toEqual([
      "past",
      "past",
      "past",
      "past",
      "past",
      "past",
      "current",
      "next",
    ]);
    const current = s.weeks[6]!;
    expect(current).toMatchObject({
      start: "2026-11-09",
      end: "2026-11-15",
      minutes: 35,
      sessions: 1,
    });
    expect(current.phases).toEqual([
      { phase: "skill", minutes: 20 },
      { phase: "warm_up", minutes: 15 },
    ]);
    expect(s.weeks[7]!.minutes).toBe(30);
    expect(s.currentMinutes).toBe(35);
    // the four weeks before this one: 19 Oct (40), 26 Oct, 2 Nov … → 40 / 4
    expect(s.recentAverage).toBe(10);
    expect(s.scheduledSessions).toBe(3);
  });

  it("coverage counts this week and the three before, flags priorities, and names untrained ones", () => {
    const s = summarizeTraining(
      [
        row("2026-11-10", 20),
        row("2026-10-20", 25), // in coverage (week of 19 Oct)
        row("2026-10-12", 60), // before coverage
        row("2026-11-11", 10, { categoryKey: "passing", categoryName: "Passing" }),
        row("2026-11-11", 12, { categoryKey: null, categoryName: null, kind: "custom" }),
        row("2026-11-17", 50), // next week: charted, not coverage
      ],
      TODAY,
      PRIORITIES,
    );
    expect(s.coverageFrom).toBe("2026-10-19");
    expect(s.coverageTo).toBe("2026-11-15");
    expect(s.categories).toEqual([
      { key: "shooting", name: "Shooting", minutes: 45, priority: true },
      { key: null, name: null, minutes: 12, priority: false },
      { key: "passing", name: "Passing", minutes: 10, priority: false },
    ]);
    expect(s.untrained).toEqual([{ key: "rebounding", name: "Rebounding" }]);
  });

  it("an empty calendar is empty, not zero-filled into a fake average", () => {
    const s = summarizeTraining([], TODAY, PRIORITIES);
    expect(s.weeks.every((w) => w.minutes === 0 && w.sessions === 0)).toBe(true);
    expect(s.recentAverage).toBeNull();
    expect(s.categories).toEqual([]);
    expect(s.untrained).toEqual(PRIORITIES);
  });
});
