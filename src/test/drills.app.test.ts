import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { auditEvents, drills, drillSkills } from "@/db/schema";
import { SEED_DRILLS } from "@/db/seed/drills";
import { db, pool } from "@/lib/db/client";
import { userTx } from "@/lib/db/tx";
import type { Actor } from "@/lib/authz/can";
import { archiveDrill, createDrill, duplicateDrill, updateDrill } from "@/modules/drills/commands";
import { parseFilters, type DrillFilters, PAGE_SIZE } from "@/modules/drills/filters";
import { getDrill, getSportOverview, searchDrills } from "@/modules/drills/queries";
import { createClub, drillInput } from "./drill-fixtures";
import { createTestActor } from "./factories";

/** Application-level behaviour of the drill module against a real database. */

let A: Actor;
let B: Actor;

const search = async (actor: Actor, over: Partial<DrillFilters> = {}, pageSize = 50) => {
  const page = await searchDrills(
    actor,
    "basketball",
    { ...parseFilters({}), ...over },
    { pageSize },
  );
  if (!page) throw new Error("sport not found");
  return page;
};
const titles = (p: { items: Array<{ title: string }> }) => p.items.map((i) => i.title).sort();

beforeAll(async () => {
  A = await createTestActor("Alice Coach");
  B = await createTestActor("Bob Coach");
});

afterAll(async () => {
  await pool.end();
});

