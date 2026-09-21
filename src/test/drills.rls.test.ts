import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { SEED_DRILLS } from "@/db/seed/drills";
import { seedAll } from "@/db/seed/run";
import {
  categories,
  drillDiagrams,
  drillEquipment,
  drills,
  drillSkills,
  equipmentTypes,
  organization,
  skills,
  sports,
} from "@/db/schema";
import { validateDiagram, parseDiagram } from "@/engines/diagram";
import { db, pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import type { Actor } from "@/lib/authz/can";
import { createDrill } from "@/modules/drills/commands";
import { drillContentSchema } from "@/modules/drills/content";
import { getCourtPack as courtPackFor } from "@/sports/registry";
import { createTestActor } from "./factories";
import { createClub, drillInput, expectDbError, ownerPool } from "./drill-fixtures";
import { adminPool } from "./plan-fixtures";

/**
 * Sports/drill data model + row-level security, exercised against real PostgreSQL as the real
 * runtime role (coachos_app). Every attempt to cross a tenant boundary must fail IN THE DATABASE,
 * independent of any application check (ARCHITECTURE.md §19.1–19.2).
 */

let A: Actor;
let B: Actor;
let aDrillId: string;
let libraryId: string;

const rows = async (actor: Actor, query: ReturnType<typeof sql>) =>
  (await tenantTx(actor, (tx) => tx.execute(query))).rows as Array<Record<string, unknown>>;

beforeAll(async () => {
  A = await createTestActor("Alice Coach");
  B = await createTestActor("Bob Coach");
  const created = await createDrill(A, "basketball", drillInput({ title: "Alice Private Drill" }));
  if (!created.ok) throw new Error(`fixture failed: ${JSON.stringify(created)}`);
  aDrillId = created.data.id;
  const [lib] = await db
    .select({ id: drills.id })
    .from(drills)
    .where(eq(drills.seedKey, "mikan-drill"));
  libraryId = lib!.id;
});

afterAll(async () => {
  await pool.end();
});

describe("catalog (reference data)", () => {
  it("has basketball active and other sports reserved as planned", async () => {
    const all = await db.select().from(sports);
    expect(all.find((s) => s.key === "basketball")?.status).toBe("active");
    for (const k of [
      "football",
      "volleyball",
      "handball",
      "swimming",
      "athletics",
      "cricket",
      "tennis",
    ]) {
      expect(all.find((s) => s.key === k)?.status, k).toBe("planned");
    }
  });

  it("the runtime role can READ the catalog but never change it", async () => {
    expect((await db.select().from(sports)).length).toBeGreaterThan(5);
    await expectDbError(
      db.execute(sql`insert into sports (id, key, name) values (${newId()}, 'hockey', 'Hockey')`),
      /permission denied/,
    );
    await expectDbError(
      db.execute(sql`update sports set status = 'active' where key = 'football'`),
      /permission denied/,
    );
    await expectDbError(db.execute(sql`delete from categories`), /permission denied/);
    await expectDbError(
      db.execute(
        sql`insert into skills (id, sport_id, key, name) select ${newId()}, id, 'x', 'X' from sports limit 1`,
      ),
      /permission denied/,
    );
  });

  it("covers every basketball category with at least one library drill", async () => {
    const [bb] = await db
      .select({ id: sports.id })
      .from(sports)
      .where(eq(sports.key, "basketball"));
    const cats = await db
      .select({ key: categories.key, id: categories.id })
      .from(categories)
      .where(eq(categories.sportId, bb!.id));
    const used = new Set(
      (
        await db
          .select({ c: drills.categoryId })
          .from(drills)
          .where(eq(drills.visibility, "public"))
      ).map((r) => r.c),
    );
    for (const c of cats)
      expect(used.has(c.id), `category ${c.key} has no library drill`).toBe(true);
  });
});

describe("library seed", () => {
  it("published 15–60 curated drills, all in the platform organization, public, with no human creator", async () => {
    const lib = await db.select().from(drills).where(eq(drills.visibility, "public"));
    expect(lib.length).toBe(SEED_DRILLS.length);
    expect(lib.length).toBeGreaterThanOrEqual(15);
    expect(lib.length).toBeLessThanOrEqual(60);
    const [platform] = await db
      .select()
      .from(organization)
      .where(eq(organization.type, "platform"));
    expect(platform?.slug).toBe("coachos-platform");
    for (const d of lib) {
      expect(d.organizationId).toBe(platform!.id);
      expect(d.createdBy).toBeNull();
      expect(d.status).toBe("published");
      expect(d.sourceKind).toBe("original");
    }
  });

  it("is varied: levels, durations, player counts, spaces and skills", async () => {
    const lib = await db.select().from(drills).where(eq(drills.visibility, "public"));
    expect(new Set(lib.map((d) => d.level)).size).toBe(3);
    expect(new Set(lib.map((d) => d.space)).size).toBeGreaterThanOrEqual(3);
    expect(Math.min(...lib.map((d) => d.durationMin))).toBeLessThanOrEqual(5);
    expect(Math.max(...lib.map((d) => d.durationMax))).toBeGreaterThanOrEqual(15);
    expect(Math.min(...lib.map((d) => d.playersMin))).toBe(1);
    expect(Math.max(...lib.map((d) => d.playersMax))).toBeGreaterThanOrEqual(16);
    const primary = await db
      .select({ s: drillSkills.skillId })
      .from(drillSkills)
      .where(eq(drillSkills.role, "primary"));
    expect(new Set(primary.map((p) => p.s)).size).toBeGreaterThanOrEqual(12);
  });

  it("every drill has real coaching content — no placeholders — and passes the content schema", async () => {
    const lib = await db.select().from(drills).where(eq(drills.visibility, "public"));
    for (const d of lib) {
      const c = drillContentSchema.parse(d.content);
      expect(c.instructions.length, d.title).toBeGreaterThanOrEqual(4);
      expect(c.coachingPoints.length, d.title).toBeGreaterThanOrEqual(3);
      expect(c.commonMistakes.length, d.title).toBeGreaterThanOrEqual(3);
      expect(c.safety.length, d.title).toBeGreaterThan(20);
      expect(c.objective.length, d.title).toBeGreaterThan(30);
      expect(JSON.stringify(c) + d.description, d.title).not.toMatch(
        /lorem|ipsum|placeholder|TODO|TBD/i,
      );
    }
  });

  it("every drill has exactly one PRIMARY skill and at least one valid, court-correct diagram", async () => {
    const lib = await db
      .select({ id: drills.id, title: drills.title })
      .from(drills)
      .where(eq(drills.visibility, "public"));
    for (const d of lib) {
      const sk = await db.select().from(drillSkills).where(eq(drillSkills.drillId, d.id));
      expect(sk.filter((s) => s.role === "primary").length, d.title).toBe(1);
      const dg = await db.select().from(drillDiagrams).where(eq(drillDiagrams.drillId, d.id));
      expect(dg.length, d.title).toBeGreaterThanOrEqual(1);
      for (const g of dg) {
        const parsed = parseDiagram(g.data);
        expect(parsed.success, `${d.title} diagram parses`).toBe(true);
        if (!parsed.success) continue;
        const pack = courtPackFor(parsed.data.sport, parsed.data.court);
        expect(pack, `${d.title} court exists`).toBeDefined();
        expect(
          validateDiagram(parsed.data, pack!),
          `${d.title} diagram is semantically valid`,
        ).toEqual([]);
      }
    }
  });

  it("is idempotent: re-seeding changes nothing structurally (no duplicates) and converges on the files", async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(drills);
    const eqBefore = await db.select({ n: sql<number>`count(*)::int` }).from(drillEquipment);
    const summary = await seedAll(process.env.DATABASE_OWNER_URL!);
    expect(summary.drills).toBe(SEED_DRILLS.length);
    expect(summary.archived).toBe(0);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(drills);
    const eqAfter = await db.select({ n: sql<number>`count(*)::int` }).from(drillEquipment);
    expect(after[0]?.n).toBe(before[0]?.n);
    expect(eqAfter[0]?.n).toBe(eqBefore[0]?.n);
    const [mikan] = await db.select().from(drills).where(eq(drills.seedKey, "mikan-drill"));
    expect(mikan!.version).toBeGreaterThan(1); // updated in place, not duplicated
  });
});

