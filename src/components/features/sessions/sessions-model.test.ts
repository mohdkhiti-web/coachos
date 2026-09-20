import { describe, expect, it } from "vitest";
import { applyEdit, moveTarget, summarize, type BuilderActivity } from "./builder-model";
import {
  emptySessionValues,
  fieldsFromServer,
  toPayload,
  validateSession,
  valuesKey,
  type SessionFormValues,
} from "./session-model";
import { planInputSchema } from "@/modules/plans/validators";

const act = (
  id: string,
  durationMin: number,
  over: Partial<BuilderActivity> = {},
): BuilderActivity => ({
  id,
  position: 0,
  kind: "custom",
  phase: null,
  title: id,
  durationMin,
  repetitions: null,
  players: null,
  notes: "",
  customized: false,
  changeReason: null,
  source: { drillId: null, status: "none" },
  format: null,
  intensity: null,
  category: null,
  diagram: null,
  custom: null,
  ...over,
});
const list = (...a: BuilderActivity[]) => a.map((x, position) => ({ ...x, position }));
const ids = (l: readonly BuilderActivity[]) => l.map((a) => a.id);

describe("builder edits are applied instantly, purely, and stay consistent with the server's rules", () => {
  const base = list(act("a", 10), act("b", 20), act("c", 30));

  it("moves an activity up or down and renumbers the positions", () => {
    const down = applyEdit(base, { type: "move", id: "a", delta: 1 });
    expect(ids(down)).toEqual(["b", "a", "c"]);
    expect(down.map((x) => x.position)).toEqual([0, 1, 2]);
    expect(ids(applyEdit(base, { type: "move", id: "c", delta: -1 }))).toEqual(["a", "c", "b"]);
  });

  it("does nothing at the ends of the list or for an unknown id, and never mutates its input", () => {
    const before = JSON.stringify(base);
    expect(ids(applyEdit(base, { type: "move", id: "a", delta: -1 }))).toEqual(["a", "b", "c"]);
    expect(ids(applyEdit(base, { type: "move", id: "c", delta: 1 }))).toEqual(["a", "b", "c"]);
    expect(ids(applyEdit(base, { type: "move", id: "zzz", delta: 1 }))).toEqual(["a", "b", "c"]);
    expect(JSON.stringify(base)).toBe(before);
    expect(moveTarget(base, "a", -1)).toBeNull();
    expect(moveTarget(base, "b", 1)).toBe(2);
  });

  it("reorders to an explicit order, ignoring an order that is not exactly the current activities", () => {
    expect(ids(applyEdit(base, { type: "reorder", orderedIds: ["c", "a", "b"] }))).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(ids(applyEdit(base, { type: "reorder", orderedIds: ["c", "a"] }))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(ids(applyEdit(base, { type: "reorder", orderedIds: ["c", "a", "x"] }))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("removes an activity and closes the gap", () => {
    const r = applyEdit(base, { type: "remove", id: "b" });
    expect(r.map((x) => [x.id, x.position])).toEqual([
      ["a", 0],
      ["c", 1],
    ]);
  });

  it("updates only the named activity, leaving the rest and the custom text alone unless given", () => {
    const withText = list(
      act("a", 10, { custom: { description: "d", instructions: [], coachingPoints: [] } }),
      act("b", 20),
    );
    const u = applyEdit(withText, {
      type: "update",
      id: "a",
      patch: { durationMin: 25, notes: "n" },
    });
    expect(u[0]).toMatchObject({ durationMin: 25, notes: "n", custom: { description: "d" } });
    expect(u[1]).toEqual(withText[1]);
    const c = applyEdit(withText, {
      type: "update",
      id: "a",
      patch: { custom: { description: "new", instructions: ["x"], coachingPoints: [] } },
    });
    expect(c[0]!.custom?.description).toBe("new");
  });

  it("the totals bar uses the SHARED calculation: offsets, total, remaining and end time follow every edit", () => {
    const plan = {
      targetMinutes: 60,
      scheduledDate: "2025-06-10",
      startTime: "18:00",
      timezone: "UTC",
    };
    const s = summarize(base, plan);
    expect(s.timeline.map((t) => [t.startMin, t.endMin])).toEqual([
      [0, 10],
      [10, 30],
      [30, 60],
    ]);
    expect([s.totalMinutes, s.remainingMinutes, s.schedule?.endTime]).toEqual([60, 0, "19:00"]);

    const moved = summarize(applyEdit(base, { type: "move", id: "c", delta: -1 }), plan);
    expect(moved.timeline.map((t) => t.id)).toEqual(["a", "c", "b"]);
    expect(moved.totalMinutes).toBe(60); // reordering never changes the total
    expect(moved.schedule?.endTime).toBe("19:00");

    const longer = summarize(
      applyEdit(base, { type: "update", id: "a", patch: { durationMin: 25 } }),
      plan,
    );
    expect([longer.totalMinutes, longer.remainingMinutes, longer.schedule?.endTime]).toEqual([
      75,
      -15,
      "19:15",
    ]);

    const shorter = summarize(applyEdit(base, { type: "remove", id: "c" }), plan);
    expect([shorter.totalMinutes, shorter.schedule?.endTime]).toEqual([30, "18:30"]);
  });

  it("has no end time until the session has a date, a start time and a zone", () => {
    expect(
      summarize(base, { targetMinutes: 60, scheduledDate: null, startTime: null, timezone: null })
        .schedule,
    ).toBeNull();
  });
});

describe("the session form: conversion and validation", () => {
  const defaults = {
    timezone: "Europe/Paris",
    coachName: "Sam Rivera",
    clubName: "",
    targetMinutes: 90,
  };
  const filled = (over: Partial<SessionFormValues> = {}): SessionFormValues => ({
    ...emptySessionValues(defaults),
    title: "Tuesday practice",
    primaryObjective: "shooting",
    ...over,
  });

  it("starts from sensible defaults: the sport's length, the coach's zone and name", () => {
    const v = emptySessionValues(defaults);
    expect(v).toMatchObject({
      title: "",
      targetMinutes: "90",
      timezone: "Europe/Paris",
      coachName: "Sam Rivera",
      visibility: "private",
      secondaryObjectives: [],
    });
  });

  it("produces a payload the server's own schema accepts, with typed numbers and clean defaults", () => {
    const payload = toPayload(
      filled({
        players: "14",
        sessionNumber: "12",
        scheduledDate: "2025-06-10",
        startTime: "18:30",
        ageGroup: "u14",
        secondaryObjectives: ["defense"],
      }),
      3,
    );
    const parsed = planInputSchema.parse(payload);
    expect(parsed).toMatchObject({
      players: 14,
      targetMinutes: 90,
      scheduledDate: "2025-06-10",
      startTime: "18:30",
      timezone: "Europe/Paris",
      version: 3,
      ageGroup: "u14",
    });
    expect(parsed.details).toMatchObject({ sessionNumber: 12, coachName: "Sam Rivera" });
    expect(parsed.secondaryObjectives).toEqual(["defense"]);
  });

  it("blank optional numbers become null, and text that is not a number is passed on so it is REJECTED, never guessed", () => {
    expect(toPayload(filled({ players: "", sessionNumber: "" })).players).toBeNull();
    expect((toPayload(filled({ players: "many" })) as { players: unknown }).players).toBe("many");
    expect(validateSession(filled({ players: "many" }))).toEqual({ players: ["number_invalid"] });
  });

  it("a valid session has no errors", () => {
    expect(validateSession(filled())).toEqual({});
  });

  it("catches the obvious mistakes before the server does — with the server's own message keys", () => {
    expect(validateSession(filled({ title: "   " }))).toEqual({ title: ["required"] });
    expect(validateSession(filled({ players: "0" }))).toEqual({ players: ["range_invalid"] });
    expect(validateSession(filled({ players: "61" }))).toEqual({ players: ["range_invalid"] });
    expect(validateSession(filled({ targetMinutes: "4" }))).toEqual({
      targetMinutes: ["range_invalid"],
    });
    expect(validateSession(filled({ targetMinutes: "481" }))).toEqual({
      targetMinutes: ["range_invalid"],
    });
    expect(validateSession(filled({ scheduledDate: "2025-02-30" }))).toEqual({
      scheduledDate: ["date_invalid"],
    });
    expect(validateSession(filled({ startTime: "18:30" }))).toEqual({
      scheduledDate: ["required"],
    }); // a time needs a date
    expect(validateSession(filled({ scheduledDate: "2025-06-10", startTime: "7pm" }))).toEqual({
      startTime: ["time_invalid"],
    });
    expect(validateSession(filled({ timezone: "Mars/Olympus" }))).toEqual({
      timezone: ["timezone_invalid"],
    });
    expect(validateSession(filled({ sessionNumber: "0" }))).toEqual({
      sessionNumber: ["range_invalid"],
    });
    expect(validateSession(filled({ location: "x".repeat(121) }))).toEqual({
      location: ["too_long"],
    });
    expect(validateSession(filled({ coachNotes: "x".repeat(3001) }))).toEqual({
      coachNotes: ["too_long"],
    });
  });

  it("a main objective can be required (when creating) and secondary ones need a main one", () => {
    expect(validateSession(filled({ primaryObjective: "" }), { requirePrimary: true })).toEqual({
      primaryObjective: ["required"],
    });
    expect(validateSession(filled({ primaryObjective: "" }))).toEqual({});
    expect(
      validateSession(filled({ primaryObjective: "", secondaryObjectives: ["defense"] })),
    ).toEqual({ primaryObjective: ["required"] });
    expect(validateSession(filled({ secondaryObjectives: ["shooting"] }))).toEqual({
      secondaryObjectives: ["skill_duplicate"],
    });
    expect(
      validateSession(filled({ secondaryObjectives: ["a_1", "a_2", "a_3", "a_4", "a_5"] })),
    ).toEqual({ secondaryObjectives: ["too_many"] });
  });

  it("maps the server's field paths back onto form fields", () => {
    expect(
      fieldsFromServer({
        "details.location": ["too_long"],
        title: ["required"],
        "secondaryObjectives.0": ["invalid"],
      }),
    ).toEqual({
      location: ["too_long"],
      title: ["required"],
      secondaryObjectives: ["invalid"],
    });
    expect(fieldsFromServer(undefined)).toEqual({});
  });

  it("the change key differs exactly when something the coach typed differs", () => {
    const a = filled();
    expect(valuesKey(a)).toBe(valuesKey({ ...a }));
    expect(valuesKey(a)).not.toBe(valuesKey({ ...a, teamName: "Wolves" }));
    expect(valuesKey(a)).not.toBe(valuesKey({ ...a, secondaryObjectives: ["defense"] }));
    expect(valuesKey(a)).not.toBe(valuesKey({ ...a, coachNotes: "x" }));
  });
});
