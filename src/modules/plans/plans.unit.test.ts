import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "@/db/enums";
import type { DrillDetailDto } from "@/modules/drills";
import {
  emptyPlanDetails,
  migratePlanDetails,
  planDetailsSchema,
  PLAN_DETAILS_VERSION,
} from "./details";
import {
  buildTimeline,
  computeSchedule,
  formatOffset,
  isClockTime,
  isIsoDate,
  isValidTimeZone,
  remainingMinutes,
  totalMinutes,
  zonedInstant,
} from "./schedule";
import {
  buildDrillSnapshot,
  customSnapshotSchema,
  drillSnapshotSchema,
  parseSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
} from "./snapshot";
import {
  addBreakSchema,
  addCustomActivitySchema,
  addDrillActivitySchema,
  planInputSchema,
  reorderActivitiesSchema,
  updateActivitySchema,
} from "./validators";

const issues = (r: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
}) => (r.success ? [] : r.error!.issues.map((i) => `${i.path.map(String).join(".")}:${i.message}`));

// ---------------------------------------------------------------------------------------------------
describe("the timeline: totals and offsets are calculated, never stored", () => {
  const warmUp = [
    { title: "Warm-up", durationMin: 10 },
    { title: "Ball handling", durationMin: 10 },
    { title: "Shooting", durationMin: 15 },
    { title: "Finishing", durationMin: 15 },
    { title: "Defense", durationMin: 15 },
    { title: "3v3", durationMin: 15 },
    { title: "Cool-down", durationMin: 10 },
  ];

  it("builds the coach's example: 00:00–10:00 warm-up … 80:00–90:00 cool-down", () => {
    const t = buildTimeline(warmUp);
    expect(t.map((a) => [a.startMin, a.endMin])).toEqual([
      [0, 10],
      [10, 20],
      [20, 35],
      [35, 50],
      [50, 65],
      [65, 80],
      [80, 90],
    ]);
    expect(totalMinutes(warmUp)).toBe(90);
    expect(t.at(-1)?.title).toBe("Cool-down");
  });

  it("changing one duration moves everything after it, and the total follows", () => {
    const changed = warmUp.map((a) => (a.title === "Shooting" ? { ...a, durationMin: 25 } : a));
    const t = buildTimeline(changed);
    expect(t.find((a) => a.title === "Shooting")).toMatchObject({ startMin: 20, endMin: 45 });
    expect(t.find((a) => a.title === "Cool-down")).toMatchObject({ startMin: 90, endMin: 100 });
    expect(totalMinutes(changed)).toBe(100);
  });

  it("reordering changes the offsets, not the total", () => {
    const reordered = [warmUp[6]!, ...warmUp.slice(0, 6)];
    expect(buildTimeline(reordered)[0]).toMatchObject({
      title: "Cool-down",
      startMin: 0,
      endMin: 10,
    });
    expect(totalMinutes(reordered)).toBe(90);
  });

  it("an empty session has no length and no offsets", () => {
    expect(totalMinutes([])).toBe(0);
    expect(buildTimeline([])).toEqual([]);
  });

  it("does not modify its input", () => {
    const input = [{ durationMin: 5 }];
    buildTimeline(input);
    expect(input).toEqual([{ durationMin: 5 }]);
  });

  it("remaining time against the target (negative = over)", () => {
    expect(remainingMinutes(90, 75)).toBe(15);
    expect(remainingMinutes(90, 90)).toBe(0);
    expect(remainingMinutes(90, 100)).toBe(-10);
  });

  it("formats offsets as hh:mm", () => {
    expect(formatOffset(0)).toBe("00:00");
    expect(formatOffset(35)).toBe("00:35");
    expect(formatOffset(75)).toBe("01:15");
    expect(formatOffset(600)).toBe("10:00");
  });
});