describe("row-level security: reads", () => {
  it("a session with NO tenant context sees the public library and nothing private (fails closed)", async () => {
    const visible = await db.select({ id: drills.id, v: drills.visibility }).from(drills);
    expect(visible.every((d) => d.v === "public")).toBe(true);
    expect(visible.some((d) => d.id === aDrillId)).toBe(false);
  });

  it("A sees the library plus her own private drill", async () => {
    const r = await rows(A, sql`select id from drills where id in (${aDrillId}, ${libraryId})`);
    expect(r.map((x) => x.id).sort()).toEqual([aDrillId, libraryId].sort());
  });

  it("B sees the library but NOT A's private drill — by id, by scan, or by any join", async () => {
    expect(await rows(B, sql`select id from drills where id = ${aDrillId}`)).toEqual([]);
    expect(
      (await rows(B, sql`select id from drills where title = 'Alice Private Drill'`)).length,
    ).toBe(0);
    expect((await rows(B, sql`select id from drills where id = ${libraryId}`)).length).toBe(1);
    // child rows of an invisible drill are invisible too
    expect(await rows(B, sql`select 1 from drill_skills where drill_id = ${aDrillId}`)).toEqual([]);
    expect(await rows(B, sql`select 1 from drill_equipment where drill_id = ${aDrillId}`)).toEqual(
      [],
    );
    expect(await rows(B, sql`select 1 from drill_diagrams where drill_id = ${aDrillId}`)).toEqual(
      [],
    );
    expect(
      await rows(
        B,
        sql`select d.id from drills d join drill_skills s on s.drill_id = d.id where d.id = ${aDrillId}`,
      ),
    ).toEqual([]);
  });

  it("the tenant context does not leak between transactions", async () => {
    await tenantTx(A, (tx) => tx.select().from(drills));
    const after = await db.select({ id: drills.id }).from(drills).where(eq(drills.id, aDrillId));
    expect(after).toEqual([]);
  });

  it("an ARCHIVED library row disappears for everyone (only published rows are public)", async () => {
    const owner = ownerPool();
    try {
      await owner.query(
        "select set_config('app.org_id', (select id::text from organization where type='platform'), false)",
      );
      await owner.query(
        "update drills set status = 'archived' where seed_key = 'form-shooting-close-range'",
      );
      const [gone] = await db
        .select()
        .from(drills)
        .where(eq(drills.seedKey, "form-shooting-close-range"));
      expect(gone).toBeUndefined();
      await owner.query(
        "update drills set status = 'published' where seed_key = 'form-shooting-close-range'",
      );
      const [back] = await db
        .select()
        .from(drills)
        .where(eq(drills.seedKey, "form-shooting-close-range"));
      expect(back).toBeDefined();
    } finally {
      await owner.end();
    }
  });
});

