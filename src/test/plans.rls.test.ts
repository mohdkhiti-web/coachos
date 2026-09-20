import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { ageGroups, planActivities, planObjectives, plans } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { db, pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import { createDrill, updateDrill } from "@/modules/drills/commands";
import { getDrill } from "@/modules/drills/queries";
import { createTestActor } from "./factories";
import { createClub, drillInput, expectDbError } from "./drill-fixtures";
import {
  adminPool,
  bareSnapshot,
  basketballId,
  footballId,
  libraryDrill,
  rawActivity,
  rawPlan,
  skillIdOf,
} from "./plan-fixtures";

/**
 * Sessions (plans), their objectives and their timeline, exercised against real PostgreSQL as the real
 * runtime role (coachos_app). Every statement here goes straight to the database: no command, no `can()`.
 * The point is that the DATABASE refuses what must be refused, whatever the application does (ARCHITECTURE.md §19).
 */

let BB: string; // basketball
let FB: string; // football: a real sport row the app has not switched on — ideal for "wrong sport" tests
let owner: Actor; // club owner
let admin: Actor;
let coach: Actor; // Bob
let teacher: Actor;
let assistant: Actor;
let outsider: Actor; // a member of a DIFFERENT workspace (her own personal one)
let stranger: Actor; // a user with a valid user id, in the club's context, but not a member of it
let library: { id: string; version: number };

const rows = async (actor: Actor, query: ReturnType<typeof sql>) =>
  (await tenantTx(actor, (tx) => tx.execute(query))).rows as Array<Record<string, unknown>>;
const count = async (actor: Actor, table: string, where = sql`true`) =>
  Number(
    (await rows(actor, sql`select count(*)::int as n from ${sql.raw(table)} where ${where}`))[0]!.n,
  );

const plan = (actor: Actor, over: Partial<typeof plans.$inferInsert> = {}) =>
  rawPlan(actor, BB, over);
const activity = (
  actor: Actor,
  planId: string,
  over: Partial<typeof planActivities.$inferInsert> = {},
) => rawActivity(actor, planId, BB, over);

beforeAll(async () => {
  BB = await basketballId();
  FB = await footballId();
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
  const s = await createTestActor("Sam Stranger");
  stranger = { ...s, organizationId: owner.organizationId }; // valid user, claims the club, is not in it
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------------------------------
describe("age groups (reference data)", () => {
  it("has the basketball bands in order, with numeric ages, as read-only reference data", async () => {
    const groups = await db
      .select()
      .from(ageGroups)
      .where(eq(ageGroups.sportId, BB))
      .orderBy(ageGroups.sortOrder);
    expect(groups.map((g) => g.key)).toEqual(["u8", "u10", "u12", "u14", "u16", "u18", "senior"]);
    expect(groups.map((g) => g.name)).toEqual(["U8", "U10", "U12", "U14", "U16", "U18", "Senior"]);
    for (const g of groups) expect(g.ageMin).toBeLessThanOrEqual(g.ageMax);
    // the bands do not overlap and leave no gap
    for (let i = 1; i < groups.length; i++)
      expect(groups[i]!.ageMin, groups[i]!.key).toBe(groups[i - 1]!.ageMax + 1);
  });

  it("the runtime role can read them but never change them", async () => {
    await expectDbError(
      db.execute(
        sql`insert into age_groups (id, sport_id, key, name, age_min, age_max) values (${newId()}, ${BB}, 'u99', 'U99', 5, 6)`,
      ),
      /permission denied/,
    );
    await expectDbError(db.execute(sql`update age_groups set age_max = 99`), /permission denied/);
    await expectDbError(db.execute(sql`delete from age_groups`), /permission denied/);
  });

  it("a band's ages are checked, and its key is unique per sport", async () => {
    const admin = adminPool();
    try {
      await expectDbError(
        admin.query(
          `insert into age_groups (id, sport_id, key, name, age_min, age_max) values ($1, $2, 'bad', 'Bad', 12, 10)`,
          [newId(), BB],
        ),
        /age_groups_age_chk/,
      );
      await expectDbError(
        admin.query(
          `insert into age_groups (id, sport_id, key, name, age_min, age_max) values ($1, $2, 'u12', 'Dup', 11, 12)`,
          [newId(), BB],
        ),
        /age_groups_sport_key_uq/,
      );
    } finally {
      await admin.end();
    }
  });
});

// ---------------------------------------------------------------------------------------------------
describe("creating a session: who may, and where", () => {
  it("an author creates a session in their own workspace, as themselves", async () => {
    for (const a of [owner, admin, coach, teacher]) {
      const id = await plan(a, { title: `By ${a.role}` });
      expect(await count(a, "plans", sql`id = ${id}`)).toBe(1);
    }
  });

  it("defaults: a private draft training session, version 1, not deleted, empty objective and details", async () => {
    const id = await plan(coach);
    const [row] = await tenantTx(coach, (tx) => tx.select().from(plans).where(eq(plans.id, id)));
    expect(row).toMatchObject({
      type: "training_session",
      status: "draft",
      visibility: "private",
      version: 1,
      deletedAt: null,
      objective: "",
      teamName: null,
      scheduledDate: null,
      startTime: null,
      timezone: null,
      details: { schemaVersion: 1 },
    });
  });

  it("an assistant reads but never creates, even in their own workspace", async () => {
    await expectDbError(plan(assistant), /row-level security/);
  });

  it("nobody creates a session as someone else", async () => {
    await expectDbError(plan(coach, { createdBy: teacher.userId }), /row-level security/);
    await expectDbError(plan(coach, { createdBy: null }), /row-level security/);
  });

  it("nobody creates a session in another workspace", async () => {
    await expectDbError(
      plan(coach, { organizationId: outsider.organizationId }),
      /row-level security/,
    );
    await expectDbError(
      plan(outsider, { organizationId: owner.organizationId }),
      /row-level security/,
    );
  });

  it("claiming a workspace is not enough: the user must really be an author member of it", async () => {
    await expectDbError(plan(stranger), /row-level security/);
  });

  it("a session cannot be born deleted", async () => {
    await expectDbError(plan(coach, { deletedAt: new Date() }), /row-level security/);
  });

  it("the sport, the age group and the sport of the age group must agree", async () => {
    const [u12] = await db.select().from(ageGroups).where(eq(ageGroups.key, "u12"));
    expect(await plan(coach, { ageGroupId: u12!.id })).toBeTruthy();
    // a football session with a basketball age group
    await expectDbError(
      plan(coach, { sportId: FB, ageGroupId: u12!.id }),
      /plans_age_group_sport_fk/,
    );
  });

  it("without any context (no user, no workspace) nothing can be read or written", async () => {
    expect((await pool.query("select count(*)::int as n from plans")).rows[0].n).toBe(0);
    await expectDbError(
      pool.query(
        `insert into plans (id, organization_id, sport_id, title, target_minutes) values ($1, $2, $3, 'x', 90)`,
        [newId(), owner.organizationId, BB],
      ),
      /row-level security/,
    );
  });
});

// ---------------------------------------------------------------------------------------------------
describe("visibility and editing rights", () => {
  let priv: string; // coach's private session
  let shared: string; // coach's workspace-visible session

  beforeAll(async () => {
    priv = await plan(coach, { title: "Private", visibility: "private" });
    shared = await plan(coach, { title: "Shared", visibility: "organization" });
  });

  it("a private session is visible to its creator only — not to owner, admin, teacher or assistant", async () => {
    expect(await count(coach, "plans", sql`id = ${priv}`)).toBe(1);
    for (const other of [owner, admin, teacher, assistant])
      expect(await count(other, "plans", sql`id = ${priv}`), other.role).toBe(0);
  });

  it("a workspace session is visible to every member of the workspace", async () => {
    for (const a of [coach, owner, admin, teacher, assistant])
      expect(await count(a, "plans", sql`id = ${shared}`), a.role).toBe(1);
  });

  it("nobody outside the workspace sees either", async () => {
    expect(await count(outsider, "plans", sql`id in (${priv}, ${shared})`)).toBe(0);
    // Reads trust the request context (`app.org_id`, set from a verified membership) — exactly as drills do — so a
    // "stranger" who somehow claims the club would see its WORKSPACE sessions, but never a private one…
    expect(await count(stranger, "plans", sql`id in (${priv}, ${shared})`)).toBe(1);
  });

  it("…which is why writes ALSO check real membership: a stranger claiming the workspace changes nothing", async () => {
    const changed = await rows(
      stranger,
      sql`update plans set title = 'pwned' where id = ${shared} returning id`,
    );
    expect(changed).toHaveLength(0);
    expect(await count(coach, "plans", sql`id = ${shared} and title = 'Shared'`)).toBe(1);
  });

  it("the creator edits; a colleague coach or teacher edits nothing of theirs; owner/admin edit workspace sessions", async () => {
    const edit = (a: Actor, id: string, title: string) =>
      rows(a, sql`update plans set title = ${title} where id = ${id} returning id`);
    expect(await edit(coach, shared, "Shared v2")).toHaveLength(1);
    expect(await edit(teacher, shared, "hijack")).toHaveLength(0);
    expect(await edit(assistant, shared, "hijack")).toHaveLength(0);
    expect(await edit(owner, shared, "Shared v3")).toHaveLength(1);
    expect(await edit(admin, shared, "Shared v4")).toHaveLength(1);
    expect(await edit(outsider, shared, "hijack")).toHaveLength(0);
    expect(await count(coach, "plans", sql`id = ${shared} and title = 'Shared v4'`)).toBe(1);
  });

  it("not even the owner or an admin edits a colleague's PRIVATE session (they cannot see it)", async () => {
    for (const a of [owner, admin]) {
      const r = await rows(a, sql`update plans set title = 'nope' where id = ${priv} returning id`);
      expect(r, a.role).toHaveLength(0);
    }
    expect(await count(coach, "plans", sql`id = ${priv} and title = 'Private'`)).toBe(1);
  });

  it("nobody moves a session to another workspace, sport, type or creator", async () => {
    await expectDbError(
      tenantTx(coach, (tx) =>
        tx
          .update(plans)
          .set({ organizationId: outsider.organizationId })
          .where(eq(plans.id, shared)),
      ),
      /row-level security|immutable/,
    );
    await expectDbError(
      tenantTx(coach, (tx) => tx.update(plans).set({ sportId: FB }).where(eq(plans.id, shared))),
      /immutable/,
    );
    await expectDbError(
      tenantTx(coach, (tx) =>
        tx.update(plans).set({ createdBy: teacher.userId }).where(eq(plans.id, shared)),
      ),
      /immutable|row-level security/,
    );
    await expectDbError(
      tenantTx(owner, (tx) =>
        tx.update(plans).set({ createdBy: owner.userId }).where(eq(plans.id, shared)),
      ),
      /immutable/,
    );
  });

  it("the runtime role can never DELETE a session (they are archived or soft-deleted)", async () => {
    await expectDbError(
      tenantTx(coach, (tx) => tx.execute(sql`delete from plans where id = ${priv}`)),
      /permission denied/,
    );
  });

  it("the totals view is read with the caller's rights: it never shows sessions the caller cannot see", async () => {
    const idsFor = async (a: Actor) =>
      (
        await rows(a, sql`select plan_id from plan_totals where plan_id in (${priv}, ${shared})`)
      ).map((r) => r.plan_id);
    expect(await idsFor(coach)).toHaveLength(2);
    expect(await idsFor(teacher)).toEqual([shared]);
    expect(await idsFor(outsider)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("session constraints", () => {
  const bad: Array<[string, Partial<typeof plans.$inferInsert>, RegExp]> = [
    ["an empty title", { title: "" }, /plans_title_len_chk/],
    ["a 121-character title", { title: "x".repeat(121) }, /plans_title_len_chk/],
    ["an empty team name", { teamName: "" }, /plans_team_len_chk/],
    ["an 81-character team name", { teamName: "x".repeat(81) }, /plans_team_len_chk/],
    ["an unknown level", { level: "expert" }, /plans_level_chk/],
    ["zero players", { players: 0 }, /plans_players_chk/],
    ["61 players", { players: 61 }, /plans_players_chk/],
    ["only a minimum age", { ageMin: 10 }, /plans_age_chk/],
    ["only a maximum age", { ageMax: 10 }, /plans_age_chk/],
    ["ages out of order", { ageMin: 14, ageMax: 10 }, /plans_age_chk/],
    ["an age below 3", { ageMin: 2, ageMax: 10 }, /plans_age_chk/],
    ["a 4-minute target", { targetMinutes: 4 }, /plans_target_chk/],
    ["a 481-minute target", { targetMinutes: 481 }, /plans_target_chk/],
    ["a 501-character objective", { objective: "x".repeat(501) }, /plans_objective_len_chk/],
    ["an unknown status", { status: "final" }, /plans_status_chk/],
    [
      "public visibility (sharing comes later, as links)",
      { visibility: "public" },
      /plans_visibility_chk/,
    ],
    ["an unknown type", { type: "lesson_plan" }, /plans_type_chk/],
    ["version 0", { version: 0 }, /plans_version_chk/],
    ["details that are not an object", { details: [] as unknown as object }, /plans_details_chk/],
    [
      "details over 16 KB",
      { details: { schemaVersion: 1, pad: "x".repeat(16001) } },
      /plans_details_chk/,
    ],
    [
      "a start time without a date",
      { startTime: "18:00", timezone: "UTC" },
      /plans_start_needs_date_chk/,
    ],
    [
      "a date without a time zone",
      { scheduledDate: "2025-06-10" },
      /plans_schedule_needs_zone_chk/,
    ],
    [
      "a start time with seconds",
      { scheduledDate: "2025-06-10", startTime: "18:00:30", timezone: "UTC" },
      /plans_start_minutes_chk/,
    ],
    [
      "a time zone that does not exist",
      { scheduledDate: "2025-06-10", startTime: "18:00", timezone: "Mars/Olympus" },
      /unknown time zone/,
    ],
    [
      "an invalid calendar date",
      { scheduledDate: "2025-02-30", timezone: "UTC" },
      /out of range|invalid input syntax/,
    ],
  ];
  for (const [label, values, pattern] of bad) {
    it(`rejects ${label}`, async () => {
      await expectDbError(plan(coach, values), pattern);
    });
  }

  it("accepts a fully specified session, and stores the local schedule exactly as given", async () => {
    const id = await plan(coach, {
      teamName: "U14 Girls",
      level: "intermediate",
      players: 14,
      ageMin: 13,
      ageMax: 14,
      targetMinutes: 90,
      objective: "Get better at closeouts.",
      scheduledDate: "2025-06-10",
      startTime: "18:30",
      timezone: "Europe/Paris",
      details: { schemaVersion: 1, location: "Court 2", coachNotes: "Bring bibs." },
    });
    const [row] = await tenantTx(coach, (tx) => tx.select().from(plans).where(eq(plans.id, id)));
    expect(row).toMatchObject({
      scheduledDate: "2025-06-10",
      startTime: "18:30:00",
      timezone: "Europe/Paris",
      players: 14,
    });
  });

  it("there is no end-time or total-duration column anywhere on the session", async () => {
    const cols = (
      await pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name = 'plans'`,
      )
    ).rows.map((r) => r.column_name);
    expect(cols.filter((c) => /end|total|duration/.test(c))).toEqual([]);
    expect(cols).toEqual(
      expect.arrayContaining(["scheduled_date", "start_time", "timezone", "target_minutes"]),
    );
  });
});

// ---------------------------------------------------------------------------------------------------
describe("lifecycle: archive, soft delete, restore", () => {
  it("an archived session is frozen: its content cannot change until its status does", async () => {
    const id = await plan(coach);
    await activity(coach, id, { title: "Existing" });
    await tenantTx(coach, (tx) =>
      tx.update(plans).set({ status: "archived" }).where(eq(plans.id, id)),
    );

    await expectDbError(
      tenantTx(coach, (tx) => tx.update(plans).set({ title: "Edited" }).where(eq(plans.id, id))),
      /archived session cannot be edited/,
    );
    // its timeline is frozen too: no adding, changing, removing, reordering
    await expectDbError(activity(coach, id, { position: 1 }), /row-level security/);
    expect(
      await rows(
        coach,
        sql`update plan_activities set duration_min = 20 where plan_id = ${id} returning id`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(coach, sql`delete from plan_activities where plan_id = ${id} returning id`),
    ).toHaveLength(0);

    // …until it is moved out of the archive
    await tenantTx(coach, (tx) =>
      tx.update(plans).set({ status: "draft" }).where(eq(plans.id, id)),
    );
    await tenantTx(coach, (tx) =>
      tx.update(plans).set({ title: "Edited" }).where(eq(plans.id, id)),
    );
    expect(await activity(coach, id, { position: 1 })).toBeTruthy();
  });

  it("a soft-deleted session stays in the table, stays readable for a trash view, and is frozen", async () => {
    const id = await plan(coach, { visibility: "organization" });
    const at = new Date();
    await tenantTx(coach, (tx) => tx.update(plans).set({ deletedAt: at }).where(eq(plans.id, id)));
    expect(await count(coach, "plans", sql`id = ${id} and deleted_at is not null`)).toBe(1);
    expect(await count(teacher, "plans", sql`id = ${id}`)).toBe(1); // visibility rules are unchanged

    await expectDbError(
      tenantTx(coach, (tx) => tx.update(plans).set({ title: "Edited" }).where(eq(plans.id, id))),
      /deleted session cannot be edited/,
    );
    await expectDbError(activity(coach, id), /row-level security/);

    // restoring is the one thing a deleted session allows
    await tenantTx(coach, (tx) =>
      tx.update(plans).set({ deletedAt: null }).where(eq(plans.id, id)),
    );
    expect(await activity(coach, id)).toBeTruthy();
  });

  it("archiving and soft-deleting only need the author rights — an assistant may do neither", async () => {
    const id = await plan(coach, { visibility: "organization" });
    expect(
      await rows(
        assistant,
        sql`update plans set status = 'archived' where id = ${id} returning id`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(assistant, sql`update plans set deleted_at = now() where id = ${id} returning id`),
    ).toHaveLength(0);
  });

  it("erasing a creator's account (ON DELETE SET NULL) works, including for archived and deleted sessions", async () => {
    const ghost = await createTestActor("Ghost Coach");
    const gA = { ...ghost, organizationId: owner.organizationId, role: "coach" as const };
    const admin2 = adminPool();
    try {
      await admin2.query(
        `insert into member (id, organization_id, user_id, role) values ($1, $2, $3, 'coach')`,
        [newId(), owner.organizationId, ghost.userId],
      );
      const live = await plan(gA, { visibility: "organization" });
      const archived = await plan(gA, { visibility: "organization", status: "archived" });
      const deleted = await plan(gA, { visibility: "organization" });
      await tenantTx(gA, (tx) =>
        tx.update(plans).set({ deletedAt: new Date() }).where(eq(plans.id, deleted)),
      );

      await admin2.query(`delete from "user" where id = $1`, [ghost.userId]);

      const after = await rows(
        owner,
        sql`select id, created_by from plans where id in (${live}, ${archived}, ${deleted})`,
      );
      expect(after).toHaveLength(3);
      for (const r of after) expect(r.created_by).toBeNull();
      // an orphaned workspace session is still managed by the owner
      expect(
        await rows(owner, sql`update plans set title = 'Adopted' where id = ${live} returning id`),
      ).toHaveLength(1);
    } finally {
      await admin2.end();
    }
  });

  it("but an ordinary UPDATE cannot clear the creator while the account exists", async () => {
    const id = await plan(coach, { visibility: "organization" });
    await expectDbError(
      tenantTx(coach, (tx) => tx.update(plans).set({ createdBy: null }).where(eq(plans.id, id))),
      /immutable|row-level security/,
    );
  });
});

// ---------------------------------------------------------------------------------------------------
describe("objectives: references into the sport's skills", () => {
  let p: string;
  let shooting: string;
  let decision: string;
  let transition: string;
  const objective = (a: Actor, planId: string, skillId: string, role: string, sportId = BB) =>
    tenantTx(a, (tx) => tx.insert(planObjectives).values({ planId, skillId, sportId, role }));

  beforeAll(async () => {
    p = await plan(coach, { visibility: "organization" });
    shooting = await skillIdOf("shooting_form");
    decision = await skillIdOf("decision_making");
    transition = await skillIdOf("spacing");
  });

  it("one primary and several secondary objectives, all pointing at real catalog skills", async () => {
    await objective(coach, p, shooting, "primary");
    await objective(coach, p, decision, "secondary");
    await objective(coach, p, transition, "secondary");
    const r = await rows(
      coach,
      sql`select s.key, o.role from plan_objectives o join skills s on s.id = o.skill_id where o.plan_id = ${p} order by o.role, s.key`,
    );
    expect(r.map((x) => `${x.role}:${x.key}`)).toEqual(
      expect.arrayContaining([
        "primary:shooting_form",
        "secondary:decision_making",
        "secondary:spacing",
      ]),
    );
    expect(r).toHaveLength(3);
  });

  it("only one primary per session, and a skill only once", async () => {
    await expectDbError(
      objective(coach, p, await skillIdOf("passing"), "primary"),
      /plan_objectives_one_primary_uq/,
    );
    await expectDbError(
      objective(coach, p, decision, "secondary"),
      /plan_objectives_plan_id_skill_id_pk/,
    );
  });

  it("a role is primary or secondary, nothing else", async () => {
    await expectDbError(
      objective(coach, p, await skillIdOf("passing"), "tertiary"),
      /plan_objectives_role_chk/,
    );
  });

  it("a session has at most one primary and four secondary objectives", async () => {
    const q = await plan(coach);
    const keys = ["shooting_form", "passing", "dribbling", "rebounding", "screening", "spacing"];
    await objective(coach, q, await skillIdOf(keys[0]!), "primary");
    for (const k of keys.slice(1, 5)) await objective(coach, q, await skillIdOf(k), "secondary");
    await expectDbError(
      objective(coach, q, await skillIdOf(keys[5]!), "secondary"),
      /at most one primary and four secondary/,
    );
  });

  it("a skill must belong to the session's sport", async () => {
    const football = await plan(coach, { sportId: FB });
    await expectDbError(
      objective(coach, football, shooting, "primary", FB),
      /plan_objectives_skill_fk/,
    );
  });

  it("an objective's own sport must match its session's sport", async () => {
    await expectDbError(
      objective(coach, p, await skillIdOf("passing"), "secondary", FB),
      /plan_objectives_plan_fk|plan_objectives_skill_fk/,
    );
  });

  it("only those who may change the session may add or remove its objectives", async () => {
    const skill = await skillIdOf("rebounding");
    for (const other of [teacher, assistant, outsider, stranger])
      await expectDbError(objective(other, p, skill, "secondary"), /row-level security/);
    expect(
      await rows(teacher, sql`delete from plan_objectives where plan_id = ${p} returning skill_id`),
    ).toHaveLength(0);
    // owner (a manager of the workspace) may
    await objective(owner, p, skill, "secondary");
    expect(
      await rows(
        owner,
        sql`delete from plan_objectives where plan_id = ${p} and skill_id = ${skill} returning skill_id`,
      ),
    ).toHaveLength(1);
  });

  it("objectives of a private session are invisible to everyone but its creator", async () => {
    const q = await plan(coach, { visibility: "private" });
    await objective(coach, q, shooting, "primary");
    expect(await count(coach, "plan_objectives", sql`plan_id = ${q}`)).toBe(1);
    for (const other of [owner, admin, teacher, assistant, outsider])
      expect(await count(other, "plan_objectives", sql`plan_id = ${q}`), other.role).toBe(0);
  });

  it("the runtime role can add and remove objectives but never edit one in place", async () => {
    await expectDbError(
      tenantTx(coach, (tx) =>
        tx.execute(sql`update plan_objectives set role = 'secondary' where plan_id = ${p}`),
      ),
      /permission denied/,
    );
  });
});

// ---------------------------------------------------------------------------------------------------
describe("activities: the timeline", () => {
  let p: string;

  beforeAll(async () => {
    p = await plan(coach, { visibility: "organization" });
  });

  it("holds drills, custom activities and breaks with their own details, in order", async () => {
    const id = await plan(coach);
    await activity(coach, id, {
      position: 0,
      kind: "drill",
      phase: "warm_up",
      title: "Mikan",
      durationMin: 10,
      repetitions: 3,
      players: 12,
      notes: "Both hands.",
      sourceDrillId: library.id,
      sourceDrillVersion: library.version,
      snapshot: bareSnapshot(library.id, library.version),
      customized: false,
      changeReason: null,
    });
    await activity(coach, id, {
      position: 1,
      kind: "custom",
      phase: "skill",
      title: "Team talk",
      durationMin: 5,
      snapshot: { schemaVersion: 1, description: "Goals" },
    });
    await activity(coach, id, {
      position: 2,
      kind: "break",
      phase: null,
      title: "Water",
      durationMin: 2,
    });
    const r = await rows(
      coach,
      sql`select position, kind, title, duration_min from plan_activities where plan_id = ${id} order by position`,
    );
    expect(r.map((x) => [x.position, x.kind, x.title, x.duration_min])).toEqual([
      [0, "drill", "Mikan", 10],
      [1, "custom", "Team talk", 5],
      [2, "break", "Water", 2],
    ]);
  });

  const badActivity: Array<[string, Partial<typeof planActivities.$inferInsert>, RegExp]> = [
    ["a zero duration", { durationMin: 0 }, /plan_activities_duration_chk/],
    ["a negative duration", { durationMin: -5 }, /plan_activities_duration_chk/],
    ["a 241-minute duration", { durationMin: 241 }, /plan_activities_duration_chk/],
    ["a negative position", { position: -1 }, /plan_activities_position_chk/],
    ["position 60 (a 61st activity)", { position: 60 }, /plan_activities_position_chk/],
    ["zero repetitions", { repetitions: 0 }, /plan_activities_repetitions_chk/],
    ["zero players", { players: 0 }, /plan_activities_players_chk/],
    ["61 players", { players: 61 }, /plan_activities_players_chk/],
    ["an unknown phase", { phase: "halftime" }, /plan_activities_phase_chk/],
    ["an unknown kind", { kind: "video" }, /plan_activities_kind_chk/],
    ["an empty title", { title: "" }, /plan_activities_title_len_chk/],
    ["notes over 2000 characters", { notes: "x".repeat(2001) }, /plan_activities_notes_len_chk/],
    ["an empty change reason", { changeReason: "" }, /plan_activities_reason_len_chk/],
  ];
  for (const [label, values, pattern] of badActivity) {
    it(`rejects ${label}`, async () => {
      const id = await plan(coach);
      await expectDbError(activity(coach, id, values), pattern);
    });
  }

  it("each kind must carry exactly what it should", async () => {
    const id = await plan(coach);
    const snap = bareSnapshot(library.id, library.version);
    // a drill needs its snapshot and the version it was copied at, and they must agree
    await expectDbError(activity(coach, id, { kind: "drill" }), /plan_activities_kind_shape_chk/);
    await expectDbError(
      activity(coach, id, { kind: "drill", snapshot: snap }),
      /plan_activities_kind_shape_chk/,
    );
    await expectDbError(
      activity(coach, id, {
        kind: "drill",
        snapshot: snap,
        sourceDrillVersion: library.version + 1,
      }),
      /plan_activities_kind_shape_chk/,
    );
    await expectDbError(
      activity(coach, id, { kind: "drill", snapshot: { schemaVersion: 1 }, sourceDrillVersion: 1 }),
      /plan_activities_kind_shape_chk/,
    );
    // a break has no content and no source
    await expectDbError(
      activity(coach, id, { kind: "break", snapshot: { schemaVersion: 1 } }),
      /plan_activities_kind_shape_chk/,
    );
    await expectDbError(
      activity(coach, id, { kind: "break", sourceDrillId: library.id, sourceDrillVersion: 1 }),
      /plan_activities_kind_shape_chk|not available/,
    );
    // a custom activity has no source drill
    await expectDbError(
      activity(coach, id, { kind: "custom", sourceDrillId: library.id, sourceDrillVersion: 1 }),
      /plan_activities_kind_shape_chk/,
    );
  });

  it("a snapshot must be a versioned JSON object of sane size", async () => {
    const id = await plan(coach);
    const custom = (snapshot: unknown) => activity(coach, id, { kind: "custom", snapshot });
    await expectDbError(custom([]), /plan_activities_snapshot_chk/);
    await expectDbError(custom("text"), /plan_activities_snapshot_chk/);
    await expectDbError(custom({ description: "no version" }), /plan_activities_snapshot_chk/);
    await expectDbError(
      custom({ schemaVersion: 1, description: "x".repeat(200_001) }),
      /plan_activities_snapshot_chk/,
    );
  });

  it("positions are unique per session — checked immediately, so a plain duplicate is refused", async () => {
    const id = await plan(coach);
    await activity(coach, id, { position: 0 });
    await expectDbError(activity(coach, id, { position: 0 }), /plan_activities_position_uq/);
    await activity(coach, id, { position: 1 });
    // …but two DIFFERENT sessions may both have a position 0
    const other = await plan(coach);
    expect(await activity(coach, other, { position: 0 })).toBeTruthy();
  });

  it("a whole reorder — even a swap — is one statement, and the constraint is checked when it ends", async () => {
    const id = await plan(coach);
    const a = await activity(coach, id, { position: 0, title: "A" });
    const b = await activity(coach, id, { position: 1, title: "B" });
    const c = await activity(coach, id, { position: 2, title: "C" });
    await tenantTx(coach, (tx) =>
      tx.execute(
        sql`update plan_activities as a set position = v.pos from (values (${c}::uuid, 0), (${a}::uuid, 1), (${b}::uuid, 2)) as v(id, pos) where a.id = v.id`,
      ),
    );
    const order = await rows(
      coach,
      sql`select title from plan_activities where plan_id = ${id} order by position`,
    );
    expect(order.map((r) => r.title)).toEqual(["C", "A", "B"]);
    // row by row, the same swap is refused
    await expectDbError(
      tenantTx(coach, async (tx) => {
        await tx.execute(sql`update plan_activities set position = 1 where id = ${c}`);
      }),
      /plan_activities_position_uq/,
    );
  });

  it("a session's activities together cannot exceed 720 minutes", async () => {
    const id = await plan(coach);
    await activity(coach, id, { position: 0, durationMin: 240 });
    await activity(coach, id, { position: 1, durationMin: 240 });
    const last = await activity(coach, id, { position: 2, durationMin: 240 });
    await expectDbError(
      activity(coach, id, { position: 3, durationMin: 1 }),
      /longer than 720 minutes/,
    );
    // lengthening an existing one is held to the same limit; shortening frees room
    await tenantTx(coach, (tx) =>
      tx.update(planActivities).set({ durationMin: 200 }).where(eq(planActivities.id, last)),
    );
    expect(await activity(coach, id, { position: 3, durationMin: 40 })).toBeTruthy();
    await expectDbError(
      tenantTx(coach, (tx) =>
        tx.update(planActivities).set({ durationMin: 240 }).where(eq(planActivities.id, last)),
      ),
      /longer than 720 minutes/,
    );
  });

  it("an activity belongs to one session for life", async () => {
    const one = await plan(coach);
    const two = await plan(coach);
    const a = await activity(coach, one);
    await expectDbError(
      tenantTx(coach, (tx) =>
        tx.update(planActivities).set({ planId: two }).where(eq(planActivities.id, a)),
      ),
      /cannot move to another session/,
    );
  });

  it("an activity's sport must match its session's sport, and so must its source drill's", async () => {
    const football = await plan(coach, { sportId: FB });
    await expectDbError(rawActivity(coach, football, BB), /plan_activities_plan_fk/);
    await expectDbError(
      rawActivity(coach, football, FB, {
        kind: "drill",
        sourceDrillId: library.id,
        sourceDrillVersion: library.version,
        snapshot: bareSnapshot(library.id, library.version),
      }),
      /plan_activities_source_fk/,
    );
  });

  it("only those who may change the session may change its timeline", async () => {
    const a = await activity(coach, p, { position: 0, title: "Mine" });
    for (const other of [teacher, assistant, outsider, stranger]) {
      await expectDbError(activity(other, p, { position: 9 }), /row-level security/);
      expect(
        await rows(other, sql`update plan_activities set title = 'x' where id = ${a} returning id`),
        other.role,
      ).toHaveLength(0);
      expect(
        await rows(other, sql`delete from plan_activities where id = ${a} returning id`),
        other.role,
      ).toHaveLength(0);
    }
    // the workspace owner may, since it is a workspace session
    expect(
      await rows(
        owner,
        sql`update plan_activities set title = 'Owner edit' where id = ${a} returning id`,
      ),
    ).toHaveLength(1);
  });

  it("activities of a private session are invisible to everyone but its creator; of a workspace session, to its members", async () => {
    const priv = await plan(coach, { visibility: "private" });
    const a = await activity(coach, priv);
    for (const other of [owner, admin, teacher, assistant, outsider])
      expect(await count(other, "plan_activities", sql`id = ${a}`), other.role).toBe(0);
    const inShared = await activity(coach, p, { position: 5 });
    expect(await count(assistant, "plan_activities", sql`id = ${inShared}`)).toBe(1);
    expect(await count(outsider, "plan_activities", sql`id = ${inShared}`)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("drills inside sessions: reading rights, snapshots that outlive their source", () => {
  let shared: { id: string; version: number }; // Bob's workspace-visible drill
  let priv: { id: string; version: number }; // Bob's private drill
  let evesPlan: string;

  const drillActivity = (
    a: Actor,
    planId: string,
    d: { id: string; version: number },
    position = 0,
  ) =>
    activity(a, planId, {
      position,
      kind: "drill",
      title: "From a drill",
      sourceDrillId: d.id,
      sourceDrillVersion: d.version,
      snapshot: bareSnapshot(d.id, d.version),
    });

  beforeAll(async () => {
    const s = await createDrill(
      coach,
      "basketball",
      drillInput({ title: "Bob Shared Drill", visibility: "organization" }),
    );
    const p = await createDrill(
      coach,
      "basketball",
      drillInput({ title: "Bob Private Drill", visibility: "private" }),
    );
    if (!s.ok || !p.ok) throw new Error("drill fixtures failed");
    shared = { id: s.data.id, version: 1 };
    priv = { id: p.data.id, version: 1 };
    evesPlan = await plan(admin, { visibility: "organization" });
  });

  it("a coach may add a library drill and a colleague's shared drill, and their own private one", async () => {
    const mine = await plan(coach);
    expect(await drillActivity(coach, mine, library, 0)).toBeTruthy();
    expect(await drillActivity(coach, mine, shared, 1)).toBeTruthy();
    expect(await drillActivity(coach, mine, priv, 2)).toBeTruthy();
  });

  it("nobody may add a drill they cannot read: a colleague's PRIVATE drill, even for an admin", async () => {
    await expectDbError(drillActivity(admin, evesPlan, priv), /not available to you/);
    await expectDbError(drillActivity(owner, await plan(owner), priv), /not available to you/);
  });

  it("nor another workspace's drill", async () => {
    const otto = await createDrill(
      outsider,
      "basketball",
      drillInput({ title: "Otto Shared", visibility: "organization" }),
    );
    if (!otto.ok) throw new Error("fixture");
    await expectDbError(
      drillActivity(coach, await plan(coach), { id: otto.data.id, version: 1 }),
      /not available to you/,
    );
  });

  it("a drill that becomes unavailable later never breaks the session that already copied it", async () => {
    const a = await drillActivity(admin, evesPlan, shared, 0);
    // Bob takes the drill back to private: Eve (admin) can no longer read it
    const d = await getDrill(coach, "basketball", shared.id);
    const updated = await updateDrill(coach, "basketball", shared.id, {
      ...drillInput({ title: "Bob Shared Drill", visibility: "private" }),
      version: d!.version,
    });
    expect(updated.ok).toBe(true);
    expect(await count(admin, "drills", sql`id = ${shared.id}`)).toBe(0);

    // the activity is still there, still readable, still editable, still reorderable
    expect(await count(admin, "plan_activities", sql`id = ${a}`)).toBe(1);
    expect(
      await rows(
        admin,
        sql`update plan_activities set duration_min = 12, notes = 'still works' where id = ${a} returning id`,
      ),
    ).toHaveLength(1);
    expect(
      (
        await rows(
          admin,
          sql`select snapshot -> 'provenance' ->> 'drillVersion' as v from plan_activities where id = ${a}`,
        )
      )[0]!.v,
    ).toBe("1");
    // …but she cannot re-point it at, or newly add, a drill she cannot read
    await expectDbError(
      tenantTx(admin, (tx) =>
        tx.execute(
          sql`update plan_activities set source_drill_id = ${priv.id}, source_drill_version = 1 where id = ${a}`,
        ),
      ),
      /not available to you/,
    );
    await expectDbError(drillActivity(admin, evesPlan, shared, 3), /not available to you/);
  });

  it("if the source drill row disappears, only the link is cut: the activity and its snapshot remain", async () => {
    const d = await createDrill(
      coach,
      "basketball",
      drillInput({ title: "Doomed Drill", visibility: "organization" }),
    );
    if (!d.ok) throw new Error("fixture");
    const p = await plan(coach);
    const a = await drillActivity(coach, p, { id: d.data.id, version: 1 });
    const superuser = adminPool();
    try {
      await superuser.query(`delete from drills where id = $1`, [d.data.id]);
    } finally {
      await superuser.end();
    }
    const [row] = await rows(
      coach,
      sql`select source_drill_id, source_drill_version, kind, snapshot is not null as has_snapshot, title from plan_activities where id = ${a}`,
    );
    expect(row).toMatchObject({
      source_drill_id: null,
      source_drill_version: 1,
      kind: "drill",
      has_snapshot: true,
      title: "From a drill",
    });
  });
});

// ---------------------------------------------------------------------------------------------------
describe("plan_totals: the session's length and end time exist only as a calculation", () => {
  const totals = async (a: Actor, id: string) =>
    (
      await rows(
        a,
        sql`select total_minutes, activity_count, to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as starts_at, to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ends_at from plan_totals where plan_id = ${id}`,
      )
    )[0]!;

  it("total = the sum of the activity durations, and follows every change", async () => {
    const id = await plan(coach);
    expect(await totals(coach, id)).toMatchObject({ total_minutes: 0, activity_count: 0 });
    const a = await activity(coach, id, { position: 0, durationMin: 10 });
    await activity(coach, id, { position: 1, durationMin: 15 });
    await activity(coach, id, { position: 2, durationMin: 20 });
    expect(await totals(coach, id)).toMatchObject({ total_minutes: 45, activity_count: 3 });
    await tenantTx(coach, (tx) =>
      tx.update(planActivities).set({ durationMin: 30 }).where(eq(planActivities.id, a)),
    );
    expect(await totals(coach, id)).toMatchObject({ total_minutes: 65, activity_count: 3 });
    await tenantTx(coach, (tx) => tx.execute(sql`delete from plan_activities where id = ${a}`));
    expect(await totals(coach, id)).toMatchObject({ total_minutes: 35, activity_count: 2 });
  });

  it("end = start + total: 18:00 in Paris + 90 minutes is 19:30 Paris time; no schedule, no times", async () => {
    const id = await plan(coach, {
      scheduledDate: "2025-06-10",
      startTime: "18:00",
      timezone: "Europe/Paris",
    });
    await activity(coach, id, { position: 0, durationMin: 60 });
    await activity(coach, id, { position: 1, durationMin: 30 });
    const t = await totals(coach, id);
    expect(t.starts_at).toBe("2025-06-10T16:00:00Z");
    expect(t.ends_at).toBe("2025-06-10T17:30:00Z");

    // lengthen one activity: the end moves, and NOTHING on the session row had to be touched
    const before = await rows(coach, sql`select version, updated_at from plans where id = ${id}`);
    await tenantTx(coach, (tx) =>
      tx.execute(
        sql`update plan_activities set duration_min = 75 where plan_id = ${id} and position = 1`,
      ),
    );
    const t2 = await totals(coach, id);
    expect(t2.ends_at).toBe("2025-06-10T18:15:00Z"); // 16:00Z + 60 + 75 minutes
    expect(await rows(coach, sql`select version, updated_at from plans where id = ${id}`)).toEqual(
      before,
    );

    const unscheduled = await plan(coach);
    await activity(coach, unscheduled);
    expect(await totals(coach, unscheduled)).toMatchObject({
      starts_at: null,
      ends_at: null,
      total_minutes: 10,
    });
  });

  it("changing the time zone moves the instants, not the wall-clock time the coach chose", async () => {
    const id = await plan(coach, {
      scheduledDate: "2025-06-10",
      startTime: "18:00",
      timezone: "Europe/Paris",
    });
    await tenantTx(coach, (tx) =>
      tx.update(plans).set({ timezone: "Asia/Tokyo" }).where(eq(plans.id, id)),
    );
    expect((await totals(coach, id)).starts_at).toBe("2025-06-10T09:00:00Z");
  });

  it("is read through the caller's row-level security", async () => {
    const id = await plan(coach, { visibility: "private" });
    await activity(coach, id, { durationMin: 33 });
    expect(await rows(teacher, sql`select 1 from plan_totals where plan_id = ${id}`)).toHaveLength(
      0,
    );
    expect((await totals(coach, id)).total_minutes).toBe(33);
  });

  it("is read-only for the runtime role", async () => {
    await expectDbError(
      tenantTx(coach, (tx) => tx.execute(sql`update plan_totals set total_minutes = 1`)),
      /permission denied|cannot update view|cannot change/,
    );
  });
});