// ---------------------------------------------------------------------------------------------------
describe("dates, times and zones", () => {
  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2025-03-09")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    for (const bad of [
      "2025-02-30",
      "2025-13-01",
      "2025-00-10",
      "25-03-09",
      "2025-3-9",
      "",
      "2025-03-09T10:00",
    ])
      expect(isIsoDate(bad), bad).toBe(false);
  });

  it("accepts only 24-hour HH:MM", () => {
    for (const ok of ["00:00", "07:05", "19:30", "23:59"]) expect(isClockTime(ok), ok).toBe(true);
    for (const bad of ["24:00", "7:05", "19:60", "19:3", "1930", "", "19:30:00"])
      expect(isClockTime(bad), bad).toBe(false);
  });

  it("knows real IANA zones and rejects nonsense", () => {
    for (const ok of [
      "UTC",
      "Europe/Paris",
      "America/New_York",
      "Asia/Kolkata",
      "Australia/Lord_Howe",
    ])
      expect(isValidTimeZone(ok), ok).toBe(true);
    for (const bad of ["", "Mars/Olympus", "Europe/Paris; drop table plans", "x".repeat(65)])
      expect(isValidTimeZone(bad), bad).toBe(false);
  });
});

describe("start time + total length = end time (computed, never stored)", () => {
  const at = (over: Partial<Parameters<typeof computeSchedule>[0]> = {}) =>
    computeSchedule({
      scheduledDate: "2025-06-10",
      startTime: "18:00",
      timezone: "Europe/Paris",
      totalMinutes: 90,
      ...over,
    });

  it("18:00 + 90 minutes ends at 19:30 the same day", () => {
    const s = at()!;
    expect(s.endTime).toBe("19:30");
    expect(s.endDate).toBe("2025-06-10");
    expect(s.endsNextDay).toBe(false);
    // Paris is UTC+2 in June
    expect(s.startsAt.toISOString()).toBe("2025-06-10T16:00:00.000Z");
    expect(s.endsAt.toISOString()).toBe("2025-06-10T17:30:00.000Z");
  });

  it("changing the total changes the end time — nothing else needs to be touched", () => {
    expect(at({ totalMinutes: 60 })!.endTime).toBe("19:00");
    expect(at({ totalMinutes: 135 })!.endTime).toBe("20:15");
    expect(at({ totalMinutes: 0 })!.endTime).toBe("18:00");
  });

  it("a late session that runs past midnight ends on the next day", () => {
    const s = at({ startTime: "23:00", totalMinutes: 90 })!;
    expect(s.endTime).toBe("00:30");
    expect(s.endDate).toBe("2025-06-11");
    expect(s.endsNextDay).toBe(true);
  });

  it("the same wall-clock start is a different instant in a different zone", () => {
    const paris = at()!.startsAt.getTime();
    const tokyo = at({ timezone: "Asia/Tokyo" })!.startsAt.getTime();
    const la = at({ timezone: "America/Los_Angeles" })!.startsAt.getTime();
    expect(paris - tokyo).toBe(7 * 60 * 60_000); // Tokyo (UTC+9) is 7 h ahead of Paris in June (UTC+2)
    expect(la - paris).toBe(9 * 60 * 60_000); // Los Angeles (UTC−7) is 9 h behind
    // …but the local end time reads the same in each: it is the coach's clock that matters
    expect(at({ timezone: "Asia/Tokyo" })!.endTime).toBe("19:30");
    expect(at({ timezone: "America/Los_Angeles" })!.endTime).toBe("19:30");
  });

  it("half-hour and quarter-hour zones work (India, Nepal)", () => {
    expect(at({ timezone: "Asia/Kolkata" })!.startsAt.toISOString()).toBe(
      "2025-06-10T12:30:00.000Z",
    );
    expect(at({ timezone: "Asia/Kathmandu" })!.startsAt.toISOString()).toBe(
      "2025-06-10T12:15:00.000Z",
    );
  });

  it("honours daylight saving during the session: elapsed time, not wall-clock arithmetic", () => {
    // Europe/Paris springs forward on 2025-03-30 at 02:00 → 03:00. A 90-minute session from 01:30 ends at
    // 04:00 on the wall clock (not 03:00), because one hour of the wall clock never happened.
    const spring = computeSchedule({
      scheduledDate: "2025-03-30",
      startTime: "01:30",
      timezone: "Europe/Paris",
      totalMinutes: 90,
    })!;
    expect(spring.endTime).toBe("04:00");
    // …and on the way back (2025-10-26, 03:00 → 02:00) the same session lasts an extra hour on the clock
    const autumn = computeSchedule({
      scheduledDate: "2025-10-26",
      startTime: "01:30",
      timezone: "Europe/Paris",
      totalMinutes: 90,
    })!;
    expect(autumn.endTime).toBe("02:00");
  });

  it("is null until the session has a date, a start time and a zone", () => {
    expect(at({ scheduledDate: null })).toBeNull();
    expect(at({ startTime: null })).toBeNull();
    expect(at({ timezone: null })).toBeNull();
    expect(at({ scheduledDate: "2025-02-30" })).toBeNull();
    expect(at({ startTime: "25:00" })).toBeNull();
    expect(at({ timezone: "Mars/Olympus" })).toBeNull();
  });

  it("accepts the HH:MM:SS the database hands back", () => {
    expect(at({ startTime: "18:00:00" })!.endTime).toBe("19:30");
  });

  it("zonedInstant round-trips ordinary times", () => {
    expect(zonedInstant("2025-01-15", "09:00", "UTC").toISOString()).toBe(
      "2025-01-15T09:00:00.000Z",
    );
    expect(zonedInstant("2025-01-15", "09:00", "America/New_York").toISOString()).toBe(
      "2025-01-15T14:00:00.000Z",
    );
  });
});