describe("row-level security: writes", () => {
  const insertRow = (actor: Actor, over: Record<string, unknown> = {}) => {
    return tenantTx(actor, async (tx) => {
      const [sport] = await tx
        .select({ id: sports.id })
        .from(sports)
        .where(eq(sports.key, "basketball"));
      const [category] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.sportId, sport!.id), eq(categories.key, "passing")));
      return tx.insert(drills).values({
        id: newId(),
        organizationId: actor.organizationId,
        sportId: sport!.id,
        categoryId: category!.id,
        title: "Direct Insert Drill",
        description: "Inserted directly to exercise row level security.",
        level: "beginner",
        ageMin: 9,
        ageMax: 12,
        playersMin: 2,
        playersMax: 6,
        durationMin: 5,
        durationMax: 8,
        space: "half_court",
        content: {},
        createdBy: actor.userId,
        visibility: "private",
        ...over,
      });
    });
  };

  it("a user can create a drill in their own organization, as themselves", async () => {
    await insertRow(B);
  });

  it("B cannot insert a drill into A's organization", async () => {
    await expectDbError(insertRow(B, { organizationId: A.organizationId }), /row-level security/);
  });

  it("B cannot forge A as the creator", async () => {
    await expectDbError(insertRow(B, { createdBy: A.userId }), /row-level security/);
  });

  it("nobody but the platform can publish a PUBLIC drill", async () => {
    await expectDbError(insertRow(B, { visibility: "public" }), /row-level security/);
    await expectDbError(insertRow(A, { visibility: "public" }), /row-level security/);
  });

  it("B cannot change or hide A's drill (0 rows affected)", async () => {
    const r = await rows(
      B,
      sql`update drills set title = 'HACKED' where id = ${aDrillId} returning id`,
    );
    expect(r).toEqual([]);
    const viaA = await rows(A, sql`select title from drills where id = ${aDrillId}`);
    expect(viaA[0]?.title).toBe("Alice Private Drill");
  });

  it("A cannot modify a LIBRARY drill: it is not hers", async () => {
    const r = await rows(
      A,
      sql`update drills set title = 'Defaced' where id = ${libraryId} returning id`,
    );
    expect(r).toEqual([]);
    const lib = await rows(A, sql`select title from drills where id = ${libraryId}`);
    expect(lib[0]?.title).toBe("Mikan Drill");
  });

  it("ownership can never be moved, even by the owner of the row", async () => {
    await expectDbError(
      tenantTx(A, (tx) =>
        tx.execute(
          sql`update drills set organization_id = ${B.organizationId} where id = ${aDrillId}`,
        ),
      ),
      /immutable|row-level security/,
    );
    await expectDbError(
      tenantTx(A, (tx) =>
        tx.execute(sql`update drills set created_by = ${B.userId} where id = ${aDrillId}`),
      ),
      /immutable|row-level security/,
    );
    await expectDbError(
      tenantTx(A, (tx) =>
        tx.execute(sql`update drills set visibility = 'public' where id = ${aDrillId}`),
      ),
      /row-level security/,
    );
  });

  it("erasing the account of a workspace member who authored drills works: the drills stay, with no creator", async () => {
    const founder = await createTestActor("Club Founder");
    const club = await createClub(founder, [{ role: "coach", name: "Leaving Coach" }]);
    const leaver = club.members[0]!;
    const shared = await createDrill(
      leaver,
      "basketball",
      drillInput({ title: "Leaver Shared Drill", visibility: "organization" }),
    );
    const mine = await createDrill(
      leaver,
      "basketball",
      drillInput({ title: "Leaver Private Drill", visibility: "private" }),
    );
    if (!shared.ok || !mine.ok) throw new Error("fixture failed");

    // the account is erased (a foreign-key action clears created_by on the drills)
    await db.execute(sql`delete from "user" where id = ${leaver.userId}`);

    const owner = club.ownerActor;
    const after = await rows(
      owner,
      sql`select id, created_by, organization_id from drills where id in (${shared.data.id}, ${mine.data.id})`,
    );
    // the shared drill is still there for the workspace; the private one has no reader left but is not destroyed
    expect(after.map((r) => r.id)).toEqual([shared.data.id]);
    expect(after[0]!.created_by).toBeNull();
    expect(after[0]!.organization_id).toBe(club.orgId);
    // the private drill was not destroyed either (only a superuser can see it: it has no reader left)
    const superuser = adminPool();
    try {
      const { rows: all } = await superuser.query(
        "select created_by, organization_id from drills where id = $1",
        [mine.data.id],
      );
      expect(all[0]).toEqual({ created_by: null, organization_id: club.orgId });
    } finally {
      await superuser.end();
    }
    // a workspace owner can still manage the orphaned shared drill
    const managed = await rows(
      owner,
      sql`update drills set title = 'Adopted drill' where id = ${shared.data.id} returning id`,
    );
    expect(managed).toHaveLength(1);
  });

  it("…but nobody can clear or change the creator while the account exists", async () => {
    await expectDbError(
      tenantTx(A, (tx) =>
        tx.execute(sql`update drills set created_by = null where id = ${aDrillId}`),
      ),
      /immutable/,
    );
  });

  it("drills are archived, never deleted, by the runtime role", async () => {
    await expectDbError(
      tenantTx(A, (tx) => tx.execute(sql`delete from drills where id = ${aDrillId}`)),
      /permission denied/,
    );
  });

  it("B cannot attach or remove child rows on A's drill", async () => {
    const [eq1] = await db.select({ id: equipmentTypes.id }).from(equipmentTypes).limit(1);
    await expectDbError(
      tenantTx(B, (tx) =>
        tx.execute(
          sql`insert into drill_equipment (drill_id, equipment_type_id, rule, quantity) values (${aDrillId}, ${eq1!.id}, 'fixed', 1)`,
        ),
      ),
      /row-level security|violates foreign key/,
    );
    const del = await rows(
      B,
      sql`delete from drill_skills where drill_id = ${aDrillId} returning drill_id`,
    );
    expect(del).toEqual([]);
    const still = await rows(A, sql`select 1 from drill_skills where drill_id = ${aDrillId}`);
    expect(still.length).toBe(2); // primary + one secondary
  });

  it("nobody can edit LIBRARY children either", async () => {
    const del = await rows(
      A,
      sql`delete from drill_diagrams where drill_id = ${libraryId} returning id`,
    );
    expect(del).toEqual([]);
    expect(
      (await db.select().from(drillDiagrams).where(eq(drillDiagrams.drillId, libraryId))).length,
    ).toBeGreaterThan(0);
  });
});

