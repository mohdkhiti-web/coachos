import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditEvents, planActivities } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import { createDrill, updateDrill } from "@/modules/drills/commands";
import { getDrill } from "@/modules/drills/queries";
import {
  addBreak,
  addCustomActivity,
  addDrillActivity,
  deletePlan,
  duplicateActivity,
  duplicatePlan,
  removeActivity,
  setPlanStatus,
  updateActivity,
} from "@/modules/plans/commands";
import { getPlan, listPlans, listPlanTeams } from "@/modules/plans/queries";
import {
  addBreakSchema,
  addCustomActivitySchema,
  addDrillActivitySchema,
  updateActivitySchema,
} from "@/modules/plans/validators";
import { createTestActor } from "./factories";
import { createClub, drillInput } from "./drill-fixtures";
import { libraryDrill, makePlan } from "./plan-fixtures";

/**
 * Duplicating sessions and activities, and the filters behind "My Sessions" — through the real commands and
 * queries, with real permissions and a real database.
 */

const SPORT = "basketball";
let owner: Actor;
let admin: Actor;
let coach: Actor;
let teacher: Actor;
let assistant: Actor;
let outsider: Actor;
let library: { id: string; version: number };

function good<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r.error)}`);
  return r.data;
}
const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
const load = (a: Actor, id: string) => getPlan(a, SPORT, id);
const custom = (a: Actor, planId: string, version: number, over = {}) =>
  addCustomActivity(
    a,
    SPORT,
    planId,
    addCustomActivitySchema.parse({ title: "Team talk", durationMin: 5, version, ...over }),
  );
const drillAct = (a: Actor, planId: string, drillId: string, version: number, over = {}) =>
  addDrillActivity(a, SPORT, planId, addDrillActivitySchema.parse({ drillId, version, ...over }));

beforeAll(async () => {
  library = await libraryDrill();
  const founder = await createTestActor("Club Founder");
  const club = await createClub(founder, [
    { role: "admin", name: "Eve Admin" },
    { role: "coach", name: "Bob Coach" },
    { role: "teacher", name: "Dan Teacher" },
    { role: "assistant", name: "Cara Assistant" },
  ]);
  owner = club.ownerActor;
  [admin, coach, teacher, assistant] = club.members as [Actor, Actor, Actor, Actor];
  outsider = await createTestActor("Otto Outsider");
});

afterAll(async () => {
  await pool.end();
});

/** A session with everything filled in and a small timeline, built the normal way. */
async function richSession(a: Actor, over: Record<string, unknown> = {}) {
  const created = await makePlan(a, {
    title: "U16 Tuesday Shooting Session",
    teamName: "U16 Boys",
    ageGroup: "u16",
    level: "advanced",
    players: 14,
    targetMinutes: 75,
    objective: "Shoot with confidence under pressure.",
    scheduledDate: "2025-06-10",
    startTime: "18:30",
    timezone: "Europe/Paris",
    primaryObjective: "shooting",
    secondaryObjectives: ["defense", "transition"],
    details: {
      location: "Court 2",
      season: "2025–26",
      sessionNumber: 12,
      coachName: "Bob Coach",
      clubName: "Riverside Academy",
      coachNotes: "Bring bibs.",
    },
    visibility: "organization",
    ...over,
  });
  let v = created.version;
  v = good(
    await drillAct(a, created.id, library.id, v, { durationMin: 12, notes: "Both hands." }),
  ).version;
  v = good(
    await custom(a, created.id, v, {
      title: "Film",
      durationMin: 8,
      content: { description: "Watch the clip." },
    }),
  ).version;
  good(
    await addBreak(
      a,
      SPORT,
      created.id,
      addBreakSchema.parse({ title: "Water", durationMin: 2, version: v }),
    ),
  );
  return created.id;
}

// ---------------------------------------------------------------------------------------------------
describe("duplicating a session", () => {
  it("makes a new private draft, 'Copy of …', with the same information, objectives and timeline", async () => {
    const id = await richSession(coach);
    const copy = good(await duplicatePlan(coach, SPORT, id));
    expect(copy.id).not.toBe(id);
    expect(copy.version).toBe(1);

    const a = (await load(coach, id))!;
    const b = (await load(coach, copy.id))!;
    expect(b).toMatchObject({
      title: "Copy of U16 Tuesday Shooting Session",
      status: "draft",
      visibility: "private", // a copy starts private, even when the original is shared
      teamName: "U16 Boys",
      ageGroup: { key: "u16", name: "U16" },
      ageMin: a.ageMin,
      ageMax: a.ageMax,
      level: "advanced",
      players: 14,
      objective: "Shoot with confidence under pressure.",
      forkedFromId: id,
      isMine: true,
      deletedAt: null,
      objectives: a.objectives,
      totals: { totalMinutes: 22, activityCount: 3, targetMinutes: 75 },
    });
    expect(b.details).toEqual({ ...a.details, sessionNumber: null }); // the number belongs to the original session
    expect(b.details.location).toBe("Court 2");
    // a copy is for another day: the date and start time are cleared, the zone is kept
    expect([b.scheduledDate, b.startTime, b.schedule, b.timezone]).toEqual([
      null,
      null,
      null,
      "Europe/Paris",
    ]);
    // the timeline is the same, in the same order, with the same numbers
    expect(
      b.activities.map((x) => [
        x.position,
        x.kind,
        x.title,
        x.durationMin,
        x.notes,
        x.startMin,
        x.endMin,
      ]),
    ).toEqual(
      a.activities.map((x) => [
        x.position,
        x.kind,
        x.title,
        x.durationMin,
        x.notes,
        x.startMin,
        x.endMin,
      ]),
    );
  });

  it("every activity is an independent record with its own copy of the snapshot", async () => {
    const id = await richSession(coach);
    const copy = good(await duplicatePlan(coach, SPORT, id));
    const a = (await load(coach, id))!;
    const b = (await load(coach, copy.id))!;
    expect(new Set([...a.activities, ...b.activities].map((x) => x.id)).size).toBe(6); // six different rows
    expect(JSON.stringify(b.activities[0]!.snapshot)).toBe(
      JSON.stringify(a.activities[0]!.snapshot),
    );

    // edit and delete in the copy: the original does not move
    let v = b.version;
    v = good(
      await updateActivity(
        coach,
        SPORT,
        copy.id,
        b.activities[0]!.id,
        updateActivitySchema.parse({
          version: v,
          durationMin: 30,
          notes: "Changed in the copy",
          content: { setup: "Only in the copy." },
        }),
      ),
    ).version;
    good(await removeActivity(coach, SPORT, copy.id, b.activities[1]!.id, v));
    const a2 = (await load(coach, id))!;
    expect(a2.activities).toHaveLength(3);
    expect(a2.activities[0]).toMatchObject({
      durationMin: 12,
      notes: "Both hands.",
      customized: false,
    });
    expect((a2.activities[0]!.snapshot as { content: { setup: string } }).content.setup).not.toBe(
      "Only in the copy.",
    );
    expect(a2.version).toBe(a.version);
    // and the copy really did change
    const b2 = (await load(coach, copy.id))!;
    expect(b2.activities).toHaveLength(2);
    expect(b2.activities[0]).toMatchObject({ durationMin: 30, customized: true });
  });

  it("keeps each activity's customized flag, reason and drill lineage", async () => {
    const created = await makePlan(coach);
    const v = good(await drillAct(coach, created.id, library.id, created.version)).version;
    const a = (await load(coach, created.id))!.activities[0]!;
    good(
      await updateActivity(
        coach,
        SPORT,
        created.id,
        a.id,
        updateActivitySchema.parse({
          version: v,
          content: { setup: "Custom setup." },
          changeReason: "Small gym",
        }),
      ),
    );
    const copy = good(await duplicatePlan(coach, SPORT, created.id));
    const b = (await load(coach, copy.id))!.activities[0]!;
    expect(b).toMatchObject({
      customized: true,
      changeReason: "Small gym",
      source: { drillId: library.id, drillVersion: library.version },
    });
  });

  it("can be repeated (a copy of a copy), and long titles are cut to fit", async () => {
    const created = await makePlan(coach, { title: "T".repeat(120) });
    const one = good(await duplicatePlan(coach, SPORT, created.id));
    expect((await load(coach, one.id))!.title).toBe(`Copy of ${"T".repeat(120)}`.slice(0, 120));
    const two = good(await duplicatePlan(coach, SPORT, one.id));
    expect((await load(coach, two.id))!.forkedFromId).toBe(one.id);
  });

  it("an empty session duplicates too", async () => {
    const created = await makePlan(coach, { title: "Empty one" });
    const copy = good(await duplicatePlan(coach, SPORT, created.id));
    expect((await load(coach, copy.id))!.activities).toEqual([]);
  });

  it("archived sessions can be duplicated (the copy is a draft); deleted ones are gone", async () => {
    const created = await makePlan(coach);
    good(await setPlanStatus(coach, SPORT, created.id, "archived", created.version));
    const copy = good(await duplicatePlan(coach, SPORT, created.id));
    expect((await load(coach, copy.id))!.status).toBe("draft");
    good(await deletePlan(coach, SPORT, created.id));
    expect(codeOf(await duplicatePlan(coach, SPORT, created.id))).toBe("NOT_FOUND");
  });

  it("a colleague can copy a shared session into their own workspace; the copy is theirs alone", async () => {
    const id = await richSession(coach);
    const copy = good(await duplicatePlan(admin, SPORT, id));
    const b = (await load(admin, copy.id))!;
    expect(b).toMatchObject({
      isMine: true,
      visibility: "private",
      permissions: { canEdit: true },
    });
    expect(await load(coach, copy.id)).toBeNull(); // Bob cannot see Eve's private copy
    expect(await load(teacher, copy.id)).toBeNull();
  });

  it("who may: authors who can read it. Not a colleague's private session, not an assistant, not another workspace", async () => {
    const shared = await richSession(coach);
    const priv = await makePlan(coach, { visibility: "private" });
    expect(codeOf(await duplicatePlan(teacher, SPORT, shared))).toBe("OK");
    expect(codeOf(await duplicatePlan(assistant, SPORT, shared))).toBe("FORBIDDEN");
    expect(codeOf(await duplicatePlan(owner, SPORT, priv.id))).toBe("NOT_FOUND");
    expect(codeOf(await duplicatePlan(outsider, SPORT, shared))).toBe("NOT_FOUND");
    expect(codeOf(await duplicatePlan(coach, "hockey", shared))).toBe("NOT_FOUND");
    expect(codeOf(await duplicatePlan(coach, SPORT, "not-a-uuid"))).toBe("NOT_FOUND");
  });

  it("copying a colleague's session keeps every snapshot, and cuts the link to a drill the copier cannot read", async () => {
    const secret = good(
      await createDrill(
        coach,
        SPORT,
        drillInput({ title: "Bob Secret Drill", visibility: "organization" }),
      ),
    );
    const created = await makePlan(coach, { visibility: "organization" });
    good(await drillAct(coach, created.id, secret.id, created.version));
    // Bob takes the drill back to private: Eve can still read the session, but not the drill
    const d = (await getDrill(coach, SPORT, secret.id))!;
    good(
      await updateDrill(coach, SPORT, secret.id, {
        ...drillInput({ title: d.title, visibility: "private" }),
        version: d.version,
      }),
    );
    expect(await getDrill(admin, SPORT, secret.id)).toBeNull();

    const copy = good(await duplicatePlan(admin, SPORT, created.id));
    const a = (await load(admin, copy.id))!.activities[0]!;
    expect(a).toMatchObject({
      kind: "drill",
      snapshotValid: true,
      source: { drillId: null, status: "unavailable" },
    });
    expect((a.snapshot as { title: string }).title).toBe("Bob Secret Drill");
  });

  it("records an audit event naming the original", async () => {
    const created = await makePlan(coach);
    const copy = good(await duplicatePlan(coach, SPORT, created.id));
    const events = await tenantTx(coach, (tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.entityId, copy.id), eq(auditEvents.action, "plan.duplicated"))),
    );
    expect(events).toHaveLength(1);
    expect((events[0]!.metadata as { from: string }).from).toBe(created.id);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("duplicating an activity", () => {
  it("adds an independent copy right after the original and moves the rest down", async () => {
    const id = await richSession(coach);
    const before = (await load(coach, id))!;
    const drill = before.activities[0]!;
    const r = good(await duplicateActivity(coach, SPORT, id, drill.id, before.version));
    const after = (await load(coach, id))!;
    expect(after.activities.map((a) => a.title)).toEqual([
      drill.title,
      drill.title,
      "Film",
      "Water",
    ]);
    expect(after.activities.map((a) => a.position)).toEqual([0, 1, 2, 3]);
    expect(after.activities[1]!.id).toBe(r.id);
    expect(after.totals.totalMinutes).toBe(before.totals.totalMinutes + drill.durationMin);
    expect(after.version).toBe(before.version + 1);
    // independent snapshots
    good(
      await updateActivity(
        coach,
        SPORT,
        id,
        r.id,
        updateActivitySchema.parse({
          version: after.version,
          content: { setup: "Only the copy." },
        }),
      ),
    );
    const final = (await load(coach, id))!;
    expect(final.activities[1]).toMatchObject({ customized: true });
    expect(final.activities[0]).toMatchObject({ customized: false });
  });

  it("copies breaks and custom activities, and keeps the source link of a drill", async () => {
    const id = await richSession(coach);
    let cur = (await load(coach, id))!;
    for (const a of [cur.activities[1]!, cur.activities[2]!]) {
      good(await duplicateActivity(coach, SPORT, id, a.id, cur.version));
      cur = (await load(coach, id))!;
    }
    expect(cur.activities.map((a) => a.kind)).toEqual([
      "drill",
      "custom",
      "custom",
      "break",
      "break",
    ]);
    const drill = (await load(coach, id))!;
    good(await duplicateActivity(coach, SPORT, id, drill.activities[0]!.id, drill.version));
    expect((await load(coach, id))!.activities[1]!.source.drillId).toBe(library.id);
  });

  it("respects the session limits and the rules for editing", async () => {
    const created = await makePlan(coach, { visibility: "organization" });
    let v = created.version;
    for (let i = 0; i < 3; i++)
      v = good(await custom(coach, created.id, v, { durationMin: 240 })).version;
    const a = (await load(coach, created.id))!.activities[0]!;
    // 720 minutes already: a fourth 240 would exceed the cap
    expect(await duplicateActivity(coach, SPORT, created.id, a.id, v)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect((await load(coach, created.id))!.version).toBe(v);
    expect(codeOf(await duplicateActivity(teacher, SPORT, created.id, a.id, v))).toBe("FORBIDDEN");
    expect(codeOf(await duplicateActivity(outsider, SPORT, created.id, a.id, v))).toBe("NOT_FOUND");
    expect(codeOf(await duplicateActivity(coach, SPORT, created.id, a.id, 1))).toBe("CONFLICT");
    expect(
      codeOf(
        await duplicateActivity(
          coach,
          SPORT,
          created.id,
          "0192a000-0000-7000-8000-0000000000ff",
          v,
        ),
      ),
    ).toBe("NOT_FOUND");
  });

  it("does not disturb activities of other sessions", async () => {
    const one = await richSession(coach);
    const two = await richSession(coach);
    const a = (await load(coach, one))!;
    good(await duplicateActivity(coach, SPORT, one, a.activities[0]!.id, a.version));
    const rows = await tenantTx(coach, (tx) =>
      tx.select().from(planActivities).where(eq(planActivities.planId, two)),
    );
    expect(rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("listing: search, filters and the columns My Sessions shows", () => {
  let who: Actor;
  let a: string; // Tuesday shooting, U16 Boys, 2025-06-10
  let b: string; // Friday defense, U12 Girls, 2025-06-13
  let c: string; // undated, no team, archived

  beforeAll(async () => {
    who = await createTestActor("List Coach");
    a = (
      await makePlan(who, {
        title: "Tuesday Shooting",
        teamName: "U16 Boys",
        ageGroup: "u16",
        level: "advanced",
        objective: "Catch and shoot",
        scheduledDate: "2025-06-10",
        startTime: "18:00",
        timezone: "Europe/Paris",
        primaryObjective: "shooting",
      })
    ).id;
    b = (
      await makePlan(who, {
        title: "Friday Defense 100%",
        teamName: "U12 Girls",
        ageGroup: "u12",
        scheduledDate: "2025-06-13",
        startTime: "17:00",
        timezone: "Europe/Paris",
        primaryObjective: "defense",
      })
    ).id;
    const cc = await makePlan(who, { title: "Undated idea" });
    c = cc.id;
    good(await setPlanStatus(who, SPORT, c, "archived", cc.version));
  });

  const ids = async (opts = {}) => (await listPlans(who, SPORT, opts))!.items.map((i) => i.id);

  it("carries the primary objective, age group, team, date, start time, totals and update time", async () => {
    let v = (await load(who, a))!.version;
    good(await custom(who, a, v, { durationMin: 20 }));
    const item = (await listPlans(who, SPORT))!.items.find((i) => i.id === a)!;
    expect(item).toMatchObject({
      title: "Tuesday Shooting",
      teamName: "U16 Boys",
      ageGroup: { key: "u16", name: "U16" },
      level: "advanced",
      scheduledDate: "2025-06-10",
      startTime: "18:00:00",
      totalMinutes: 20,
      activityCount: 1,
      status: "draft",
      primaryObjective: { key: "shooting", name: "Shooting" },
    });
    expect(item.updatedAt).toBeInstanceOf(Date);
    v = 0;
  });

  it("searches title, team and objective statement, case-insensitively, and treats % and _ as plain characters", async () => {
    expect(await ids({ q: "tuesday" })).toEqual([a]);
    expect(await ids({ q: "GIRLS" })).toEqual([b]);
    expect(await ids({ q: "catch and" })).toEqual([a]);
    expect(await ids({ q: "100%" })).toEqual([b]);
    expect(await ids({ q: "%" })).toEqual([b]); // only the session that really contains a percent sign
    expect(await ids({ q: "_" })).toEqual([]);
    expect(await ids({ q: "no such thing" })).toEqual([]);
  });

  it("filters by status; the default listing is everything the coach has, live or archived, but never deleted", async () => {
    expect(await ids({ statuses: ["archived"] })).toEqual([c]);
    expect((await ids({ statuses: ["draft", "published"] })).sort()).toEqual([a, b].sort());
    expect((await ids()).sort()).toEqual([a, b, c].sort());
  });

  it("filters by age group, team and date range (inclusive); an undated session never matches a date filter", async () => {
    expect(await ids({ ageGroup: "u16" })).toEqual([a]);
    expect(await ids({ ageGroup: "u12" })).toEqual([b]);
    expect(await ids({ ageGroup: "u99" })).toEqual([]);
    expect(await ids({ team: "U12 Girls" })).toEqual([b]);
    expect(await ids({ from: "2025-06-10", to: "2025-06-10" })).toEqual([a]);
    expect((await ids({ from: "2025-06-10", to: "2025-06-13" })).sort()).toEqual([a, b].sort());
    expect(await ids({ from: "2025-06-11" })).toEqual([b]);
    expect(await ids({ to: "2025-06-12" })).toEqual([a]);
    expect(await ids({ from: "2025-07-01" })).toEqual([]);
  });

  it("combines filters, and paging counts the filtered total", async () => {
    expect(await ids({ q: "shooting", ageGroup: "u16", from: "2025-06-01" })).toEqual([a]);
    expect(await ids({ q: "shooting", ageGroup: "u12" })).toEqual([]);
    const page = (await listPlans(who, SPORT, { statuses: ["draft"], limit: 1, offset: 1 }))!;
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
  });

  it("lists the team names in use, without duplicates, only from sessions the viewer can read", async () => {
    expect(await listPlanTeams(who, SPORT)).toEqual(["U12 Girls", "U16 Boys"]);
    await makePlan(who, { teamName: "U16 Boys" });
    expect(await listPlanTeams(who, SPORT)).toEqual(["U12 Girls", "U16 Boys"]);
    expect(await listPlanTeams(outsider, SPORT)).not.toContain("U16 Boys");
    expect(await listPlanTeams(who, "hockey")).toEqual([]);
  });

  it("another coach's filtered listing never leaks private sessions", async () => {
    const stranger = await createTestActor("Nosy Coach");
    expect((await listPlans(stranger, SPORT, { q: "Tuesday" }))!.items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("updating a session keeps its exact ages while the age group is unchanged", () => {
  it("re-saving without ages keeps them; changing the group resets them to the new group's typical ages; explicit ages win", async () => {
    const created = await makePlan(coach, { ageGroup: "u14", ageMin: 12, ageMax: 13 });
    const { updatePlan } = await import("@/modules/plans/commands");
    const { planInput } = await import("./plan-fixtures");
    let p = (await load(coach, created.id))!;
    expect([p.ageMin, p.ageMax]).toEqual([12, 13]);

    // the builder never sends ages: the exact ones stay
    let v = good(
      await updatePlan(
        coach,
        SPORT,
        created.id,
        planInput({ title: "Renamed", ageGroup: "u14", version: p.version }),
      ),
    ).version;
    p = (await load(coach, created.id))!;
    expect([p.ageGroup?.key, p.ageMin, p.ageMax]).toEqual(["u14", 12, 13]);

    // another group: that group's typical ages
    v = good(
      await updatePlan(
        coach,
        SPORT,
        created.id,
        planInput({ title: "Renamed", ageGroup: "u16", version: v }),
      ),
    ).version;
    p = (await load(coach, created.id))!;
    expect([p.ageGroup?.key, p.ageMin, p.ageMax]).toEqual(["u16", 15, 16]);

    // explicit ages always win
    good(
      await updatePlan(
        coach,
        SPORT,
        created.id,
        planInput({ title: "Renamed", ageGroup: "u16", ageMin: 14, ageMax: 17, version: v }),
      ),
    );
    p = (await load(coach, created.id))!;
    expect([p.ageMin, p.ageMax]).toEqual([14, 17]);
  });
});