// ---------------------------------------------------------------------------------------------------
describe("session details (versioned JSON)", () => {
  it("has sensible defaults and a version", () => {
    expect(emptyPlanDetails()).toEqual({
      schemaVersion: PLAN_DETAILS_VERSION,
      location: "",
      season: "",
      sessionNumber: null,
      coachName: "",
      clubName: "",
      coachNotes: "",
    });
  });

  it("holds location, season, session number, coach, club and notes — and trims", () => {
    const d = planDetailsSchema.parse({
      location: "  Court 2 ",
      season: "2025–26",
      sessionNumber: 12,
      coachName: "Sam Rivera",
      clubName: "Riverside Academy",
      coachNotes: "Focus on transition defense.",
    });
    expect(d).toMatchObject({
      location: "Court 2",
      sessionNumber: 12,
      clubName: "Riverside Academy",
    });
  });

  it("rejects unknown keys, bad numbers and oversized text", () => {
    expect(planDetailsSchema.safeParse({ colour: "red" }).success).toBe(false);
    expect(planDetailsSchema.safeParse({ sessionNumber: 0 }).success).toBe(false);
    expect(planDetailsSchema.safeParse({ sessionNumber: 1.5 }).success).toBe(false);
    expect(planDetailsSchema.safeParse({ location: "x".repeat(121) }).success).toBe(false);
    expect(planDetailsSchema.safeParse({ coachNotes: "x".repeat(3001) }).success).toBe(false);
  });

  it("migratePlanDetails reads the current version and refuses a version it does not know", () => {
    expect(migratePlanDetails({ schemaVersion: 1, location: "Gym" })?.location).toBe("Gym");
    expect(migratePlanDetails({ schemaVersion: 2, location: "Gym" })).toBeNull();
    expect(migratePlanDetails({ location: "Gym" })).toBeNull();
    expect(migratePlanDetails("nope")).toBeNull();
    expect(migratePlanDetails(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
describe("input validation", () => {
  const base = { title: "Tuesday practice" };

  it("a session needs only a title; everything else has a default", () => {
    const p = planInputSchema.parse(base);
    expect(p).toMatchObject({
      title: "Tuesday practice",
      teamName: "",
      ageGroup: "",
      ageMin: null,
      players: null,
      scheduledDate: "",
      startTime: "",
      visibility: "private",
      secondaryObjectives: [],
    });
    expect(p.targetMinutes).toBeUndefined(); // the command applies the sport's default
    expect(p.details.schemaVersion).toBe(1);
  });

  it("checks the title, the ages, the players and the target", () => {
    expect(issues(planInputSchema.safeParse({ title: "  " }))).toContain("title:required");
    expect(issues(planInputSchema.safeParse({ title: "x".repeat(121) }))).toContain(
      "title:too_long",
    );
    expect(issues(planInputSchema.safeParse({ ...base, players: 0 }))).toContain(
      "players:range_invalid",
    );
    expect(issues(planInputSchema.safeParse({ ...base, players: 61 }))).toContain(
      "players:range_invalid",
    );
    expect(issues(planInputSchema.safeParse({ ...base, targetMinutes: 4 }))).toContain(
      "targetMinutes:range_invalid",
    );
    expect(
      issues(
        planInputSchema.safeParse({ ...base, targetMinutes: PLAN_LIMITS.maxTargetMinutes + 1 }),
      ),
    ).toContain("targetMinutes:range_invalid");
    expect(issues(planInputSchema.safeParse({ ...base, level: "expert" })).length).toBeGreaterThan(
      0,
    );
  });

  it("ages come as a pair, in order", () => {
    expect(issues(planInputSchema.safeParse({ ...base, ageMin: 10 }))).toContain("ageMax:required");
    expect(issues(planInputSchema.safeParse({ ...base, ageMax: 10 }))).toContain("ageMin:required");
    expect(issues(planInputSchema.safeParse({ ...base, ageMin: 14, ageMax: 10 }))).toContain(
      "ageMax:range_order",
    );
    expect(planInputSchema.safeParse({ ...base, ageMin: 10, ageMax: 12 }).success).toBe(true);
  });

  it("the schedule: real date, HH:MM time, a zone — and a time needs a date", () => {
    expect(
      planInputSchema.safeParse({
        ...base,
        scheduledDate: "2025-06-10",
        startTime: "18:00",
        timezone: "Europe/Paris",
      }).success,
    ).toBe(true);
    expect(issues(planInputSchema.safeParse({ ...base, scheduledDate: "2025-02-30" }))).toContain(
      "scheduledDate:date_invalid",
    );
    expect(
      issues(planInputSchema.safeParse({ ...base, startTime: "7pm", scheduledDate: "2025-06-10" })),
    ).toContain("startTime:time_invalid");
    expect(issues(planInputSchema.safeParse({ ...base, timezone: "Mars/Olympus" }))).toContain(
      "timezone:timezone_invalid",
    );
    expect(issues(planInputSchema.safeParse({ ...base, startTime: "18:00" }))).toContain(
      "scheduledDate:required",
    );
  });

  it("there is no end time field: it cannot even be submitted", () => {
    expect(planInputSchema.safeParse({ ...base, endTime: "19:30" }).success).toBe(false);
    expect(planInputSchema.safeParse({ ...base, totalMinutes: 90 }).success).toBe(false);
    expect(planInputSchema.safeParse({ ...base, durationMinutes: 90 }).success).toBe(false);
  });

  it("objectives: one primary and up to four secondary, each skill once", () => {
    const ok = planInputSchema.safeParse({
      ...base,
      primaryObjective: "shooting",
      secondaryObjectives: ["decision_making", "transition"],
    });
    expect(ok.success).toBe(true);
    expect(
      issues(
        planInputSchema.safeParse({
          ...base,
          primaryObjective: "shooting",
          secondaryObjectives: ["shooting"],
        }),
      ),
    ).toContain("secondaryObjectives:skill_duplicate");
    expect(
      issues(
        planInputSchema.safeParse({
          ...base,
          primaryObjective: "shooting",
          secondaryObjectives: ["passing", "passing"],
        }),
      ),
    ).toContain("secondaryObjectives:skill_duplicate");
    expect(
      issues(planInputSchema.safeParse({ ...base, secondaryObjectives: ["passing"] })),
    ).toContain("primaryObjective:required");
    expect(
      issues(
        planInputSchema.safeParse({
          ...base,
          primaryObjective: "shooting",
          secondaryObjectives: ["a1", "a2", "a3", "a4", "a5"].map((k) => `skill_${k}`),
        }),
      ),
    ).toContain("secondaryObjectives:too_many");
  });

  it("visibility is private or workspace — never public", () => {
    expect(planInputSchema.safeParse({ ...base, visibility: "organization" }).success).toBe(true);
    expect(planInputSchema.safeParse({ ...base, visibility: "public" }).success).toBe(false);
  });
});

describe("activity input validation", () => {
  const version = 1;
  const drillId = "0192a000-0000-7000-8000-0000000000d1";

  it("a duration is a whole number of minutes, never zero or negative", () => {
    for (const bad of [0, -5, 1.5, 241])
      expect(
        addCustomActivitySchema.safeParse({ title: "Talk", durationMin: bad, version }).success,
        String(bad),
      ).toBe(false);
    for (const good of [1, 10, 240])
      expect(
        addCustomActivitySchema.safeParse({ title: "Talk", durationMin: good, version }).success,
      ).toBe(true);
    expect(addBreakSchema.safeParse({ durationMin: 0, version }).success).toBe(false);
    expect(addDrillActivitySchema.safeParse({ drillId, durationMin: -1, version }).success).toBe(
      false,
    );
    expect(updateActivitySchema.safeParse({ durationMin: 0, version }).success).toBe(false);
  });

  it("a drill activity needs only the drill; duration, phase and players are the coach's to choose", () => {
    const a = addDrillActivitySchema.parse({ drillId, version });
    expect(a.durationMin).toBeUndefined();
    expect(a.phase).toBeUndefined();
    expect(a.players).toBeNull();
    expect(a.repetitions).toBeNull();
    expect(addDrillActivitySchema.safeParse({ drillId: "not-a-uuid", version }).success).toBe(
      false,
    );
  });

  it("phases come from the shared list; repetitions and players are bounded", () => {
    expect(
      addCustomActivitySchema.safeParse({
        title: "x",
        durationMin: 5,
        phase: "small_sided",
        version,
      }).success,
    ).toBe(true);
    expect(
      addCustomActivitySchema.safeParse({ title: "x", durationMin: 5, phase: "halftime", version })
        .success,
    ).toBe(false);
    expect(
      addCustomActivitySchema.safeParse({ title: "x", durationMin: 5, repetitions: 0, version })
        .success,
    ).toBe(false);
    expect(
      addCustomActivitySchema.safeParse({ title: "x", durationMin: 5, players: 61, version })
        .success,
    ).toBe(false);
  });

  it("a break defaults to the title Break and carries no content or phase", () => {
    expect(addBreakSchema.parse({ durationMin: 5, version }).title).toBe("Break");
    expect(addBreakSchema.safeParse({ durationMin: 5, version, phase: "warm_up" }).success).toBe(
      false,
    );
  });

  it("every edit carries the version it was based on", () => {
    expect(addBreakSchema.safeParse({ durationMin: 5 }).success).toBe(false);
    expect(reorderActivitiesSchema.safeParse({ orderedIds: [] }).success).toBe(false);
    expect(reorderActivitiesSchema.safeParse({ orderedIds: [drillId], version }).success).toBe(
      true,
    );
  });

  it("reordering rejects malformed ids", () => {
    expect(reorderActivitiesSchema.safeParse({ orderedIds: ["x"], version }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("drill snapshot: complete, validated and version-aware", () => {
  const drill = {
    id: "0192a000-0000-7000-8000-0000000000d1",
    sportKey: "basketball",
    title: "3v3 Closeout Game",
    description:
      "Play 3v3 where every possession starts with a closeout, to train recovering and containing.",
    category: { key: "small_sided_games", name: "Small-Sided Games" },
    primarySkill: { key: "closeouts", name: "Closeouts" },
    level: "intermediate",
    ageMin: 11,
    ageMax: 16,
    playersMin: 6,
    playersMax: 12,
    durationMin: 8,
    durationMax: 14,
    space: "half_court",
    intensity: "high",
    format: "3v3",
    scope: "library",
    isFavorite: false,
    updatedAt: new Date(),
    content: {
      schemaVersion: 1,
      objective: "Close out under control.",
      setup: "Three teams of three on a half court.",
      organization: "Teams rotate on the whistle.",
      instructions: ["Coach passes to the wing.", "Defender closes out."],
      coachingPoints: ["Short choppy steps at the end."],
      commonMistakes: ["Flying by the shooter."],
      safety: "Give the shooter room to land.",
      progressions: ["Add a help defender."],
      regressions: ["Walk the closeout."],
      variations: ["Play to five."],
      resources: [
        { title: "Closeout basics", url: "https://example.com/closeouts", kind: "article" },
      ],
    },
    phases: ["small_sided", "game"],
    tags: ["defense"],
    skills: [
      { key: "closeouts", name: "Closeouts", role: "primary" },
      { key: "help_defense", name: "Help defense", role: "secondary" },
      { key: "rotations", name: "Defensive rotations", role: "sub" },
    ],
    equipment: [{ key: "basketball", name: "Basketballs", rule: "fixed", quantity: 2 }],
    diagrams: [],
    source: { kind: "original", name: null, url: null },
    visibility: "public",
    status: "published",
    version: 4,
    forkedFromId: null,
    createdAt: new Date(),
    permissions: { canEdit: false, canArchive: false, canDuplicate: true },
  } as unknown as DrillDetailDto;
  const now = new Date("2025-06-10T10:00:00.000Z");

  it("copies everything a session document needs", () => {
    const s = buildDrillSnapshot(drill, now);
    expect(s).toMatchObject({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      title: "3v3 Closeout Game",
      description: drill.description,
      category: { key: "small_sided_games", name: "Small-Sided Games" },
      skills: {
        primary: { key: "closeouts", name: "Closeouts" },
        secondary: [{ key: "help_defense", name: "Help defense" }],
        sub: [{ key: "rotations", name: "Defensive rotations" }],
      },
      level: "intermediate",
      age: { min: 11, max: 16 },
      players: { min: 6, max: 12 },
      duration: { min: 8, max: 14 },
      space: "half_court",
      intensity: "high",
      format: "3v3",
      phases: ["small_sided", "game"],
      equipment: [{ key: "basketball", name: "Basketballs", rule: "fixed", quantity: 2 }],
      diagrams: [],
    });
    expect(s.content).toMatchObject({
      objective: "Close out under control.",
      setup: "Three teams of three on a half court.",
      organization: "Teams rotate on the whistle.",
      instructions: ["Coach passes to the wing.", "Defender closes out."],
      coachingPoints: ["Short choppy steps at the end."],
      commonMistakes: ["Flying by the shooter."],
      safety: "Give the shooter room to land.",
      progressions: ["Add a help defender."],
      regressions: ["Walk the closeout."],
      variations: ["Play to five."],
      resources: [
        { title: "Closeout basics", url: "https://example.com/closeouts", kind: "article" },
      ],
    });
  });

  it("records where and when it came from", () => {
    expect(buildDrillSnapshot(drill, now).provenance).toEqual({
      drillId: drill.id,
      drillVersion: 4,
      capturedAt: "2025-06-10T10:00:00.000Z",
      scope: "library",
      sourceKind: "original",
      sourceName: null,
      sourceUrl: null,
    });
  });

  it("is a COPY: editing the source object afterwards does not touch it", () => {
    const s = buildDrillSnapshot(drill, now);
    const before = JSON.stringify(s);
    (drill as { title: string }).title = "Renamed";
    drill.content.instructions.push("A new step.");
    expect(JSON.stringify(s)).toBe(before);
    (drill as { title: string }).title = "3v3 Closeout Game";
    drill.content.instructions.pop();
  });

  it("round-trips through JSON and through parseSnapshot", () => {
    const s = buildDrillSnapshot(drill, now);
    const back = parseSnapshot("drill", JSON.parse(JSON.stringify(s)));
    expect(back).toEqual({ ok: true, data: s });
  });

  it("rejects a snapshot from a version this code does not know, and any tampered shape", () => {
    const s = JSON.parse(JSON.stringify(buildDrillSnapshot(drill, now)));
    expect(parseSnapshot("drill", { ...s, schemaVersion: 2 })).toEqual({ ok: false });
    expect(parseSnapshot("drill", { ...s, extra: true })).toEqual({ ok: false });
    expect(parseSnapshot("drill", { ...s, level: "expert" })).toEqual({ ok: false });
    expect(parseSnapshot("drill", { ...s, provenance: undefined })).toEqual({ ok: false });
    expect(
      parseSnapshot("drill", { ...s, provenance: { ...s.provenance, drillId: "nope" } }),
    ).toEqual({ ok: false });
    expect(parseSnapshot("drill", null)).toEqual({ ok: false });
    expect(drillSnapshotSchema.safeParse({}).success).toBe(false);
  });

  it("a break has no snapshot; a custom activity has a small, versioned one", () => {
    expect(parseSnapshot("break", null)).toEqual({ ok: true, data: null });
    expect(parseSnapshot("break", { schemaVersion: 1 })).toEqual({ ok: false });
    const custom = customSnapshotSchema.parse({ schemaVersion: 1, description: "Team talk" });
    expect(parseSnapshot("custom", custom)).toEqual({ ok: true, data: custom });
    expect(parseSnapshot("custom", { schemaVersion: 3 })).toEqual({ ok: false });
  });
});