describe("integrity constraints (defence in depth, independent of app validation)", () => {
  const owner = ownerPool();
  afterAll(async () => {
    await owner.end();
  });

  it("a drill's category must belong to the drill's own sport (composite foreign key)", async () => {
    // give another sport a category using the OWNER role (the runtime role can't), then try to cross-wire it
    const fb = await owner.query("select id from sports where key = 'football'");
    const catId = newId();
    await owner.query(
      "insert into categories (id, sport_id, key, name) values ($1, $2, 'test_cat', 'Test') on conflict do nothing",
      [catId, fb.rows[0].id],
    );
    const cat = await owner.query(
      "select id from categories where sport_id = $1 and key = 'test_cat'",
      [fb.rows[0].id],
    );
    const bb = await db.select({ id: sports.id }).from(sports).where(eq(sports.key, "basketball"));
    await expectDbError(
      tenantTx(A, (tx) =>
        tx.insert(drills).values({
          id: newId(),
          organizationId: A.organizationId,
          sportId: bb[0]!.id,
          categoryId: cat.rows[0].id,
          title: "Cross Sport",
          description: "Category from another sport should be rejected.",
          level: "beginner",
          ageMin: 9,
          ageMax: 12,
          playersMin: 2,
          playersMax: 6,
          durationMin: 5,
          durationMax: 8,
          space: "half_court",
          content: {},
          createdBy: A.userId,
        }),
      ),
      /drills_category_sport_fk|foreign key/,
    );
  });

  it("a drill's skills must belong to the drill's sport too", async () => {
    const fb = await owner.query("select id from sports where key = 'football'");
    const sk = newId();
    await owner.query(
      "insert into skills (id, sport_id, key, name) values ($1, $2, 'test_skill', 'Test') on conflict do nothing",
      [sk, fb.rows[0].id],
    );
    const foreignSkill = await owner.query(
      "select id from skills where sport_id = $1 and key = 'test_skill'",
      [fb.rows[0].id],
    );
    const bb = await db.select({ id: sports.id }).from(sports).where(eq(sports.key, "basketball"));
    await expectDbError(
      tenantTx(A, (tx) =>
        tx.insert(drillSkills).values({
          drillId: aDrillId,
          skillId: foreignSkill.rows[0].id,
          sportId: bb[0]!.id,
          role: "secondary",
        }),
      ),
      /drill_skills_skill_fk|foreign key/,
    );
  });

  it("only one primary skill per drill", async () => {
    const [other] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.key, "footwork"));
    const [sport] = await db
      .select({ id: sports.id })
      .from(sports)
      .where(eq(sports.key, "basketball"));
    await expectDbError(
      tenantTx(A, (tx) =>
        tx
          .insert(drillSkills)
          .values({ drillId: aDrillId, skillId: other!.id, sportId: sport!.id, role: "primary" }),
      ),
      /drill_skills_one_primary_uq|duplicate key/,
    );
  });

  it("ranges and enums are enforced by CHECK constraints", async () => {
    const bad = (over: Record<string, unknown>) =>
      tenantTx(A, async (tx) => {
        const [sport] = await tx
          .select({ id: sports.id })
          .from(sports)
          .where(eq(sports.key, "basketball"));
        const [cat] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.sportId, sport!.id), eq(categories.key, "passing")));
        return tx.insert(drills).values({
          id: newId(),
          organizationId: A.organizationId,
          sportId: sport!.id,
          categoryId: cat!.id,
          title: "Constraint Test",
          description: "Used to trigger a database constraint.",
          level: "beginner",
          ageMin: 9,
          ageMax: 12,
          playersMin: 2,
          playersMax: 6,
          durationMin: 5,
          durationMax: 8,
          space: "half_court",
          content: {},
          createdBy: A.userId,
          ...over,
        });
      });
    await expectDbError(bad({ ageMin: 15, ageMax: 10 }), /drills_age_chk/);
    await expectDbError(bad({ playersMin: 0 }), /drills_players_chk/);
    await expectDbError(bad({ durationMin: 30, durationMax: 5 }), /drills_duration_chk/);
    await expectDbError(bad({ level: "legendary" }), /drills_level_chk/);
    await expectDbError(bad({ status: "deleted" }), /drills_status_chk/);
    await expectDbError(bad({ sourceUrl: "javascript:alert(1)" }), /drills_source_url_chk/);
    await expectDbError(bad({ sourceUrl: "http://insecure.example.com" }), /drills_source_url_chk/);
    await expectDbError(bad({ title: "ab" }), /drills_title_len_chk/);
    await expectDbError(
      bad({ tags: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] }),
      /drills_tags_chk/,
    );
    await expectDbError(bad({ content: [] }), /drills_content_chk/);
  });
});