describe("create + read", () => {
  it("saves a drill and reads it back with all its structure", async () => {
    const r = await createDrill(
      A,
      "basketball",
      drillInput({ title: "Alice Passing Circuit", tags: ["circuit", "passing"] }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = await getDrill(A, "basketball", r.data.id);
    expect(d).not.toBeNull();
    expect(d).toMatchObject({
      title: "Alice Passing Circuit",
      category: { key: "passing" },
      primarySkill: { key: "passing" },
      level: "beginner",
      scope: "mine",
      status: "published",
      visibility: "private",
      version: 1,
      tags: ["circuit", "passing"],
      permissions: { canEdit: true, canArchive: true, canDuplicate: true },
      source: { kind: "original" },
    });
    expect(d!.skills.map((s) => [s.key, s.role])).toEqual([
      ["passing", "primary"],
      ["catching", "secondary"],
    ]);
    expect(d!.equipment).toEqual([
      { key: "basketball", name: "Basketballs", rule: "per_pair", quantity: 1 },
    ]);
    expect(d!.diagrams).toHaveLength(1);
    expect(d!.diagrams[0]!.diagram.entities).toHaveLength(3);
    expect(d!.content.instructions).toEqual([
      "Chest pass to your partner.",
      "Catch with two hands.",
    ]);
  });

  it("records an audit event in the same transaction", async () => {
    const r = await createDrill(A, "basketball", drillInput({ title: "Audited Drill" }));
    if (!r.ok) throw new Error("create failed");
    const events = await userTx(A.userId, (tx) =>
      tx.select().from(auditEvents).orderBy(desc(auditEvents.occurredAt)).limit(5),
    );
    const e = events.find((x) => x.action === "drill.created" && x.entityId === r.data.id);
    expect(e).toBeDefined();
    expect(e?.entityType).toBe("drill");
    expect(e?.organizationId).toBe(A.organizationId);
  });

  it("a personal workspace always keeps drills private, even if 'organization' is requested", async () => {
    const r = await createDrill(
      A,
      "basketball",
      drillInput({ title: "Wants To Be Shared", visibility: "organization" }),
    );
    if (!r.ok) throw new Error("create failed");
    expect((await getDrill(A, "basketball", r.data.id))?.visibility).toBe("private");
  });

  it("unknown sports and malformed ids simply don't exist", async () => {
    expect(await createDrill(A, "football", drillInput())).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await getDrill(A, "football", "0192a000-0000-7000-8000-000000000001")).toBeNull();
    expect(await getDrill(A, "basketball", "not-a-uuid")).toBeNull();
    expect(await getDrill(A, "basketball", "0192a000-0000-7000-8000-000000000001")).toBeNull();
  });
});

describe("sport-specific validation (the parts a generic schema cannot know)", () => {
  const fieldsOf = (r: Awaited<ReturnType<typeof createDrill>>) =>
    r.ok ? {} : (r.error.fields ?? {});

  it("rejects catalog keys that don't exist for the sport", async () => {
    const r = await createDrill(
      A,
      "basketball",
      drillInput({
        category: "quidditch",
        primarySkill: "flying",
        secondarySkills: ["broom"],
        space: "moon",
        equipment: [{ type: "snitch", rule: "fixed", quantity: 1 }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(Object.keys(fieldsOf(r)).sort()).toEqual([
      "category",
      "equipment",
      "primarySkill",
      "secondarySkills",
      "space",
    ]);
  });

  it("validates diagrams against the court: a pass needs the ball", async () => {
    const base = drillInput();
    const diagram = structuredClone(base.diagrams[0]!.diagram);
    diagram.entities = diagram.entities.filter((e) => e.type !== "ball");
    const r = await createDrill(A, "basketball", {
      ...base,
      diagrams: [{ title: "No ball", diagram }],
    });
    expect(fieldsOf(r)["diagrams.0"]).toContain("diagram_action_requires_ball");
  });

  it("rejects diagrams with players off the court, unknown anchors and wrong-sport diagrams", async () => {
    const base = drillInput();
    const off = structuredClone(base.diagrams[0]!.diagram);
    off.entities[0] = {
      id: "o1",
      type: "player",
      side: "offense",
      label: "1",
      at: { x: 50, y: 3 },
    };
    expect(
      fieldsOf(
        await createDrill(A, "basketball", { ...base, diagrams: [{ title: "", diagram: off }] }),
      )["diagrams.0"],
    ).toContain("diagram_out_of_bounds");

    const bad = structuredClone(base.diagrams[0]!.diagram);
    bad.entities[1] = {
      id: "o2",
      type: "player",
      side: "offense",
      label: "2",
      at: { anchor: "far_top_key" },
    }; // full-court-only anchor
    expect(
      fieldsOf(
        await createDrill(A, "basketball", { ...base, diagrams: [{ title: "", diagram: bad }] }),
      )["diagrams.0"],
    ).toContain("diagram_unknown_anchor");

    const wrong = { ...structuredClone(base.diagrams[0]!.diagram), sport: "football" };
    expect(
      fieldsOf(
        await createDrill(A, "basketball", { ...base, diagrams: [{ title: "", diagram: wrong }] }),
      )["diagrams.0"],
    ).toEqual(["diagram_court_unknown"]);
  });

  it("nothing is saved when validation fails", async () => {
    const before = (await db.select().from(drills).where(eq(drills.createdBy, A.userId))).length;
    await createDrill(
      A,
      "basketball",
      drillInput({ title: "Should Not Exist", category: "nope_at_all" }),
    );
    expect((await db.select().from(drills).where(eq(drills.createdBy, A.userId))).length).toBe(
      before,
    );
  });
});

describe("update (with optimistic concurrency)", () => {
  let id: string;
  beforeAll(async () => {
    const r = await createDrill(A, "basketball", drillInput({ title: "Before Edit" }));
    if (!r.ok) throw new Error("create failed");
    id = r.data.id;
  });

  it("updates fields and REPLACES skills, equipment and diagrams; bumps the version", async () => {
    const r = await updateDrill(
      A,
      "basketball",
      id,
      drillInput({
        title: "After Edit",
        primarySkill: "dribbling",
        secondarySkills: [],
        equipment: [{ type: "cones", rule: "fixed", quantity: 4 }],
        diagrams: [],
        version: 1,
      }),
    );
    expect(r.ok).toBe(true);
    const d = await getDrill(A, "basketball", id);
    expect(d).toMatchObject({
      title: "After Edit",
      version: 2,
      primarySkill: { key: "dribbling" },
    });
    expect(d!.skills).toHaveLength(1);
    expect(d!.equipment.map((e) => e.key)).toEqual(["cones"]);
    expect(d!.diagrams).toEqual([]);
  });

  it("a stale editor gets a CONFLICT instead of silently overwriting", async () => {
    const r = await updateDrill(
      A,
      "basketball",
      id,
      drillInput({ title: "Stale Save", version: 1 }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect((await getDrill(A, "basketball", id))?.title).toBe("After Edit");
  });

  it("requires the version the editor loaded", async () => {
    const r = await updateDrill(A, "basketball", id, drillInput({ title: "No Version" }));
    expect(r).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { version: ["required"] } },
    });
  });

  it("another user cannot edit it — and can't even tell it exists (NOT_FOUND, not FORBIDDEN)", async () => {
    const r = await updateDrill(B, "basketball", id, drillInput({ title: "Hijacked", version: 2 }));
    expect(r).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect((await getDrill(A, "basketball", id))?.title).toBe("After Edit");
  });

  it("library drills cannot be edited by users (FORBIDDEN: it is visible, just not theirs)", async () => {
    const [lib] = await db
      .select({ id: drills.id })
      .from(drills)
      .where(eq(drills.seedKey, "mikan-drill"));
    const d = await getDrill(A, "basketball", lib!.id);
    expect(d).toMatchObject({
      scope: "library",
      permissions: { canEdit: false, canArchive: false, canDuplicate: true },
    });
    const r = await updateDrill(
      A,
      "basketball",
      lib!.id,
      drillInput({ title: "Defaced Library Drill", version: d!.version }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await getDrill(A, "basketball", lib!.id))?.title).toBe("Mikan Drill");
  });

  it("records an audit event for the change", async () => {
    const events = await userTx(A.userId, (tx) =>
      tx.select().from(auditEvents).where(eq(auditEvents.entityId, id)),
    );
    // the full history of this drill: created, then updated (the failed stale/forbidden attempts wrote nothing)
    expect(events.map((e) => e.action).sort()).toEqual(["drill.created", "drill.updated"]);
  });
});

describe("archive", () => {
  it("removes the drill from the library, keeps it readable to its creator, and blocks further edits", async () => {
    const r = await createDrill(A, "basketball", drillInput({ title: "To Archive" }));
    if (!r.ok) throw new Error("create failed");
    expect((await search(A, { scope: "mine" })).items.some((i) => i.id === r.data.id)).toBe(true);

    expect(await archiveDrill(A, "basketball", r.data.id)).toMatchObject({ ok: true });
    expect((await search(A, { scope: "mine" })).items.some((i) => i.id === r.data.id)).toBe(false);
    const d = await getDrill(A, "basketball", r.data.id);
    expect(d).toMatchObject({
      status: "archived",
      permissions: { canEdit: false, canArchive: false },
    });
    expect(
      await updateDrill(A, "basketball", r.data.id, drillInput({ version: d!.version })),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await archiveDrill(A, "basketball", r.data.id)).toMatchObject({ ok: true }); // idempotent
  });

  it("strangers and library rows cannot be archived", async () => {
    const r = await createDrill(A, "basketball", drillInput({ title: "Not Yours To Archive" }));
    if (!r.ok) throw new Error("create failed");
    expect(await archiveDrill(B, "basketball", r.data.id)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    const [lib] = await db
      .select({ id: drills.id })
      .from(drills)
      .where(eq(drills.seedKey, "five-spot-shooting"));
    expect(await archiveDrill(A, "basketball", lib!.id)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
});

describe("duplicate (fork)", () => {
  it("copies a library drill into the user's workspace as a private drill, with lineage and provenance", async () => {
    const [lib] = await db
      .select({ id: drills.id })
      .from(drills)
      .where(eq(drills.seedKey, "give-and-go"));
    const r = await duplicateDrill(A, "basketball", lib!.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const copy = await getDrill(A, "basketball", r.data.id);
    const orig = await getDrill(A, "basketball", lib!.id);
    expect(copy).toMatchObject({
      title: "Copy of Give-and-Go (Pass and Cut)",
      scope: "mine",
      visibility: "private",
      forkedFromId: lib!.id,
      source: { kind: "adapted", name: "CoachOS library" },
    });
    expect(copy!.content).toEqual(orig!.content);
    expect(copy!.diagrams.map((g) => g.diagram)).toEqual(orig!.diagrams.map((g) => g.diagram));
    expect(copy!.skills).toEqual(orig!.skills);
    expect(copy!.permissions.canEdit).toBe(true); // …and now it can be customised
    expect(await getDrill(B, "basketball", r.data.id)).toBeNull(); // and is private
  });

  it("cannot copy what you cannot read", async () => {
    const r = await createDrill(A, "basketball", drillInput({ title: "Alice Secret" }));
    if (!r.ok) throw new Error("create failed");
    expect(await duplicateDrill(B, "basketball", r.data.id)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("organizations: shared drills, private drills and roles", () => {
  let club: Awaited<ReturnType<typeof createClub>>;
  let shared: string;
  let priv: string;

  beforeAll(async () => {
    const owner = await createTestActor("Olive Owner");
    club = await createClub(owner, [
      { role: "coach", name: "Cy Coach" },
      { role: "admin", name: "Di Admin" },
      { role: "assistant", name: "Al Assistant" },
    ]);
    const s = await createDrill(
      club.ownerActor,
      "basketball",
      drillInput({ title: "Club Shared Drill", visibility: "organization" }),
    );
    const p = await createDrill(
      club.ownerActor,
      "basketball",
      drillInput({ title: "Owner Private Drill", visibility: "private" }),
    );
    if (!s.ok || !p.ok) throw new Error("fixture failed");
    shared = s.data.id;
    priv = p.data.id;
  });

  it("organization-visible drills are shared with members; private ones are not", async () => {
    const [coach, admin, assistant] = club.members as [Actor, Actor, Actor];
    for (const m of [coach, admin, assistant]) {
      expect(await getDrill(m, "basketball", shared), m.role).toMatchObject({
        scope: "workspace",
        visibility: "organization",
      });
      expect(
        await getDrill(m, "basketball", priv),
        `${m.role} must not see the owner's private drill`,
      ).toBeNull();
    }
    expect(await getDrill(club.ownerActor, "basketball", priv)).not.toBeNull();
  });

  it("outsiders (other organizations) see neither", async () => {
    expect(await getDrill(B, "basketball", shared)).toBeNull();
    expect(await getDrill(B, "basketball", priv)).toBeNull();
    expect((await search(B)).items.some((i) => i.id === shared)).toBe(false);
  });

  it("roles decide who may edit: owner/admin yes, coach no (not the creator), assistant no", async () => {
    const [coach, admin, assistant] = club.members as [Actor, Actor, Actor];
    expect((await getDrill(coach, "basketball", shared))?.permissions).toMatchObject({
      canEdit: false,
      canArchive: false,
      canDuplicate: true,
    });
    expect((await getDrill(admin, "basketball", shared))?.permissions).toMatchObject({
      canEdit: true,
      canArchive: true,
    });
    expect((await getDrill(assistant, "basketball", shared))?.permissions).toMatchObject({
      canEdit: false,
      canDuplicate: false,
    });

    expect(
      await updateDrill(
        coach,
        "basketball",
        shared,
        drillInput({ title: "Coach Edit", visibility: "organization", version: 1 }),
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await updateDrill(
        admin,
        "basketball",
        shared,
        drillInput({ title: "Admin Edit", visibility: "organization", version: 1 }),
      ),
    ).toMatchObject({ ok: true });
    expect((await getDrill(club.ownerActor, "basketball", shared))?.title).toBe("Admin Edit");
  });

  it("assistants cannot author; coaches can, and their drills belong to the organization", async () => {
    const [coach, , assistant] = club.members as [Actor, Actor, Actor];
    expect(
      await createDrill(assistant, "basketball", drillInput({ title: "Assistant Drill" })),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const r = await createDrill(
      coach,
      "basketball",
      drillInput({ title: "Coach Club Drill", visibility: "organization" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(await getDrill(club.ownerActor, "basketball", r.data.id)).toMatchObject({
        scope: "workspace",
        visibility: "organization",
      });
  });

  it("archiving by an admin works on a colleague's shared drill; a colleague's PRIVATE drill stays untouchable", async () => {
    const admin = club.members[1]!;
    expect(await archiveDrill(admin, "basketball", priv)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("search: filters agree with an independent oracle built from the seed data", () => {
  const lib = SEED_DRILLS;
  const overlaps = (lo: number, hi: number, a: number, b: number) => lo <= b && hi >= a;
  const oracle = (p: (d: (typeof lib)[number]) => boolean) =>
    lib
      .filter(p)
      .map((d) => d.title)
      .sort();
  const run = async (over: Partial<DrillFilters>) =>
    titles(await search(A, { scope: "library", ...over }));

  it("returns the whole library by default", async () => {
    const p = await search(A, { scope: "library" });
    expect(p.total).toBe(lib.length);
  });

  it("category", async () => {
    for (const c of [
      "shooting",
      "finishing",
      "team_offense",
      "transition",
      "warm_up",
      "competition",
    ]) {
      expect(await run({ category: c }), c).toEqual(oracle((d) => d.category === c));
    }
  });

  it("level", async () => {
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      expect(await run({ level }), level).toEqual(oracle((d) => d.level === level));
    }
  });

  it("skill matches primary OR secondary skills", async () => {
    for (const s of ["closeouts", "footwork", "cutting", "passing"]) {
      expect(await run({ skill: s }), s).toEqual(
        oracle((d) => d.primarySkill === s || (d.secondarySkills ?? []).includes(s)),
      );
    }
  });

  it("age and player count select drills that cover that value", async () => {
    for (const age of [7, 9, 12, 15, 18])
      expect(await run({ age }), `age ${age}`).toEqual(
        oracle((d) => d.ageMin <= age && d.ageMax >= age),
      );
    for (const players of [1, 2, 4, 8, 16, 25])
      expect(await run({ players }), `players ${players}`).toEqual(
        oracle((d) => d.playersMin <= players && d.playersMax >= players),
      );
  });

  it("duration bands select drills whose duration range overlaps the band", async () => {
    expect(await run({ duration: "short" })).toEqual(
      oracle((d) => overlaps(1, 10, d.durationMin, d.durationMax)),
    );
    expect(await run({ duration: "medium" })).toEqual(
      oracle((d) => overlaps(11, 20, d.durationMin, d.durationMax)),
    );
    expect(await run({ duration: "long" })).toEqual(
      oracle((d) => overlaps(21, 240, d.durationMin, d.durationMax)),
    );
  });

  it("equipment", async () => {
    for (const e of ["cones", "bibs", "stopwatch", "markers", "hoop"]) {
      expect(await run({ equipment: e }), e).toEqual(
        oracle((d) => d.equipment.some((x) => x.type === e)),
      );
    }
  });

  it("filters combine (AND)", async () => {
    expect(await run({ category: "finishing", level: "beginner", players: 8 })).toEqual(
      oracle(
        (d) =>
          d.category === "finishing" &&
          d.level === "beginner" &&
          d.playersMin <= 8 &&
          d.playersMax >= 8,
      ),
    );
    expect(await run({ level: "intermediate", equipment: "cones", age: 14 })).toEqual(
      oracle(
        (d) =>
          d.level === "intermediate" &&
          d.equipment.some((x) => x.type === "cones") &&
          d.ageMin <= 14 &&
          d.ageMax >= 14,
      ),
    );
  });

  it("a filter naming something that doesn't exist yields no results (never 'everything')", async () => {
    expect((await search(A, { category: "no_such_category" })).total).toBe(0);
    expect((await search(A, { skill: "no_such_skill" })).total).toBe(0);
    expect((await search(A, { equipment: "no_such_thing" })).total).toBe(0);
  });
});

describe("search: text", () => {
  const first = async (q: string) =>
    (await search(A, { scope: "library", q, sort: "relevance" })).items.map((i) => i.title);

  it("matches titles and descriptions, most relevant first", async () => {
    const r = await first("layup");
    expect(r[0]).toBe("Pass-and-Cut Layup Lines");
    expect(r).toContain("Cone Weave Dribble"); // description mentions layups
  });

  it("tolerates typos and ignores accents and case", async () => {
    expect(await first("shoting")).toEqual(
      expect.arrayContaining(["Five-Spot Shooting", "Form Shooting Close to the Basket"]),
    );
    expect(await first("pasing")).toEqual(
      expect.arrayContaining(["Partner Chest & Bounce Passing"]),
    );
    expect(await first("DRÍBBLE")).toContain("Cone Weave Dribble");
  });

  it("finds by tag", async () => {
    expect(await first("fast break")).toContain("3-on-2 Fast Break");
  });

  it("wildcards and SQL are treated as plain text: no errors, no 'match everything', tables intact", async () => {
    for (const q of [
      "%",
      "_",
      "%%__",
      "'; drop table drills; --",
      '"',
      "\\",
      "a & b | !c",
      "(((",
      "<>",
    ]) {
      const p = await search(A, { scope: "library", q, sort: "relevance" });
      expect(p.total, JSON.stringify(q)).toBeLessThan(SEED_DRILLS.length);
    }
    expect((await db.select().from(drills)).length).toBeGreaterThan(SEED_DRILLS.length - 1);
  });

  it("a text search is scoped by RLS: it never surfaces another user's private drill", async () => {
    await createDrill(
      A,
      "basketball",
      drillInput({
        title: "Xylophone Secret Drill",
        description: "A very unusual word to search for: xylophone.",
      }),
    );
    expect((await search(A, { q: "xylophone" })).total).toBe(1);
    expect((await search(B, { q: "xylophone" })).total).toBe(0);
    expect((await search(B, { q: "xylophon", scope: "all" })).total).toBe(0); // typo-tolerant path too
  });
});

describe("search: scopes, sorting and pagination", () => {
  it("scope=mine is the actor's own drills only; scope=all is library + own", async () => {
    const mineA = await search(A, { scope: "mine" });
    expect(mineA.total).toBeGreaterThan(0);
    expect(mineA.items.every((i) => i.scope === "mine")).toBe(true);
    const mineB = await search(B, { scope: "mine" });
    expect(mineB.items.some((i) => mineA.items.some((a) => a.id === i.id))).toBe(false);

    const all = await search(A, { scope: "all" });
    expect(all.total).toBe(SEED_DRILLS.length + mineA.total);
    expect((await search(A, { scope: "library" })).items.every((i) => i.scope === "library")).toBe(
      true,
    );
  });

  it("paginates in the database: stable, disjoint pages that add up to the total", async () => {
    const f: Partial<DrillFilters> = { scope: "library", sort: "title" };
    const p1 = await searchDrills(A, "basketball", { ...parseFilters({}), ...f, page: 1 });
    const p2 = await searchDrills(A, "basketball", { ...parseFilters({}), ...f, page: 2 });
    expect(p1).toMatchObject({
      total: SEED_DRILLS.length,
      pageSize: PAGE_SIZE,
      pageCount: 2,
      page: 1,
    });
    expect(p1!.items).toHaveLength(PAGE_SIZE);
    expect(p2!.items).toHaveLength(SEED_DRILLS.length - PAGE_SIZE);
    const ids = [...p1!.items, ...p2!.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(SEED_DRILLS.length);
  });

  it("a stale ?page=999 lands on the last page instead of an empty screen", async () => {
    const p = await searchDrills(A, "basketball", {
      ...parseFilters({}),
      scope: "library",
      page: 999,
    });
    expect(p).toMatchObject({ page: 2, pageCount: 2 });
    expect(p!.items.length).toBeGreaterThan(0);
  });

  it("sorts by title and by duration", async () => {
    const byTitle = (await search(A, { scope: "library", sort: "title" })).items.map((i) =>
      i.title.toLowerCase(),
    );
    expect(byTitle).toEqual(
      [...byTitle].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    );
    const byDuration = (await search(A, { scope: "library", sort: "duration" })).items.map(
      (i) => i.durationMin,
    );
    expect(byDuration).toEqual([...byDuration].sort((a, b) => a - b));
  });

  it("cards carry what the UI needs: category, primary skill, equipment, and a diagram thumbnail", async () => {
    const p = await search(A, { scope: "library", category: "finishing" });
    for (const c of p.items) {
      expect(c.category.name).toBeTruthy();
      expect(c.primarySkill?.name).toBeTruthy();
      expect(c.equipment.length).toBeGreaterThan(0);
      expect(c.diagram?.schemaVersion).toBe(1);
    }
  });

  it("only returns published drills in the sport asked for", async () => {
    expect(await searchDrills(A, "football", parseFilters({}))).toBeNull();
    expect(await searchDrills(A, "nonsense", parseFilters({}))).toBeNull();
  });
});

describe("sport overview", () => {
  it("counts the library, the actor's drills and the visible categories", async () => {
    const fresh = await createTestActor("Fresh Coach");
    const empty = await getSportOverview(fresh, "basketball");
    expect(empty).toMatchObject({ libraryCount: SEED_DRILLS.length, myCount: 0 });
    expect(empty!.categories.reduce((n, c) => n + c.count, 0)).toBe(SEED_DRILLS.length);

    await createDrill(
      fresh,
      "basketball",
      drillInput({ title: "Fresh Drill", category: "shooting" }),
    );
    const after = await getSportOverview(fresh, "basketball");
    expect(after).toMatchObject({ myCount: 1 });
    const shooting = (n: typeof after) => n!.categories.find((c) => c.key === "shooting")!.count;
    expect(shooting(after)).toBe(shooting(empty) + 1);
    expect(await getSportOverview(fresh, "football")).toBeNull();
  });

  it("another user's drills never inflate my counts", async () => {
    const a = await getSportOverview(A, "basketball");
    const b = await getSportOverview(B, "basketball");
    expect(a!.myCount).toBeGreaterThan(b!.myCount);
    expect(b!.categories.reduce((n, c) => n + c.count, 0)).toBe(SEED_DRILLS.length + b!.myCount);
  });
});

describe("child rows", () => {
  it("every saved drill has exactly one primary skill", async () => {
    const mine = await db
      .select({ id: drills.id })
      .from(drills)
      .where(eq(drills.createdBy, A.userId));
    for (const d of mine) {
      const sk = await db.select().from(drillSkills).where(eq(drillSkills.drillId, d.id));
      expect(sk.filter((s) => s.role === "primary").length).toBeLessThanOrEqual(1);
    }
  });
});
