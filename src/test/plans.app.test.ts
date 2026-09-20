import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { auditEvents, drills, planActivities, planObjectives, plans } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { db, pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import { archiveDrill, createDrill, updateDrill } from "@/modules/drills/commands";
import { getDrill } from "@/modules/drills/queries";
import {
  addBreak,
  addCustomActivity,
  addDrillActivity,
  createPlan,
  deletePlan,
  removeActivity,
  reorderActivities,
  replaceActivityDrill,
  restorePlan,
  setPlanStatus,
  updateActivity,
  updatePlan,
} from "@/modules/plans/commands";
import { getPlan, listPlans } from "@/modules/plans/queries";
import { computeSchedule } from "@/modules/plans/schedule";
import {
  addBreakSchema,
  addCustomActivitySchema,
  addDrillActivitySchema,
  reorderActivitiesSchema,
  updateActivitySchema,
} from "@/modules/plans/validators";
import { PLAN_LIMITS } from "@/db/enums";
import { createTestActor } from "./factories";
import { createClub, drillInput } from "./drill-fixtures";
import {
  adminPool,
  basketballId,
  libraryDrill,
  makePlan,
  planInput,
  rawActivity,
  rawPlan,
} from "./plan-fixtures";

/**
 * The plans module through its real commands and queries, with real permissions and a real database.
 * (The database's own refusals, without any application code in between, are in plans.rls.test.ts.)
 */

const SPORT = "basketball";
let BB: string;
let owner: Actor;
let admin: Actor;
let coach: Actor;
let teacher: Actor;
let assistant: Actor;
let outsider: Actor; // another workspace
let solo: Actor; // a personal workspace of one
let library: { id: string; version: number };

/** Unwrap a successful Result or fail the test with the reason. */
function good<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r.error)}`);
  return r.data;
}
const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);

const drillAct = (a: Actor, planId: string, drillId: string, version: number, over = {}) =>
  addDrillActivity(a, SPORT, planId, addDrillActivitySchema.parse({ drillId, version, ...over }));
const customAct = (a: Actor, planId: string, version: number, over = {}) =>
  addCustomActivity(
    a,
    SPORT,
    planId,
    addCustomActivitySchema.parse({ title: "Team talk", durationMin: 5, version, ...over }),
  );
const breakAct = (a: Actor, planId: string, version: number, over = {}) =>
  addBreak(a, SPORT, planId, addBreakSchema.parse({ durationMin: 3, version, ...over }));
const edit = (a: Actor, planId: string, activityId: string, version: number, over = {}) =>
  updateActivity(a, SPORT, planId, activityId, updateActivitySchema.parse({ version, ...over }));
const load = (a: Actor, id: string) => getPlan(a, SPORT, id);

beforeAll(async () => {
  BB = await basketballId();
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
  solo = await createTestActor("Solo Coach");
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------------------------------
describe("creating a session", () => {
  it("makes a private draft in the actor's workspace, with the sport's default length and no schedule", async () => {
    const { id, version } = await makePlan(coach, { title: "Thursday practice" });
    expect(version).toBe(1);
    const p = (await load(coach, id))!;
    expect(p).toMatchObject({
      title: "Thursday practice",
      type: "training_session",
      status: "draft",
      visibility: "private",
      version: 1,
      isMine: true,
      teamName: null,
      ageGroup: null,
      level: null,
      players: null,
      objective: "",
      scheduledDate: null,
      startTime: null,
      schedule: null,
      deletedAt: null,
      activities: [],
      objectives: { primary: null, secondary: [] },
      totals: { totalMinutes: 0, activityCount: 0, targetMinutes: 90, remainingMinutes: 90 },
      permissions: { canEdit: true, canDelete: true },
    });
    expect(p.details).toEqual({
      schemaVersion: 1,
      location: "",
      season: "",
      sessionNumber: null,
      coachName: "",
      clubName: "",
      coachNotes: "",
    });
    const [row] = await tenantTx(coach, (tx) => tx.select().from(plans).where(eq(plans.id, id)));
    expect(row).toMatchObject({ organizationId: coach.organizationId, createdBy: coach.userId });
  });

  it("stores everything a coach fills in: team, age, level, players, target, objective, schedule, details, objectives", async () => {
    const { id } = await makePlan(coach, {
      title: "U14 finishing",
      teamName: "U14 Girls",
      ageGroup: "u14",
      level: "intermediate",
      players: 14,
      targetMinutes: 75,
      objective: "Finish through contact.",
      scheduledDate: "2025-06-10",
      startTime: "18:30",
      timezone: "Europe/Paris",
      visibility: "organization",
      primaryObjective: "finishing",
      secondaryObjectives: ["decision_making", "transition"],
      details: {
        location: "Court 2",
        season: "2025–26",
        sessionNumber: 12,
        coachName: "Bob Coach",
        clubName: "Riverside Academy",
        coachNotes: "Bring bibs.",
      },
    });
    const p = (await load(coach, id))!;
    expect(p).toMatchObject({
      teamName: "U14 Girls",
      ageGroup: { key: "u14", name: "U14" },
      ageMin: 13,
      ageMax: 14,
      level: "intermediate",
      players: 14,
      objective: "Finish through contact.",
      scheduledDate: "2025-06-10",
      startTime: "18:30:00",
      timezone: "Europe/Paris",
      visibility: "organization",
      totals: { targetMinutes: 75 },
      objectives: {
        primary: { key: "finishing", name: "Finishing" },
        // secondary objectives come back in the catalog's own order
        secondary: [
          { key: "transition", name: "Transition" },
          { key: "decision_making", name: "Decision Making" },
        ],
      },
    });
    expect(p.details).toMatchObject({
      location: "Court 2",
      season: "2025–26",
      sessionNumber: 12,
      coachName: "Bob Coach",
      clubName: "Riverside Academy",
      coachNotes: "Bring bibs.",
    });
    expect(p.schedule?.endTime).toBe("18:30"); // no activities yet: it ends when it starts
  });

  it("explicit ages win over an age group's typical ages; an age group alone fills them in", async () => {
    const a = (await load(coach, (await makePlan(coach, { ageGroup: "u12" })).id))!;
    expect([a.ageMin, a.ageMax]).toEqual([11, 12]);
    const b = (await load(
      coach,
      (await makePlan(coach, { ageGroup: "u12", ageMin: 10, ageMax: 11 })).id,
    ))!;
    expect([b.ageGroup?.key, b.ageMin, b.ageMax]).toEqual(["u12", 10, 11]);
    const c = (await load(coach, (await makePlan(coach, { ageMin: 15, ageMax: 17 })).id))!;
    expect([c.ageGroup, c.ageMin, c.ageMax]).toEqual([null, 15, 17]);
  });

  it("objectives are coach-friendly names from the sport's objective catalog, in a stable order", async () => {
    const { id } = await makePlan(coach, {
      primaryObjective: "shooting",
      secondaryObjectives: ["defense", "transition"],
    });
    const p = (await load(coach, id))!;
    expect(p.objectives).toEqual({
      primary: { key: "shooting", name: "Shooting" },
      secondary: [
        { key: "defense", name: "Defense" },
        { key: "transition", name: "Transition" },
      ],
    });
    const joined = await tenantTx(coach, (tx) =>
      tx.execute(
        sql`select o.key, o.sport_id from plan_objectives po join objectives o on o.id = po.objective_id where po.plan_id = ${id}`,
      ),
    );
    expect(joined.rows).toHaveLength(3);
    for (const r of joined.rows) expect(r.sport_id).toBe(BB);
  });

  it("every objective in the catalog can be chosen as the main objective", async () => {
    const keys = [
      "shooting",
      "ball_handling",
      "passing",
      "finishing",
      "footwork",
      "defense",
      "rebounding",
      "transition",
      "team_offense",
      "team_defense",
      "pick_and_roll",
      "decision_making",
      "conditioning",
      "special_situations",
    ];
    for (const k of keys) {
      const { id } = await makePlan(coach, { primaryObjective: k });
      expect((await load(coach, id))!.objectives.primary?.key, k).toBe(k);
    }
  });

  it("the detailed skills are not objectives: a coach picks 'Ball Handling', not 'Dribbling' or 'Crossover'", async () => {
    for (const skill of ["dribbling", "crossover", "shooting_form", "closeouts"]) {
      const r = await createPlan(coach, SPORT, planInput({ primaryObjective: skill }));
      expect(r, skill).toMatchObject({
        ok: false,
        error: { code: "VALIDATION", fields: { primaryObjective: ["objective_unknown"] } },
      });
    }
  });

  it("rejects an age group or an objective that is not in the sport's catalog", async () => {
    const bad = await createPlan(coach, SPORT, planInput({ ageGroup: "u99" }));
    expect(bad).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { ageGroup: ["age_group_unknown"] } },
    });
    const skills = await createPlan(
      coach,
      SPORT,
      planInput({ primaryObjective: "flying", secondaryObjectives: ["dribbling", "swimming"] }),
    );
    expect(skills).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fields: {
          primaryObjective: ["objective_unknown"],
          secondaryObjectives: ["objective_unknown"],
        },
      },
    });
  });

  it("an unknown or unsupported sport is simply not found", async () => {
    expect(codeOf(await createPlan(coach, "hockey", planInput()))).toBe("NOT_FOUND");
    expect(codeOf(await createPlan(coach, "football", planInput()))).toBe("NOT_FOUND"); // in the catalog, but planned
  });

  it("uses the coach's own time zone for a scheduled session that names none, else UTC", async () => {
    const tz = await createTestActor("Zone Coach");
    const withProfile = await tenantTx(tz, (tx) =>
      tx.execute(
        sql`update profiles set timezone = 'America/Chicago' where user_id = ${tz.userId} returning user_id`,
      ),
    );
    expect(withProfile.rows).toHaveLength(1);
    const a = (await load(
      tz,
      (await makePlan(tz, { scheduledDate: "2025-06-10", startTime: "17:00" })).id,
    ))!;
    expect(a.timezone).toBe("America/Chicago");
    const named = (await load(
      tz,
      (
        await makePlan(tz, {
          scheduledDate: "2025-06-10",
          startTime: "17:00",
          timezone: "Asia/Tokyo",
        })
      ).id,
    ))!;
    expect(named.timezone).toBe("Asia/Tokyo");
    // no profile zone at all → UTC, but only because the session is scheduled and therefore needs one
    const plain = await createTestActor("No Zone");
    expect(
      (await load(plain, (await makePlan(plain, { scheduledDate: "2025-06-10" })).id))!.timezone,
    ).toBe("UTC");
    expect((await load(plain, (await makePlan(plain)).id))!.timezone).toBeNull();
  });

  it("records an audit event (in the same transaction as the session)", async () => {
    const { id } = await makePlan(coach);
    const events = await tenantTx(coach, (tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.entityId, id), eq(auditEvents.action, "plan.created"))),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      userId: coach.userId,
      organizationId: coach.organizationId,
      entityType: "plan",
    });
  });

  it("a personal workspace has one member, so a 'workspace' session there stays private", async () => {
    const { id } = await makePlan(solo, { visibility: "organization" });
    expect((await load(solo, id))!.visibility).toBe("private");
    const clubOne = await makePlan(coach, { visibility: "organization" });
    expect((await load(coach, clubOne.id))!.visibility).toBe("organization");
  });

  it("an assistant cannot create sessions", async () => {
    expect(codeOf(await createPlan(assistant, SPORT, planInput()))).toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------------------------------
describe("who can see and change a session", () => {
  let priv: { id: string; version: number };
  let shared: { id: string; version: number };

  beforeAll(async () => {
    priv = await makePlan(coach, { title: "Private", visibility: "private" });
    shared = await makePlan(coach, { title: "Shared", visibility: "organization" });
  });

  it("private: only the creator. Not the owner, not an admin, not a colleague, not another workspace", async () => {
    expect(await load(coach, priv.id)).not.toBeNull();
    for (const a of [owner, admin, teacher, assistant, outsider])
      expect(await load(a, priv.id), a.role).toBeNull();
  });

  it("workspace: every member reads it, read-only unless they are an owner/admin", async () => {
    for (const a of [owner, admin, teacher, assistant])
      expect(await load(a, shared.id), a.role).not.toBeNull();
    expect((await load(assistant, shared.id))!.permissions).toEqual({
      canEdit: false,
      canDelete: false,
    });
    expect((await load(teacher, shared.id))!.permissions).toEqual({
      canEdit: false,
      canDelete: false,
    });
    expect((await load(admin, shared.id))!.permissions).toEqual({ canEdit: true, canDelete: true });
    expect((await load(owner, shared.id))!.permissions).toEqual({ canEdit: true, canDelete: true });
  });

  it("another workspace never sees it, and every command answers 'not found' — not 'forbidden'", async () => {
    expect(await load(outsider, shared.id)).toBeNull();
    const input = planInput({ title: "x", version: 1 });
    expect(codeOf(await updatePlan(outsider, SPORT, shared.id, input))).toBe("NOT_FOUND");
    expect(codeOf(await setPlanStatus(outsider, SPORT, shared.id, "archived", 1))).toBe(
      "NOT_FOUND",
    );
    expect(codeOf(await deletePlan(outsider, SPORT, shared.id))).toBe("NOT_FOUND");
    expect(codeOf(await breakAct(outsider, shared.id, 1))).toBe("NOT_FOUND");
    expect(codeOf(await updatePlan(admin, SPORT, priv.id, input))).toBe("NOT_FOUND"); // a private session is invisible even to an admin
    // …and nothing changed
    expect((await load(coach, shared.id))!.title).toBe("Shared");
  });

  it("who may edit: the creator and the workspace's owner/admin; not a colleague coach or teacher, not an assistant", async () => {
    const update = (a: Actor, title: string, version: number) =>
      updatePlan(a, SPORT, shared.id, planInput({ title, visibility: "organization", version }));
    let v = shared.version;
    expect(codeOf(await update(teacher, "hijack", v))).toBe("FORBIDDEN");
    expect(codeOf(await update(assistant, "hijack", v))).toBe("FORBIDDEN");
    v = good(await update(coach, "By the creator", v)).version;
    v = good(await update(admin, "By an admin", v)).version;
    v = good(await update(owner, "By the owner", v)).version;
    expect((await load(coach, shared.id))!.title).toBe("By the owner");
    shared.version = v;
  });

  it("timeline edits follow the same rules", async () => {
    const t = await makePlan(coach, { visibility: "organization" });
    expect(codeOf(await breakAct(teacher, t.id, t.version))).toBe("FORBIDDEN");
    expect(codeOf(await breakAct(assistant, t.id, t.version))).toBe("FORBIDDEN");
    good(await breakAct(admin, t.id, t.version));
  });

  it("listings show exactly what the viewer may read", async () => {
    const mine = (await listPlans(coach, SPORT))!.items.map((i) => i.id);
    expect(mine).toEqual(expect.arrayContaining([priv.id, shared.id]));
    const admins = (await listPlans(admin, SPORT))!.items.map((i) => i.id);
    expect(admins).toContain(shared.id);
    expect(admins).not.toContain(priv.id);
    expect((await listPlans(outsider, SPORT))!.items.map((i) => i.id)).not.toContain(shared.id);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("editing the session and optimistic concurrency", () => {
  it("every change bumps the version, and a stale editor is told so instead of overwriting", async () => {
    const created = await makePlan(coach, { title: "Draft one" });
    const v2 = good(
      await updatePlan(
        coach,
        SPORT,
        created.id,
        planInput({ title: "Draft two", version: created.version }),
      ),
    );
    expect(v2.version).toBe(2);
    // a second tab still holding version 1
    const stale = await updatePlan(
      coach,
      SPORT,
      created.id,
      planInput({ title: "Stale", version: 1 }),
    );
    expect(codeOf(stale)).toBe("CONFLICT");
    expect((await load(coach, created.id))!.title).toBe("Draft two");
    // timeline edits count as changes too
    const v3 = good(await breakAct(coach, created.id, 2)).version;
    expect(v3).toBe(3);
    expect(codeOf(await breakAct(coach, created.id, 2))).toBe("CONFLICT");
  });

  it("requires the version on update", async () => {
    const { id } = await makePlan(coach);
    const r = await updatePlan(coach, SPORT, id, planInput({ title: "x" }));
    expect(r).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { version: ["required"] } },
    });
  });

  it("two simultaneous edits from the same version: one wins, the other is a conflict, nothing is half-applied", async () => {
    const { id, version } = await makePlan(coach);
    const results = await Promise.all([
      breakAct(coach, id, version, { title: "A" }),
      breakAct(coach, id, version, { title: "B" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map(codeOf)).toEqual(["CONFLICT"]);
    const p = (await load(coach, id))!;
    expect(p.activities).toHaveLength(1);
    expect(p.version).toBe(2);
  });

  it("a failed command leaves no trace: not even the version bump", async () => {
    const { id, version } = await makePlan(coach);
    let v = version;
    for (let i = 0; i < 3; i++)
      v = good(await customAct(coach, id, v, { durationMin: 240 })).version;
    const before = (await load(coach, id))!;
    // the command opens the session (which bumps the version) and THEN finds the timeline too long
    const refused = await customAct(coach, id, v, { durationMin: 1 });
    expect(refused).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const after = (await load(coach, id))!;
    expect(after.version).toBe(before.version);
    expect(after.activities).toHaveLength(3);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("replaces the objectives on update", async () => {
    const created = await makePlan(coach, {
      primaryObjective: "passing",
      secondaryObjectives: ["shooting"],
    });
    good(
      await updatePlan(
        coach,
        SPORT,
        created.id,
        planInput({
          title: "Same",
          primaryObjective: "ball_handling",
          secondaryObjectives: [],
          version: created.version,
        }),
      ),
    );
    const p = (await load(coach, created.id))!;
    expect(p.objectives).toEqual({
      primary: { key: "ball_handling", name: "Ball Handling" },
      secondary: [],
    });
    const rows = await tenantTx(coach, (tx) =>
      tx.select().from(planObjectives).where(eq(planObjectives.planId, created.id)),
    );
    expect(rows).toHaveLength(1);
  });

  it("an update audit event is recorded", async () => {
    const created = await makePlan(coach);
    good(
      await updatePlan(
        coach,
        SPORT,
        created.id,
        planInput({ title: "Renamed", version: created.version }),
      ),
    );
    const events = await tenantTx(coach, (tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.entityId, created.id), eq(auditEvents.action, "plan.updated"))),
    );
    expect(events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("the timeline", () => {
  it("builds the coach's example: warm-up, ball handling, shooting, finishing, defense, 3v3, cool-down = 90 minutes", async () => {
    const created = await makePlan(coach, {
      title: "Ninety minutes",
      scheduledDate: "2025-06-10",
      startTime: "19:00",
      timezone: "Europe/Paris",
    });
    const plan: Array<[string, number, string]> = [
      ["Warm-up", 10, "warm_up"],
      ["Ball handling", 10, "skill"],
      ["Shooting", 15, "skill"],
      ["Finishing", 15, "skill"],
      ["Defense", 15, "skill"],
      ["3v3", 15, "small_sided"],
      ["Cool-down", 10, "cool_down"],
    ];
    let version = created.version;
    for (const [title, durationMin, phase] of plan)
      version = good(
        await customAct(coach, created.id, version, { title, durationMin, phase }),
      ).version;

    const p = (await load(coach, created.id))!;
    expect(p.activities.map((a) => [a.position, a.title, a.startMin, a.endMin])).toEqual([
      [0, "Warm-up", 0, 10],
      [1, "Ball handling", 10, 20],
      [2, "Shooting", 20, 35],
      [3, "Finishing", 35, 50],
      [4, "Defense", 50, 65],
      [5, "3v3", 65, 80],
      [6, "Cool-down", 80, 90],
    ]);
    expect(p.totals).toEqual({
      totalMinutes: 90,
      activityCount: 7,
      targetMinutes: 90,
      remainingMinutes: 0,
    });
    expect(p.schedule).toMatchObject({
      endTime: "20:30",
      endDate: "2025-06-10",
      endsNextDay: false,
    });
  });

  it("adds a drill, a custom activity and a break, each with its own details", async () => {
    const { id, version } = await makePlan(coach);
    const v1 = good(
      await drillAct(coach, id, library.id, version, {
        durationMin: 12,
        repetitions: 3,
        players: 10,
        notes: "Both hands.",
        phase: "warm_up",
      }),
    ).version;
    const v2 = good(
      await customAct(coach, id, v1, {
        title: "Film",
        durationMin: 8,
        phase: "cool_down",
        notes: "Clip 3",
        content: {
          description: "Watch the clip.",
          instructions: ["Pause at 0:40"],
          coachingPoints: ["Ask why"],
        },
      }),
    ).version;
    good(
      await breakAct(coach, id, v2, { title: "Water", durationMin: 2, notes: "Refill bottles" }),
    );
    const p = (await load(coach, id))!;
    const [d, c, b] = p.activities;
    expect(d).toMatchObject({
      kind: "drill",
      phase: "warm_up",
      durationMin: 12,
      repetitions: 3,
      players: 10,
      notes: "Both hands.",
      customized: false,
      source: { drillId: library.id, drillVersion: library.version, status: "current" },
    });
    expect(d!.snapshot).toMatchObject({
      provenance: { drillId: library.id, drillVersion: library.version },
    });
    expect(c).toMatchObject({
      kind: "custom",
      title: "Film",
      phase: "cool_down",
      durationMin: 8,
      source: { drillId: null, status: "none" },
    });
    expect(c!.snapshot).toMatchObject({
      description: "Watch the clip.",
      instructions: ["Pause at 0:40"],
      coachingPoints: ["Ask why"],
    });
    expect(b).toMatchObject({
      kind: "break",
      title: "Water",
      phase: null,
      durationMin: 2,
      snapshot: null,
      source: { status: "none" },
    });
    expect(p.totals.totalMinutes).toBe(22);
  });

  it("a drill defaults to the middle of its suggested range and its first phase", async () => {
    const { id, version } = await makePlan(coach);
    good(await drillAct(coach, id, library.id, version));
    const a = (await load(coach, id))!.activities[0]!;
    const snap = a.snapshot as { duration: { min: number; max: number }; phases: string[] };
    expect(a.durationMin).toBe(Math.round((snap.duration.min + snap.duration.max) / 2));
    expect(a.phase).toBe(snap.phases[0] ?? null);
  });

  it("inserts at a position and keeps the positions gap-free", async () => {
    const { id, version } = await makePlan(coach);
    let v = version;
    for (const t of ["A", "B", "C"]) v = good(await customAct(coach, id, v, { title: t })).version;
    v = good(await customAct(coach, id, v, { title: "X", position: 1 })).version;
    v = good(await customAct(coach, id, v, { title: "First", position: 0 })).version;
    good(await customAct(coach, id, v, { title: "Way past the end", position: 50 }));
    const p = (await load(coach, id))!;
    expect(p.activities.map((a) => a.title)).toEqual([
      "First",
      "A",
      "X",
      "B",
      "C",
      "Way past the end",
    ]);
    expect(p.activities.map((a) => a.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("reorders the whole timeline in one step; offsets follow, the total does not change", async () => {
    const { id, version } = await makePlan(coach);
    let v = version;
    for (const [t, m] of [
      ["A", 10],
      ["B", 20],
      ["C", 30],
    ] as const)
      v = good(await customAct(coach, id, v, { title: t, durationMin: m })).version;
    const before = (await load(coach, id))!;
    const [a, b, c] = before.activities.map((x) => x.id) as [string, string, string];
    v = good(
      await reorderActivities(
        coach,
        SPORT,
        id,
        reorderActivitiesSchema.parse({ orderedIds: [c, a, b], version: v }),
      ),
    ).version;
    const after = (await load(coach, id))!;
    expect(after.activities.map((x) => [x.title, x.startMin, x.endMin])).toEqual([
      ["C", 0, 30],
      ["A", 30, 40],
      ["B", 40, 60],
    ]);
    expect(after.totals.totalMinutes).toBe(60);
    // a swap works too (the position constraint is checked when the statement ends)
    good(
      await reorderActivities(
        coach,
        SPORT,
        id,
        reorderActivitiesSchema.parse({ orderedIds: [a, c, b], version: v }),
      ),
    );
    expect((await load(coach, id))!.activities.map((x) => x.title)).toEqual(["A", "C", "B"]);
  });

  it("refuses a reorder that is not exactly the current activities", async () => {
    const { id, version } = await makePlan(coach);
    const v = good(await customAct(coach, id, version, { title: "A" })).version;
    const [a] = (await load(coach, id))!.activities;
    const attempts: string[][] = [
      [],
      [a!.id, a!.id],
      [a!.id, "0192a000-0000-7000-8000-0000000000ff"],
      ["0192a000-0000-7000-8000-0000000000ff"],
    ];
    for (const orderedIds of attempts) {
      const r = await reorderActivities(
        coach,
        SPORT,
        id,
        reorderActivitiesSchema.parse({ orderedIds, version: v }),
      );
      expect(r, JSON.stringify(orderedIds)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION", fields: { orderedIds: ["order_mismatch"] } },
      });
    }
    // the failed attempts did not consume the version
    expect((await load(coach, id))!.version).toBe(v);
  });

  it("removes an activity and closes the gap", async () => {
    const { id, version } = await makePlan(coach);
    let v = version;
    for (const t of ["A", "B", "C"])
      v = good(await customAct(coach, id, v, { title: t, durationMin: 10 })).version;
    const mid = (await load(coach, id))!.activities[1]!.id;
    v = good(await removeActivity(coach, SPORT, id, mid, v)).version;
    const p = (await load(coach, id))!;
    expect(p.activities.map((a) => [a.title, a.position, a.startMin])).toEqual([
      ["A", 0, 0],
      ["C", 1, 10],
    ]);
    expect(p.totals.totalMinutes).toBe(20);
    expect(codeOf(await removeActivity(coach, SPORT, id, mid, v))).toBe("NOT_FOUND");
  });

  it("edits duration, players, notes, phase and title of one activity", async () => {
    const { id, version } = await makePlan(coach);
    const v = good(
      await customAct(coach, id, version, { title: "Shooting", durationMin: 15 }),
    ).version;
    const a = (await load(coach, id))!.activities[0]!;
    good(
      await edit(coach, id, a.id, v, {
        durationMin: 25,
        players: 8,
        repetitions: 4,
        notes: "Corner threes",
        phase: "skill",
        title: "Shooting circuit",
        changeReason: "Team needs more reps",
      }),
    );
    const after = (await load(coach, id))!.activities[0]!;
    expect(after).toMatchObject({
      durationMin: 25,
      players: 8,
      repetitions: 4,
      notes: "Corner threes",
      phase: "skill",
      title: "Shooting circuit",
      changeReason: "Team needs more reps",
    });
    expect((await load(coach, id))!.totals.totalMinutes).toBe(25);
    expect(
      codeOf(await edit(coach, id, "0192a000-0000-7000-8000-0000000000ff", v + 1, { notes: "x" })),
    ).toBe("NOT_FOUND");
  });

  it("a break cannot be given content or a phase", async () => {
    const { id, version } = await makePlan(coach);
    const v = good(await breakAct(coach, id, version)).version;
    const a = (await load(coach, id))!.activities[0]!;
    expect(codeOf(await edit(coach, id, a.id, v, { content: { setup: "x" } }))).toBe("VALIDATION");
    good(await edit(coach, id, a.id, v, { phase: "warm_up" }));
    expect((await load(coach, id))!.activities[0]!.phase).toBeNull();
  });

  it("durations are never zero or negative, whatever the caller sends", async () => {
    for (const bad of [0, -1, -60, 1.5, 241])
      expect(addBreakSchema.safeParse({ durationMin: bad, version: 1 }).success, String(bad)).toBe(
        false,
      );
  });

  it("caps the session at 720 minutes and at 60 activities", async () => {
    const { id, version } = await makePlan(coach);
    let v = version;
    for (let i = 0; i < 3; i++)
      v = good(await customAct(coach, id, v, { title: `Block ${i}`, durationMin: 240 })).version;
    const over = await customAct(coach, id, v, { durationMin: 1 });
    expect(over).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { durationMin: ["session_too_long"] } },
    });
    // lengthening an existing activity is held to the same limit
    const first = (await load(coach, id))!.activities[0]!;
    v = good(await edit(coach, id, first.id, v, { durationMin: 200 })).version; // 680 in total
    v = good(await edit(coach, id, first.id, v, { durationMin: 240 })).version; // back to exactly 720
    expect(codeOf(await customAct(coach, id, v, { durationMin: 1 }))).toBe("VALIDATION");
    // and the refusals left the version and the timeline untouched
    expect((await load(coach, id))!.version).toBe(v);

    const full = await makePlan(coach);
    for (let i = 0; i < PLAN_LIMITS.maxActivities; i++)
      await rawActivity(coach, full.id, BB, { position: i, durationMin: 1 });
    const tooMany = await breakAct(coach, full.id, full.version);
    expect(tooMany).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { activities: ["session_too_many"] } },
    });
  });

  it("lengthening an activity is refused when it would push the session past 720 minutes", async () => {
    const { id, version } = await makePlan(coach);
    let v = version;
    for (const m of [240, 240, 100, 100])
      v = good(await customAct(coach, id, v, { durationMin: m })).version;
    const last = (await load(coach, id))!.activities[3]!;
    const refused = await edit(coach, id, last.id, v, { durationMin: 141 }); // 240 + 240 + 100 + 141 = 721
    expect(refused).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { durationMin: ["session_too_long"] } },
    });
    expect((await load(coach, id))!.version).toBe(v);
    good(await edit(coach, id, last.id, v, { durationMin: 140 })); // exactly 720
    expect((await load(coach, id))!.totals.totalMinutes).toBe(720);
  });

  it("the session's numbers are calculated on every read: nothing is stored to go stale", async () => {
    const { id, version } = await makePlan(coach, {
      targetMinutes: 60,
      scheduledDate: "2025-06-10",
      startTime: "18:00",
      timezone: "UTC",
    });
    let v = good(await customAct(coach, id, version, { title: "A", durationMin: 20 })).version;
    v = good(await customAct(coach, id, v, { title: "B", durationMin: 25 })).version;
    let p = (await load(coach, id))!;
    expect(p.totals).toEqual({
      totalMinutes: 45,
      activityCount: 2,
      targetMinutes: 60,
      remainingMinutes: 15,
    });
    expect(p.schedule?.endTime).toBe("18:45");
    const columns = async () =>
      (
        await tenantTx(coach, (tx) =>
          tx.execute(
            sql`select scheduled_date, start_time, timezone, target_minutes, objective from plans where id = ${id}`,
          ),
        )
      ).rows;
    const planColumnsBefore = await columns();
    good(await edit(coach, id, p.activities[0]!.id, v, { durationMin: 40 }));
    p = (await load(coach, id))!;
    expect(p.totals).toEqual({
      totalMinutes: 65,
      activityCount: 2,
      targetMinutes: 60,
      remainingMinutes: -5,
    });
    expect(p.schedule?.endTime).toBe("19:05");
    // the session's own columns were not touched to make that true
    expect(await columns()).toEqual(planColumnsBefore);
  });

  it("the totals in a listing (from the database view) agree with the session's own calculation", async () => {
    const { id, version } = await makePlan(coach, {
      scheduledDate: "2025-06-10",
      startTime: "18:00",
      timezone: "Europe/Paris",
    });
    let v = good(await customAct(coach, id, version, { durationMin: 20 })).version;
    v = good(await breakAct(coach, id, v, { durationMin: 5 })).version;
    good(await drillAct(coach, id, library.id, v, { durationMin: 15 }));
    const detail = (await load(coach, id))!;
    const item = (await listPlans(coach, SPORT))!.items.find((i) => i.id === id)!;
    expect(item.totalMinutes).toBe(detail.totals.totalMinutes);
    expect(item.activityCount).toBe(3);
    expect(item.startsAt?.toISOString()).toBe(detail.schedule!.startsAt.toISOString());
    expect(item.endsAt?.toISOString()).toBe(detail.schedule!.endsAt.toISOString());
  });
});

// ---------------------------------------------------------------------------------------------------
describe("scheduling: date, start time and zone → calculated end time", () => {
  it("stores the local wall-clock time, and calculates the end from the total", async () => {
    const { id, version } = await makePlan(coach, {
      scheduledDate: "2025-06-10",
      startTime: "19:00",
      timezone: "Europe/Paris",
    });
    good(await customAct(coach, id, version, { durationMin: 90 }));
    const p = (await load(coach, id))!;
    expect(p).toMatchObject({
      scheduledDate: "2025-06-10",
      startTime: "19:00:00",
      timezone: "Europe/Paris",
    });
    expect(p.schedule).toMatchObject({
      endTime: "20:30",
      endDate: "2025-06-10",
      endsNextDay: false,
    });
    expect(p.schedule!.startsAt.toISOString()).toBe("2025-06-10T17:00:00.000Z");
  });

  it("moving the session to another zone keeps the coach's clock time and moves the instants", async () => {
    const created = await makePlan(coach, {
      scheduledDate: "2025-06-10",
      startTime: "19:00",
      timezone: "Europe/Paris",
    });
    good(
      await updatePlan(
        coach,
        SPORT,
        created.id,
        planInput({
          title: "Tuesday practice",
          scheduledDate: "2025-06-10",
          startTime: "19:00",
          timezone: "America/New_York",
          version: created.version,
        }),
      ),
    );
    const p = (await load(coach, created.id))!;
    expect(p.startTime).toBe("19:00:00");
    expect(p.schedule!.startsAt.toISOString()).toBe("2025-06-10T23:00:00.000Z");
  });

  it("clearing the schedule removes the times and keeps the zone", async () => {
    const created = await makePlan(coach, {
      scheduledDate: "2025-06-10",
      startTime: "19:00",
      timezone: "Europe/Paris",
    });
    good(
      await updatePlan(
        coach,
        SPORT,
        created.id,
        planInput({ title: "Tuesday practice", version: created.version }),
      ),
    );
    const p = (await load(coach, created.id))!;
    expect([p.scheduledDate, p.startTime, p.schedule]).toEqual([null, null, null]);
    expect(p.timezone).toBe("Europe/Paris");
  });

  it("a date without a start time still has no end time", async () => {
    const { id } = await makePlan(coach, { scheduledDate: "2025-06-10", timezone: "Europe/Paris" });
    const p = (await load(coach, id))!;
    expect(p.scheduledDate).toBe("2025-06-10");
    expect(p.schedule).toBeNull();
  });

  it("the database view and the application agree on start and end, including on daylight-saving days", async () => {
    // [zone, date, start time, total minutes] — ordinary days, half-hour zones, midnight, and every DST edge:
    // a skipped hour (nothing exists at 02:30), a repeated hour (02:30 happens twice), and a session that spans the change
    const cases: Array<[string, string, string, number]> = [
      ["UTC", "2025-01-15", "09:00", 90],
      ["Europe/Paris", "2025-06-10", "18:00", 90],
      ["Europe/Paris", "2025-03-30", "01:30", 90], // spans the spring change
      ["Europe/Paris", "2025-03-30", "02:30", 60], // 02:30 does not exist
      ["Europe/Paris", "2025-10-26", "01:30", 90], // spans the autumn change
      ["Europe/Paris", "2025-10-26", "02:30", 60], // 02:30 happens twice
      ["America/New_York", "2025-03-09", "02:30", 45], // does not exist
      ["America/New_York", "2025-11-02", "01:30", 45], // happens twice
      ["America/New_York", "2025-11-02", "00:30", 180], // spans the change
      ["America/Los_Angeles", "2025-06-10", "23:00", 120], // crosses midnight
      ["Asia/Kolkata", "2025-06-10", "18:00", 90], // UTC+5:30
      ["Asia/Kathmandu", "2025-06-10", "18:00", 90], // UTC+5:45
      ["Australia/Lord_Howe", "2025-10-05", "01:45", 60], // a 30-minute daylight-saving change
      ["Australia/Lord_Howe", "2025-10-05", "02:15", 60], // inside its skipped half hour
      ["Pacific/Auckland", "2025-09-28", "02:30", 90], // does not exist
      ["Pacific/Auckland", "2025-04-06", "02:30", 90], // happens twice
      ["America/Sao_Paulo", "2025-06-10", "19:30", 75],
      ["Africa/Casablanca", "2025-03-30", "02:30", 60], // Ramadan clock rules
    ];
    const author = coach;
    for (const [tz, date, time, total] of cases) {
      const id = await rawPlan(author, BB, { scheduledDate: date, startTime: time, timezone: tz });
      await rawActivity(author, id, BB, { position: 0, durationMin: Math.min(total, 240) });
      if (total > 240) await rawActivity(author, id, BB, { position: 1, durationMin: total - 240 });
      const [row] = (
        await tenantTx(author, (tx) =>
          tx.execute(
            sql`select extract(epoch from starts_at)::bigint as s, extract(epoch from ends_at)::bigint as e from plan_totals where plan_id = ${id}`,
          ),
        )
      ).rows;
      const app = computeSchedule({
        scheduledDate: date,
        startTime: time,
        timezone: tz,
        totalMinutes: total,
      })!;
      const label = `${tz} ${date} ${time} +${total}`;
      expect(Number(row!.s), `${label} start`).toBe(app.startsAt.getTime() / 1000);
      expect(Number(row!.e), `${label} end`).toBe(app.endsAt.getTime() / 1000);
    }
  });

  it("every zone the application offers is a zone the database knows", async () => {
    const supported = (
      Intl as unknown as { supportedValuesOf: (k: string) => string[] }
    ).supportedValuesOf("timeZone");
    const known = new Set(
      (await pool.query<{ name: string }>("select name from pg_timezone_names")).rows.map(
        (r) => r.name,
      ),
    );
    expect(supported.filter((z) => !known.has(z))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("drill snapshots", () => {
  let bobsDrill: { id: string; version: number };

  beforeAll(async () => {
    bobsDrill = {
      id: good(
        await createDrill(
          coach,
          SPORT,
          drillInput({ title: "3v3 Closeout Game", visibility: "organization" }),
        ),
      ).id,
      version: 1,
    };
  });

  const changeDrill = async (over: Parameters<typeof drillInput>[0]) => {
    const d = (await getDrill(coach, SPORT, bobsDrill.id))!;
    const r = await updateDrill(coach, SPORT, bobsDrill.id, {
      ...drillInput({ title: d.title, visibility: "organization", ...over }),
      version: d.version,
    });
    good(r);
    return (await getDrill(coach, SPORT, bobsDrill.id))!;
  };

  it("copies everything the document needs, exactly as the coach sees the drill at that moment", async () => {
    const { id, version } = await makePlan(coach);
    const drill = (await getDrill(coach, SPORT, library.id))!;
    good(await drillAct(coach, id, library.id, version));
    const a = (await load(coach, id))!.activities[0]!;
    const s = a.snapshot as Record<string, unknown> & {
      content: Record<string, unknown>;
      provenance: Record<string, unknown>;
    };
    expect(s.title).toBe(drill.title);
    expect(s.description).toBe(drill.description);
    expect(s.category).toEqual(drill.category);
    expect(s.level).toBe(drill.level);
    expect(s.intensity).toBe(drill.intensity);
    expect(s.format).toBe(drill.format);
    expect(s.phases).toEqual(drill.phases);
    expect(s.space).toBe(drill.space);
    expect(s.age).toEqual({ min: drill.ageMin, max: drill.ageMax });
    expect(s.players).toEqual({ min: drill.playersMin, max: drill.playersMax });
    expect(s.duration).toEqual({ min: drill.durationMin, max: drill.durationMax });
    expect(s.equipment).toEqual(
      drill.equipment.map((e) => ({
        key: e.key,
        name: e.name,
        rule: e.rule,
        quantity: e.quantity,
      })),
    );
    expect((s.skills as { primary: { key: string } }).primary.key).toBe(
      drill.skills.find((k) => k.role === "primary")!.key,
    );
    expect(s.content).toEqual(drill.content); // setup, organization, instructions, coaching points, mistakes, safety, progressions, regressions, variations, resources
    expect(s.diagrams).toEqual(drill.diagrams.map((g) => ({ title: g.title, diagram: g.diagram })));
    expect(s.provenance).toMatchObject({
      drillId: library.id,
      drillVersion: drill.version,
      scope: "library",
      sourceKind: "original",
    });
    expect(new Date(s.provenance.capturedAt as string).getTime()).toBeGreaterThan(
      Date.now() - 60_000,
    );
  });

  it("carries sub-skills, and a drill with diagrams keeps them", async () => {
    const [d] = await db
      .select({ id: drills.id })
      .from(drills)
      .where(eq(drills.seedKey, "ball-screen-2v2"));
    const { id, version } = await makePlan(coach);
    good(await drillAct(coach, id, d!.id, version));
    const s = (await load(coach, id))!.activities[0]!.snapshot as {
      skills: { primary: { key: string }; secondary: unknown[] };
      diagrams: unknown[];
    };
    expect(s.skills.primary.key).toBe("pick_and_roll");
    expect(s.skills.secondary.length).toBeGreaterThan(0);
    expect(s.diagrams.length).toBeGreaterThan(0);
  });

  it("SESSION A KEEPS WHAT THE COACH CHOSE: editing the library drill later changes nothing in it", async () => {
    const { id, version } = await makePlan(admin, { visibility: "organization" });
    good(await drillAct(admin, id, bobsDrill.id, version));
    const before = (await load(admin, id))!.activities[0]!;
    expect(before.title).toBe("3v3 Closeout Game");
    const beforeSnapshot = JSON.stringify(before.snapshot);

    const edited = await changeDrill({
      title: "3v3 Closeout Game — v2",
      description: "A completely rewritten description of the drill, so any leak would show.",
      level: "advanced",
      content: {
        objective: "A NEW objective.",
        setup: "A NEW setup.",
        instructions: ["A NEW step."],
        coachingPoints: ["A NEW point."],
      },
    });
    expect(edited.version).toBeGreaterThan(1);
    expect(edited.title).toBe("3v3 Closeout Game — v2");

    const after = (await load(admin, id))!.activities[0]!;
    expect(after.title).toBe("3v3 Closeout Game");
    expect(JSON.stringify(after.snapshot)).toBe(beforeSnapshot);
    expect((after.snapshot as { content: { setup: string } }).content.setup).not.toBe(
      "A NEW setup.",
    );
    // the only thing that changed is the honest note that a newer version exists
    expect(after.source.status).toBe("update_available");
    expect(after.source.drillVersion).toBe(1);
  });

  it("…and the coach can DELIBERATELY update it: the copy is replaced, customization cleared, the reason recorded", async () => {
    const { id, version } = await makePlan(admin, { visibility: "organization" });
    let v = good(
      await drillAct(admin, id, bobsDrill.id, version, {
        durationMin: 14,
        notes: "Keep me",
        players: 9,
      }),
    ).version;
    const drillNow = await changeDrill({
      content: {
        objective: "Fresh objective.",
        setup: "Fresh setup.",
        instructions: ["Fresh step."],
        coachingPoints: ["Fresh point."],
      },
    });
    const a = (await load(admin, id))!.activities[0]!;
    v = good(
      await replaceActivityDrill(admin, SPORT, id, a.id, {
        version: v,
        changeReason: "Coach improved the drill",
      }),
    ).version;

    const b = (await load(admin, id))!.activities[0]!;
    expect((b.snapshot as { content: { setup: string } }).content.setup).toBe("Fresh setup.");
    expect(b.source).toMatchObject({ drillVersion: drillNow.version, status: "current" });
    expect(b.changeReason).toBe("Coach improved the drill");
    expect(b.customized).toBe(false);
    // what the coach decided about the session is untouched
    expect(b).toMatchObject({ durationMin: 14, notes: "Keep me", players: 9, position: 0 });
    expect(v).toBeGreaterThan(version);
  });

  it("can also swap in a different drill, keeping the slot", async () => {
    const { id, version } = await makePlan(coach);
    let v = good(await drillAct(coach, id, bobsDrill.id, version, { durationMin: 11 })).version;
    v = good(await customAct(coach, id, v, { title: "After" })).version;
    const a = (await load(coach, id))!.activities[0]!;
    good(await replaceActivityDrill(coach, SPORT, id, a.id, { drillId: library.id, version: v }));
    const p = (await load(coach, id))!;
    expect(p.activities.map((x) => x.position)).toEqual([0, 1]);
    expect(p.activities[0]).toMatchObject({
      title: (await getDrill(coach, SPORT, library.id))!.title,
      durationMin: 11,
      source: { drillId: library.id },
    });
  });

  it("nothing ever updates a copy automatically: reading, listing and editing the session leave it alone", async () => {
    const { id, version } = await makePlan(coach);
    good(await drillAct(coach, id, bobsDrill.id, version));
    const snap = () =>
      tenantTx(
        coach,
        async (tx) =>
          (
            await tx
              .select({ s: planActivities.snapshot, v: planActivities.sourceDrillVersion })
              .from(planActivities)
              .where(eq(planActivities.planId, id))
          )[0],
      );
    const before = JSON.stringify(await snap());
    await changeDrill({ title: "3v3 Closeout Game (renamed again)" });
    await load(coach, id);
    await listPlans(coach, SPORT);
    good(await updatePlan(coach, SPORT, id, planInput({ title: "Renamed session", version: 2 })));
    expect(JSON.stringify(await snap())).toBe(before);
  });

  it("customizing the copy marks it, keeps its provenance, and never touches the library drill", async () => {
    const { id, version } = await makePlan(coach);
    const v = good(await drillAct(coach, id, library.id, version)).version;
    const a = (await load(coach, id))!.activities[0]!;
    const original = a.snapshot as {
      content: { setup: string; instructions: string[] };
      provenance: unknown;
    };
    good(
      await edit(coach, id, a.id, v, {
        content: { setup: "Set up with six cones instead.", instructions: ["Only step."] },
        changeReason: "Small gym",
      }),
    );
    const b = (await load(coach, id))!.activities[0]!;
    expect(b.customized).toBe(true);
    expect(b.changeReason).toBe("Small gym");
    const s = b.snapshot as typeof original;
    expect(s.content.setup).toBe("Set up with six cones instead.");
    expect(s.content.instructions).toEqual(["Only step."]);
    expect(s.provenance).toEqual(original.provenance);
    // the library drill is exactly as before
    expect((await getDrill(coach, SPORT, library.id))!.content.setup).toBe(original.content.setup);
    // an edit that changes nothing does not mark anything
    const other = await makePlan(coach);
    const v2 = good(await drillAct(coach, other.id, library.id, other.version)).version;
    const a2 = (await load(coach, other.id))!.activities[0]!;
    good(
      await edit(coach, other.id, a2.id, v2, {
        content: { setup: (a2.snapshot as typeof original).content.setup },
      }),
    );
    expect((await load(coach, other.id))!.activities[0]!.customized).toBe(false);
  });

  it("rejects an edit that would make the copied content invalid, and a field it does not have", async () => {
    const { id, version } = await makePlan(coach);
    const v = good(await drillAct(coach, id, library.id, version)).version;
    const a = (await load(coach, id))!.activities[0]!;
    const empty = await edit(coach, id, a.id, v, { content: { instructions: [] } });
    expect(empty).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { "content.instructions": ["content_invalid"] } },
    });
    const unknown = await edit(coach, id, a.id, v, { content: { favouriteColour: "red" } });
    expect(codeOf(unknown)).toBe("VALIDATION");
    expect((await load(coach, id))!.version).toBe(v); // nothing was consumed
  });

  it("a custom activity's text can be edited too (it is the coach's own, so it is never 'customized')", async () => {
    const { id, version } = await makePlan(coach);
    const v = good(
      await customAct(coach, id, version, { content: { description: "Old" } }),
    ).version;
    const a = (await load(coach, id))!.activities[0]!;
    good(
      await edit(coach, id, a.id, v, {
        content: { description: "New", coachingPoints: ["Talk less"] },
      }),
    );
    const b = (await load(coach, id))!.activities[0]!;
    expect(b.snapshot).toMatchObject({ description: "New", coachingPoints: ["Talk less"] });
    expect(b.customized).toBe(false);
  });

  it("only drills the actor may read and that are published can be added — anything else is 'not found'", async () => {
    const priv = good(
      await createDrill(
        coach,
        SPORT,
        drillInput({ title: "Bob Private Drill", visibility: "private" }),
      ),
    );
    const shared = good(
      await createDrill(
        coach,
        SPORT,
        drillInput({ title: "Bob Shared Two", visibility: "organization" }),
      ),
    );
    const foreign = good(
      await createDrill(
        outsider,
        SPORT,
        drillInput({ title: "Otto Shared", visibility: "organization" }),
      ),
    );
    const evesPlan = await makePlan(admin, { visibility: "organization" });

    expect(codeOf(await drillAct(admin, evesPlan.id, priv.id, evesPlan.version))).toBe("NOT_FOUND"); // a colleague's private drill
    expect(codeOf(await drillAct(admin, evesPlan.id, foreign.id, evesPlan.version))).toBe(
      "NOT_FOUND",
    ); // another workspace's
    expect(
      codeOf(
        await drillAct(
          admin,
          evesPlan.id,
          "0192a000-0000-7000-8000-0000000000ff",
          evesPlan.version,
        ),
      ),
    ).toBe("NOT_FOUND");
    expect(codeOf(await drillAct(admin, evesPlan.id, shared.id, evesPlan.version))).toBe("OK");

    // an archived drill is no longer offered
    good(await archiveDrill(coach, SPORT, shared.id));
    const evesPlan2 = await makePlan(admin);
    expect(codeOf(await drillAct(admin, evesPlan2.id, shared.id, evesPlan2.version))).toBe(
      "NOT_FOUND",
    );
    // the owner of a private drill may use it in their own session
    const bobsPlan = await makePlan(coach);
    expect(codeOf(await drillAct(coach, bobsPlan.id, priv.id, bobsPlan.version))).toBe("OK");
    // and a failed attempt consumed nothing
    expect((await load(admin, evesPlan2.id))!.version).toBe(evesPlan2.version);
  });

  it("a drill that becomes unavailable later leaves the session intact: the copy is complete, editable and printable", async () => {
    const d = good(
      await createDrill(
        coach,
        SPORT,
        drillInput({ title: "Soon Private Drill", visibility: "organization" }),
      ),
    );
    const { id, version } = await makePlan(admin, { visibility: "organization" });
    let v = good(await drillAct(admin, id, d.id, version, { durationMin: 9 })).version;
    v = good(await customAct(admin, id, v, { title: "Second" })).version;
    const before = (await load(admin, id))!.activities[0]!;

    const cur = (await getDrill(coach, SPORT, d.id))!;
    good(
      await updateDrill(coach, SPORT, d.id, {
        ...drillInput({ title: cur.title, visibility: "private" }),
        version: cur.version,
      }),
    );
    expect(await getDrill(admin, SPORT, d.id)).toBeNull(); // the admin can no longer see it

    const after = (await load(admin, id))!.activities[0]!;
    expect(after.snapshotValid).toBe(true);
    expect(JSON.stringify(after.snapshot)).toBe(JSON.stringify(before.snapshot));
    expect(after.source.status).toBe("unavailable");
    // still fully workable
    v = good(
      await edit(admin, id, after.id, v, { durationMin: 12, notes: "still editable" }),
    ).version;
    const ids = (await load(admin, id))!.activities.map((a) => a.id);
    v = good(
      await reorderActivities(
        admin,
        SPORT,
        id,
        reorderActivitiesSchema.parse({ orderedIds: [...ids].reverse(), version: v }),
      ),
    ).version;
    // but it cannot be added again, nor refreshed from a source she cannot read
    expect(codeOf(await drillAct(admin, id, d.id, v))).toBe("NOT_FOUND");
    expect(codeOf(await replaceActivityDrill(admin, SPORT, id, after.id, { version: v }))).toBe(
      "NOT_FOUND",
    );
    expect((await load(admin, id))!.activities.find((a) => a.id === after.id)!.title).toBe(
      before.title,
    );
  });

  it("if the source drill row is gone entirely, only the link is cut", async () => {
    const d = good(
      await createDrill(
        coach,
        SPORT,
        drillInput({ title: "Doomed Drill Two", visibility: "organization" }),
      ),
    );
    const { id, version } = await makePlan(coach);
    good(await drillAct(coach, id, d.id, version));
    const superuser = adminPool();
    try {
      await superuser.query(`delete from drills where id = $1`, [d.id]);
    } finally {
      await superuser.end();
    }
    const a = (await load(coach, id))!.activities[0]!;
    expect(a).toMatchObject({
      kind: "drill",
      snapshotValid: true,
      source: { drillId: null, status: "unavailable" },
    });
    expect((a.snapshot as { title: string }).title).toBe("Doomed Drill Two");
  });

  it("a stored snapshot this code cannot read is reported, not guessed at, and does not take the session down", async () => {
    const { id, version } = await makePlan(coach);
    const v = good(await drillAct(coach, id, library.id, version)).version;
    good(await customAct(coach, id, v, { title: "Fine" }));
    const superuser = adminPool();
    try {
      await superuser.query(
        `update plan_activities set snapshot = jsonb_set(snapshot, '{schemaVersion}', '9') where plan_id = $1 and kind = 'drill'`,
        [id],
      );
    } finally {
      await superuser.end();
    }
    const p = (await load(coach, id))!;
    expect(p.activities[0]).toMatchObject({ kind: "drill", snapshot: null, snapshotValid: false });
    expect(p.activities[1]).toMatchObject({ title: "Fine", snapshotValid: true });
  });

  it("stored session details from a version this code does not know make the session unreadable rather than wrong", async () => {
    const { id } = await makePlan(coach);
    const superuser = adminPool();
    try {
      await superuser.query(
        `update plans set details = '{"schemaVersion": 7, "location": "x"}' where id = $1`,
        [id],
      );
    } finally {
      await superuser.end();
    }
    expect(await load(coach, id)).toBeNull();
  });

  it("a different workspace's snapshot is its own: coaches never see each other's copies", async () => {
    const mine = await makePlan(coach, { visibility: "organization" });
    good(await drillAct(coach, mine.id, library.id, mine.version));
    expect(await load(outsider, mine.id)).toBeNull();
    const rows = await tenantTx(outsider, (tx) =>
      tx.select().from(planActivities).where(eq(planActivities.planId, mine.id)),
    );
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("lifecycle: draft, published, archived", () => {
  it("moves between the three states, records each change, and keeps the timeline", async () => {
    const created = await makePlan(coach);
    let v = good(await customAct(coach, created.id, created.version)).version;
    v = good(await setPlanStatus(coach, SPORT, created.id, "published", v)).version;
    expect((await load(coach, created.id))!.status).toBe("published");
    // a published (final) session can still be edited
    v = good(await customAct(coach, created.id, v, { title: "Late change" })).version;
    v = good(await setPlanStatus(coach, SPORT, created.id, "archived", v)).version;
    expect((await load(coach, created.id))!.status).toBe("archived");
    good(await setPlanStatus(coach, SPORT, created.id, "draft", v));
    const p = (await load(coach, created.id))!;
    expect(p.status).toBe("draft");
    expect(p.activities).toHaveLength(2);
    const events = await tenantTx(coach, (tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(
          and(eq(auditEvents.entityId, created.id), eq(auditEvents.action, "plan.status_changed")),
        ),
    );
    expect(events.map((e) => (e.metadata as { from: string; to: string }).to).sort()).toEqual([
      "archived",
      "draft",
      "published",
    ]);
  });

  it("an archived session is frozen — for the commands and for the database", async () => {
    const created = await makePlan(coach);
    let v = good(await customAct(coach, created.id, created.version)).version;
    v = good(await setPlanStatus(coach, SPORT, created.id, "archived", v)).version;
    const p = (await load(coach, created.id))!;
    expect(p.permissions.canEdit).toBe(false);
    expect(
      codeOf(await updatePlan(coach, SPORT, created.id, planInput({ title: "x", version: v }))),
    ).toBe("FORBIDDEN");
    expect(codeOf(await breakAct(coach, created.id, v))).toBe("FORBIDDEN");
    expect(codeOf(await edit(coach, created.id, p.activities[0]!.id, v, { notes: "x" }))).toBe(
      "FORBIDDEN",
    );
    expect(codeOf(await removeActivity(coach, SPORT, created.id, p.activities[0]!.id, v))).toBe(
      "FORBIDDEN",
    );
    expect(codeOf(await drillAct(coach, created.id, library.id, v))).toBe("FORBIDDEN");
    // the database agrees, independently
    const direct = await tenantTx(coach, (tx) =>
      tx.execute(
        sql`update plan_activities set notes = 'sneaky' where plan_id = ${created.id} returning id`,
      ),
    );
    expect(direct.rows).toHaveLength(0);
  });

  it("changing the status needs the current version, and an assistant cannot", async () => {
    const created = await makePlan(coach, { visibility: "organization" });
    expect(codeOf(await setPlanStatus(coach, SPORT, created.id, "published", 99))).toBe("CONFLICT");
    expect(
      codeOf(await setPlanStatus(assistant, SPORT, created.id, "published", created.version)),
    ).toBe("FORBIDDEN");
    expect(
      codeOf(await setPlanStatus(teacher, SPORT, created.id, "published", created.version)),
    ).toBe("FORBIDDEN");
    expect(
      codeOf(await setPlanStatus(admin, SPORT, created.id, "published", created.version)),
    ).toBe("OK");
    // asking for the state it is already in changes nothing
    const now = (await load(coach, created.id))!;
    const same = good(await setPlanStatus(coach, SPORT, created.id, "published", now.version));
    expect(same.version).toBe(now.version);
  });

  it("listings can be filtered by status", async () => {
    const a = await makePlan(coach, { title: "Filter A" });
    const b = await makePlan(coach, { title: "Filter B" });
    good(await setPlanStatus(coach, SPORT, b.id, "published", b.version));
    const drafts = (await listPlans(coach, SPORT, { statuses: ["draft"] }))!.items.map((i) => i.id);
    const published = (await listPlans(coach, SPORT, { statuses: ["published"] }))!.items.map(
      (i) => i.id,
    );
    expect(drafts).toContain(a.id);
    expect(drafts).not.toContain(b.id);
    expect(published).toContain(b.id);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("soft deletion", () => {
  it("hides the session everywhere ordinary, keeps the row, and can be undone", async () => {
    const created = await makePlan(coach, { title: "Delete me", visibility: "organization" });
    good(await customAct(coach, created.id, created.version));
    good(await deletePlan(coach, SPORT, created.id));

    expect(await load(coach, created.id)).toBeNull();
    expect(await load(admin, created.id)).toBeNull();
    expect((await listPlans(coach, SPORT))!.items.map((i) => i.id)).not.toContain(created.id);
    const trash = (await listPlans(coach, SPORT, { trash: true }))!.items.map((i) => i.id);
    expect(trash).toContain(created.id);
    const ghost = (await getPlan(coach, SPORT, created.id, { includeDeleted: true }))!;
    expect(ghost.deletedAt).not.toBeNull();
    expect(ghost.activities).toHaveLength(1); // the timeline is still there
    expect(ghost.permissions.canEdit).toBe(false);

    // the row is still in the table — nothing was erased
    const superuser = adminPool();
    try {
      const { rows } = await superuser.query(`select deleted_at from plans where id = $1`, [
        created.id,
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
    } finally {
      await superuser.end();
    }

    // a deleted session cannot be edited…
    expect(
      codeOf(await updatePlan(coach, SPORT, created.id, planInput({ title: "x", version: 9 }))),
    ).toBe("NOT_FOUND");
    expect(codeOf(await breakAct(coach, created.id, 9))).toBe("NOT_FOUND");
    expect(codeOf(await setPlanStatus(coach, SPORT, created.id, "archived", 9))).toBe("NOT_FOUND");
    // …until it is restored, with everything in it
    good(await restorePlan(coach, SPORT, created.id));
    const back = (await load(coach, created.id))!;
    expect(back.title).toBe("Delete me");
    expect(back.activities).toHaveLength(1);
    expect((await listPlans(coach, SPORT))!.items.map((i) => i.id)).toContain(created.id);
    expect((await listPlans(coach, SPORT, { trash: true }))!.items.map((i) => i.id)).not.toContain(
      created.id,
    );
  });

  it("deleting and restoring are idempotent and audited", async () => {
    const created = await makePlan(coach);
    good(await deletePlan(coach, SPORT, created.id));
    good(await deletePlan(coach, SPORT, created.id));
    good(await restorePlan(coach, SPORT, created.id));
    good(await restorePlan(coach, SPORT, created.id));
    const events = await tenantTx(coach, (tx) =>
      tx.select().from(auditEvents).where(eq(auditEvents.entityId, created.id)),
    );
    expect(events.map((e) => e.action).sort()).toEqual([
      "plan.created",
      "plan.deleted",
      "plan.restored",
    ]);
  });

  it("only those who may change a session may delete it; another workspace cannot even tell it exists", async () => {
    const shared = await makePlan(coach, { visibility: "organization" });
    expect(codeOf(await deletePlan(teacher, SPORT, shared.id))).toBe("FORBIDDEN");
    expect(codeOf(await deletePlan(assistant, SPORT, shared.id))).toBe("FORBIDDEN");
    expect(codeOf(await deletePlan(outsider, SPORT, shared.id))).toBe("NOT_FOUND");
    expect(codeOf(await deletePlan(admin, SPORT, shared.id))).toBe("OK");
    expect(codeOf(await restorePlan(teacher, SPORT, shared.id))).toBe("FORBIDDEN");
    const priv = await makePlan(coach, { visibility: "private" });
    expect(codeOf(await deletePlan(owner, SPORT, priv.id))).toBe("NOT_FOUND");
    expect(await load(coach, priv.id)).not.toBeNull();
  });

  it("the trash lists only the viewer's readable, deleted sessions", async () => {
    const shared = await makePlan(coach, { visibility: "organization" });
    const priv = await makePlan(coach, { visibility: "private" });
    good(await deletePlan(coach, SPORT, shared.id));
    good(await deletePlan(coach, SPORT, priv.id));
    const adminTrash = (await listPlans(admin, SPORT, { trash: true }))!.items.map((i) => i.id);
    expect(adminTrash).toContain(shared.id);
    expect(adminTrash).not.toContain(priv.id);
    expect(
      (await listPlans(outsider, SPORT, { trash: true }))!.items.map((i) => i.id),
    ).not.toContain(shared.id);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("listing", () => {
  it("pages, filters to my own, and carries the calculated totals", async () => {
    const who = await createTestActor("Lister");
    for (let i = 0; i < 5; i++) {
      const p = await makePlan(who, { title: `List ${i}` });
      good(await customAct(who, p.id, p.version, { durationMin: 10 + i }));
    }
    const all = (await listPlans(who, SPORT))!;
    expect(all.total).toBe(5);
    expect(all.items).toHaveLength(5);
    expect(all.items.map((i) => i.totalMinutes).sort()).toEqual([10, 11, 12, 13, 14]);
    const p1 = (await listPlans(who, SPORT, { limit: 2, offset: 0 }))!;
    const p2 = (await listPlans(who, SPORT, { limit: 2, offset: 2 }))!;
    const p3 = (await listPlans(who, SPORT, { limit: 2, offset: 4 }))!;
    expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([2, 2, 1]);
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((i) => i.id)).size).toBe(5);
    expect(p1.total).toBe(5);
    // newest change first
    const stamps = all.items.map((i) => i.updatedAt.getTime());
    expect(stamps).toEqual([...stamps].sort((x, y) => y - x));
    expect((await listPlans(who, SPORT, { mineOnly: true }))!.total).toBe(5);
    expect(await listPlans(who, "hockey")).toBeNull();
  });

  it("carries team, age group and level for the library screen", async () => {
    const who = await createTestActor("Lister Two");
    const { id } = await makePlan(who, {
      title: "Carried",
      teamName: "Wolves",
      ageGroup: "u16",
      level: "advanced",
    });
    const item = (await listPlans(who, SPORT))!.items.find((i) => i.id === id)!;
    expect(item).toMatchObject({
      teamName: "Wolves",
      ageGroup: { key: "u16", name: "U16" },
      level: "advanced",
      status: "draft",
      visibility: "private",
      isMine: true,
      targetMinutes: 90,
    });
  });
});