describe("skills tree: sub-skills (catalog integrity)", () => {
  const owner = ownerPool();
  afterAll(async () => {
    await owner.query("delete from skills where key like 'tt\\_%'");
    await owner.end();
  });
  const sportId = async (key: string) =>
    ((await owner.query("select id from sports where key = $1", [key])).rows[0] as { id: string })
      .id;
  const addSkill = async (sport: string, key: string, parentId: string | null = null) => {
    const id = newId();
    await owner.query(
      "insert into skills (id, sport_id, key, name, parent_id) values ($1, $2, $3, $3, $4)",
      [id, await sportId(sport), key, parentId],
    );
    return id;
  };

  it("the seeded taxonomy is a clean two-level tree: every sub-skill has a top-level parent in the same sport", async () => {
    const r = await owner.query(`
      select c.key as child, p.key as parent, (c.sport_id = p.sport_id) as same_sport, (p.parent_id is null) as parent_top
      from skills c join skills p on p.id = c.parent_id`);
    expect(r.rows.length).toBeGreaterThanOrEqual(30);
    for (const row of r.rows) {
      expect(row.same_sport, `${row.child} parent in same sport`).toBe(true);
      expect(row.parent_top, `${row.parent} is top-level`).toBe(true);
    }
  });

  it("a sub-skill's parent must belong to the same sport (composite foreign key)", async () => {
    const foreignParent = await addSkill("football", "tt_football_parent");
    await expectDbError(
      addSkill("basketball", "tt_cross_child", foreignParent),
      /skills_parent_sport_fk|foreign key/,
    );
  });

  it("two levels only: a sub-skill cannot be a parent, and a parent cannot become a sub-skill", async () => {
    const parent = await addSkill("basketball", "tt_parent");
    const child = await addSkill("basketball", "tt_child", parent);
    await expectDbError(addSkill("basketball", "tt_grandchild", child), /two levels only/);
    const other = await addSkill("basketball", "tt_other_top");
    await expectDbError(
      owner.query("update skills set parent_id = $1 where id = $2", [other, parent]),
      /two levels only/,
    );
  });

  it("a skill cannot be its own parent", async () => {
    const id = await addSkill("basketball", "tt_self");
    await expectDbError(
      owner.query("update skills set parent_id = id where id = $1", [id]),
      /skills_parent_not_self_chk/,
    );
  });

  it("the runtime role can read the tree but not change it", async () => {
    const r = await rows(A, sql`select count(*)::int as n from skills where parent_id is not null`);
    expect(Number(r[0]?.n)).toBeGreaterThan(0);
    await expectDbError(
      tenantTx(A, (tx) =>
        tx.execute(sql`update skills set parent_id = null where key = 'crossover'`),
      ),
      /permission denied/,
    );
  });
});

