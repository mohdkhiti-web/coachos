import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import type { Result } from "@/lib/result";
import type { DiagramInput } from "@/engines/diagram";
import {
  addBreak,
  addCustomActivity,
  addDrillActivity,
  duplicateActivity,
  updateActivity,
} from "@/modules/plans/commands";
import { getPlan } from "@/modules/plans/queries";
import { toDocumentInput } from "@/modules/plans";
import {
  addBreakSchema,
  addCustomActivitySchema,
  addDrillActivitySchema,
  updateActivitySchema,
} from "@/modules/plans/validators";
import { createTestActor } from "./factories";
import { libraryDrill, makePlan } from "./plan-fixtures";

/**
 * A session activity's own diagrams (drawn in the session builder or proposed by the assistant) and the lock that keeps
 * the generator and the assistant away from an activity: stored in the session copy, validated against the court, and
 * never touching the library drill.
 */

const SPORT = "basketball";
let coach: Actor;
let outsider: Actor;

const good = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r.error)}`);
  return r.data;
};
const drawing = (over: Partial<DiagramInput> = {}): DiagramInput => ({
  schemaVersion: 1,
  sport: "basketball",
  court: { type: "half", variant: "fiba" },
  entities: [
    { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "top_key" } },
    { id: "o2", type: "player", side: "offense", label: "2", at: { anchor: "right_wing" } },
    { id: "b1", type: "ball", heldBy: "o1" },
  ],
  actions: [{ id: "a1", step: 1, type: "pass", from: "o1", to: "o2" }],
  annotations: [],
  ...over,
});
const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
const snapshotDiagrams = (a: { snapshot: unknown }) =>
  a.snapshot && typeof a.snapshot === "object" && "diagrams" in a.snapshot
    ? (a.snapshot.diagrams as Array<{ title: string }>)
    : [];

beforeAll(async () => {
  coach = await createTestActor("Diagram Coach");
  outsider = await createTestActor("Diagram Outsider");
});
afterAll(async () => {
  await pool.end();
});

async function sessionWithCustom() {
  const plan = await makePlan(coach, { title: "Diagram session" });
  const added = good(
    await addCustomActivity(
      coach,
      SPORT,
      plan.id,
      addCustomActivitySchema.parse({
        title: "Team shell",
        durationMin: 10,
        version: plan.version,
      }),
    ),
  );
  return { planId: plan.id, activityId: added.id, version: added.version };
}
const edit = (planId: string, activityId: string, version: number, over: Record<string, unknown>) =>
  updateActivity(
    coach,
    SPORT,
    planId,
    activityId,
    updateActivitySchema.parse({ version, ...over }),
  );

describe("diagrams on a custom activity", () => {
  it("stores a valid diagram and reads it back, in the builder data and in the printed document", async () => {
    const s = await sessionWithCustom();
    good(
      await edit(s.planId, s.activityId, s.version, {
        diagrams: [{ title: "Pass and cut", diagram: drawing() }],
      }),
    );
    const plan = (await getPlan(coach, SPORT, s.planId))!;
    const a = plan.activities[0]!;
    expect(a.snapshotValid).toBe(true);
    expect(snapshotDiagrams(a)).toHaveLength(1);
    expect(toDocumentInput(plan).activities[0]!.content!.diagrams).toEqual([
      expect.objectContaining({ title: "Pass and cut" }),
    ]);
  });

  it("refuses a diagram the court cannot hold, one with a broken pass, and one for another sport", async () => {
    const s = await sessionWithCustom();
    const offCourt = drawing({
      entities: [{ id: "o1", type: "player", side: "offense", at: { x: 40, y: 40 } }],
      actions: [],
    });
    const noBall = drawing({
      entities: [
        { id: "o1", type: "player", side: "offense", at: { anchor: "top_key" } },
        { id: "o2", type: "player", side: "offense", at: { anchor: "left_wing" } },
      ],
    });
    for (const bad of [offCourt, noBall]) {
      const r = await edit(s.planId, s.activityId, s.version, {
        diagrams: [{ title: "", diagram: bad }],
      });
      expect(codeOf(r)).toBe("VALIDATION");
    }
    const other = await edit(s.planId, s.activityId, s.version, {
      diagrams: [{ title: "", diagram: { ...drawing(), sport: "football" } }],
    });
    expect(codeOf(other)).toBe("VALIDATION");
  });

  it("allows at most five diagrams and can remove them all", async () => {
    const s = await sessionWithCustom();
    expect(() =>
      updateActivitySchema.parse({
        version: s.version,
        diagrams: Array.from({ length: 6 }, () => ({ title: "", diagram: drawing() })),
      }),
    ).toThrow();
    const saved = good(
      await edit(s.planId, s.activityId, s.version, {
        diagrams: [{ title: "x", diagram: drawing() }],
      }),
    );
    good(await edit(s.planId, s.activityId, saved.version, { diagrams: [] }));
    const a = (await getPlan(coach, SPORT, s.planId))!.activities[0]!;
    expect(snapshotDiagrams(a)).toEqual([]);
  });

  it("is not possible on a break", async () => {
    const plan = await makePlan(coach, { title: "Diagram break" });
    const b = good(
      await addBreak(
        coach,
        SPORT,
        plan.id,
        addBreakSchema.parse({ durationMin: 3, version: plan.version }),
      ),
    );
    const r = await edit(plan.id, b.id, b.version, {
      diagrams: [{ title: "", diagram: drawing() }],
    });
    expect(codeOf(r)).toBe("VALIDATION");
  });

  it("is kept when the activity is duplicated", async () => {
    const s = await sessionWithCustom();
    const saved = good(
      await edit(s.planId, s.activityId, s.version, {
        diagrams: [{ title: "x", diagram: drawing() }],
      }),
    );
    good(await duplicateActivity(coach, SPORT, s.planId, s.activityId, saved.version));
    const plan = (await getPlan(coach, SPORT, s.planId))!;
    expect(plan.activities).toHaveLength(2);
    for (const a of plan.activities) expect(snapshotDiagrams(a)).toHaveLength(1);
  });

  it("is refused for a session the actor cannot read", async () => {
    const s = await sessionWithCustom();
    const r = await updateActivity(
      outsider,
      SPORT,
      s.planId,
      s.activityId,
      updateActivitySchema.parse({
        version: s.version,
        diagrams: [{ title: "", diagram: drawing() }],
      }),
    );
    expect(codeOf(r)).toBe("NOT_FOUND");
  });
});

describe("diagrams on a drill activity", () => {
  it("replaces the session copy, marks the activity customized and leaves the library drill alone", async () => {
    const lib = await libraryDrill("give-and-go");
    const plan = await makePlan(coach, { title: "Drill diagram session" });
    const a = good(
      await addDrillActivity(
        coach,
        SPORT,
        plan.id,
        addDrillActivitySchema.parse({ drillId: lib.id, version: plan.version }),
      ),
    );
    const before = (await getPlan(coach, SPORT, plan.id))!.activities[0]!;
    expect(before.customized).toBe(false);
    const original = snapshotDiagrams(before).length;
    expect(original).toBeGreaterThan(0);

    good(
      await edit(plan.id, a.id, a.version, {
        diagrams: [{ title: "My version", diagram: drawing() }],
      }),
    );
    const after = (await getPlan(coach, SPORT, plan.id))!.activities[0]!;
    expect(after.customized).toBe(true);
    expect(snapshotDiagrams(after).map((d) => d.title)).toEqual(["My version"]);

    // the library copy is unchanged: a second session gets the original drawing
    const plan2 = await makePlan(coach, { title: "Second session" });
    good(
      await addDrillActivity(
        coach,
        SPORT,
        plan2.id,
        addDrillActivitySchema.parse({ drillId: lib.id, version: plan2.version }),
      ),
    );
    const fresh = (await getPlan(coach, SPORT, plan2.id))!.activities[0]!;
    expect(snapshotDiagrams(fresh)).toHaveLength(original);
  });
});

describe("locking an activity", () => {
  it("locks and unlocks, and a lock does not stop the coach making their own edits", async () => {
    const s = await sessionWithCustom();
    const locked = good(await edit(s.planId, s.activityId, s.version, { locked: true }));
    expect((await getPlan(coach, SPORT, s.planId))!.activities[0]!.locked).toBe(true);
    const renamed = good(
      await edit(s.planId, s.activityId, locked.version, { title: "Renamed by the coach" }),
    );
    good(await edit(s.planId, s.activityId, renamed.version, { locked: false }));
    const a = (await getPlan(coach, SPORT, s.planId))!.activities[0]!;
    expect(a).toMatchObject({ locked: false, title: "Renamed by the coach" });
  });

  it("starts unlocked, and a duplicate is not locked", async () => {
    const s = await sessionWithCustom();
    expect((await getPlan(coach, SPORT, s.planId))!.activities[0]!.locked).toBe(false);
    const locked = good(await edit(s.planId, s.activityId, s.version, { locked: true }));
    good(await duplicateActivity(coach, SPORT, s.planId, s.activityId, locked.version));
    const plan = (await getPlan(coach, SPORT, s.planId))!;
    expect(plan.activities.map((a) => a.locked)).toEqual([true, false]);
  });
});