describe("drill facets: constraints and the sub-skill role", () => {
  const asA = (statement: ReturnType<typeof sql>) => tenantTx(A, (tx) => tx.execute(statement));

  it("intensity, format and phases are constrained in the database, whatever the application says", async () => {
    await expectDbError(
      asA(sql`update drills set intensity = 'extreme' where id = ${aDrillId}`),
      /drills_intensity_chk/,
    );
    await expectDbError(
      asA(sql`update drills set format = '3 v 3!' where id = ${aDrillId}`),
      /drills_format_chk/,
    );
    await expectDbError(
      asA(sql`update drills set format = ${"x".repeat(17)} where id = ${aDrillId}`),
      /drills_format_chk/,
    );
    await expectDbError(
      asA(sql`update drills set phases = '{overtime}' where id = ${aDrillId}`),
      /drills_phases_chk/,
    );
    await expectDbError(
      asA(
        sql`update drills set phases = '{warm_up,skill,small_sided,game,conditioning,cool_down,skill}' where id = ${aDrillId}`,
      ),
      /drills_phases_chk/,
    );
    // …and the good values are accepted
    await asA(
      sql`update drills set intensity = 'high', format = '3v3', phases = '{skill,game}' where id = ${aDrillId}`,
    );
    const r = await rows(
      A,
      sql`select intensity, format, phases from drills where id = ${aDrillId}`,
    );
    expect(r[0]).toEqual({ intensity: "high", format: "3v3", phases: ["skill", "game"] });
    await asA(
      sql`update drills set intensity = 'medium', format = null, phases = '{}' where id = ${aDrillId}`,
    );
  });

  it("a drill_skills row may have the role 'sub' (and only primary / secondary / sub)", async () => {
    const [sub] = await db
      .select({ id: skills.id, sportId: skills.sportId })
      .from(skills)
      .where(eq(skills.key, "crossover"));
    await tenantTx(A, (tx) =>
      tx
        .insert(drillSkills)
        .values({ drillId: aDrillId, skillId: sub!.id, sportId: sub!.sportId, role: "sub" }),
    );
    await expectDbError(
      tenantTx(A, (tx) =>
        tx
          .insert(drillSkills)
          .values({ drillId: aDrillId, skillId: sub!.id, sportId: sub!.sportId, role: "tertiary" }),
      ),
      /drill_skills_role_chk|duplicate key/,
    );
    await tenantTx(A, (tx) =>
      tx
        .delete(drillSkills)
        .where(and(eq(drillSkills.drillId, aDrillId), eq(drillSkills.skillId, sub!.id))),
    );
  });
});

describe("row-level security: favorites", () => {
  let aFav: string;
  beforeAll(async () => {
    aFav = libraryId;
    await rows(
      A,
      sql`insert into drill_favorites (user_id, drill_id) values (${A.userId}, ${aFav}) on conflict do nothing`,
    );
  });

  it("a user can add and read their own favorite of a drill they may read", async () => {
    const r = await rows(A, sql`select drill_id from drill_favorites where user_id = ${A.userId}`);
    expect(r.map((x) => x.drill_id)).toContain(aFav);
  });

  it("B cannot see A's favorites — by scan, by user id or by drill id", async () => {
    expect(await rows(B, sql`select * from drill_favorites`)).toEqual([]);
    expect(await rows(B, sql`select * from drill_favorites where user_id = ${A.userId}`)).toEqual(
      [],
    );
    expect(await rows(B, sql`select * from drill_favorites where drill_id = ${aFav}`)).toEqual([]);
  });

  it("B cannot create a favorite in A's name", async () => {
    await expectDbError(
      tenantTx(B, (tx) =>
        tx.execute(
          sql`insert into drill_favorites (user_id, drill_id) values (${A.userId}, ${libraryId})`,
        ),
      ),
      /row-level security/,
    );
  });

  it("B cannot favorite a drill B cannot read (A's private drill), even as themselves", async () => {
    await expectDbError(
      tenantTx(B, (tx) =>
        tx.execute(
          sql`insert into drill_favorites (user_id, drill_id) values (${B.userId}, ${aDrillId})`,
        ),
      ),
      /row-level security/,
    );
  });

  it("B cannot remove A's favorite (0 rows affected), and A still has it", async () => {
    expect(
      await rows(
        B,
        sql`delete from drill_favorites where user_id = ${A.userId} returning drill_id`,
      ),
    ).toEqual([]);
    const r = await rows(A, sql`select drill_id from drill_favorites where user_id = ${A.userId}`);
    expect(r.map((x) => x.drill_id)).toContain(aFav);
  });

  it("a session with no tenant context sees no favorites (fails closed)", async () => {
    const r = await db.execute(sql`select count(*)::int as n from drill_favorites`);
    expect(Number((r.rows[0] as { n: number }).n)).toBe(0);
  });

  it("favorites are add/remove only: the runtime role cannot UPDATE them", async () => {
    await expectDbError(
      tenantTx(A, (tx) =>
        tx.execute(sql`update drill_favorites set created_at = now() where user_id = ${A.userId}`),
      ),
      /permission denied/,
    );
  });

  it("a user can remove their own favorite", async () => {
    const r = await rows(
      A,
      sql`delete from drill_favorites where user_id = ${A.userId} and drill_id = ${aFav} returning drill_id`,
    );
    expect(r).toHaveLength(1);
  });
});
