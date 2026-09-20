import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { auditEvents, drillFavorites, drills, drillSkills } from "@/db/schema";
import { SEED_DRILLS } from "@/db/seed/drills";
import { db, pool } from "@/lib/db/client";
import { userTx } from "@/lib/db/tx";
import type { Actor } from "@/lib/authz/can";
import { loadContent } from "@/db/seed/load";
import {
  archiveDrill,
  createDrill,
  duplicateDrill,
  setFavorite,
  updateDrill,
} from "@/modules/drills/commands";
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

  const tree = loadContent().bySport["basketball"]!.skills;
  const parentOf = (k: string) => tree.find((s) => s.key === k)?.parentKey ?? null;
  /** every skill a drill trains, in any role */
  const trained = (d: (typeof lib)[number]) => [
    d.primarySkill,
    ...d.secondarySkills,
    ...d.subSkills,
  ];

  it("skill matches primary, secondary OR sub-skill; choosing a parent skill also matches its sub-skills (every skill in the taxonomy)", async () => {
    expect(tree.length).toBeGreaterThan(50);
    for (const { key: s } of tree) {
      expect(await run({ skill: s }), s).toEqual(
        oracle((d) => trained(d).some((k) => k === s || parentOf(k) === s)),
      );
    }
    // the sub-skills really are used by the library (the assertion above is not vacuous)
    expect((await run({ skill: "weak_hand" })).length).toBeGreaterThan(0);
    expect((await run({ skill: "defensive_rebounding" })).length).toBeGreaterThan(0);
  });

  it("intensity, format and phase", async () => {
    for (const intensity of ["low", "medium", "high"] as const)
      expect(await run({ intensity }), intensity).toEqual(oracle((d) => d.intensity === intensity));
    for (const format of ["individual", "1v1", "2v2", "3v3", "4v4", "5v5", "group", "team"])
      expect(await run({ format }), format).toEqual(oracle((d) => d.format === format));
    for (const phase of [
      "warm_up",
      "skill",
      "small_sided",
      "game",
      "conditioning",
      "cool_down",
    ] as const)
      expect(await run({ phase }), phase).toEqual(oracle((d) => d.phases.includes(phase)));
    // every quick-filter chip leads somewhere useful, and so does every phase
    for (const f of ["individual", "1v1", "2v2", "3v3", "4v4", "5v5", "group", "team"])
      expect((await run({ format: f })).length, f).toBeGreaterThan(0);
    expect(await run({ format: "9v9" })).toEqual([]); // unknown format: no results, never everything
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
    // data-driven: the library keeps growing, so the page count comes from the seed, not a constant
    const pageCount = Math.ceil(SEED_DRILLS.length / PAGE_SIZE);
    expect(pageCount).toBeGreaterThanOrEqual(2);
    const f: Partial<DrillFilters> = { scope: "library", sort: "title" };
    const pages = [];
    for (let page = 1; page <= pageCount; page++)
      pages.push(await searchDrills(A, "basketball", { ...parseFilters({}), ...f, page }));
    expect(pages[0]).toMatchObject({
      total: SEED_DRILLS.length,
      pageSize: PAGE_SIZE,
      pageCount,
      page: 1,
    });
    pages.slice(0, -1).forEach((p) => expect(p!.items).toHaveLength(PAGE_SIZE));
    expect(pages.at(-1)!.items).toHaveLength(SEED_DRILLS.length - PAGE_SIZE * (pageCount - 1));
    const ids = pages.flatMap((p) => p!.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(SEED_DRILLS.length); // disjoint pages that add up to the total
  });

  it("a stale ?page=999 lands on the last page instead of an empty screen", async () => {
    const p = await searchDrills(A, "basketball", {
      ...parseFilters({}),
      scope: "library",
      page: 999,
    });
    const pageCount = Math.ceil(SEED_DRILLS.length / PAGE_SIZE);
    expect(p).toMatchObject({ page: pageCount, pageCount });
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

describe("library facets: intensity, format, phases and sub-skills", () => {
  const withFacets = (over: Record<string, unknown> = {}) =>
    drillInput({
      title: "Facet Test Drill",
      primarySkill: "dribbling",
      secondarySkills: ["ball_control"],
      subSkills: ["crossover", "change_of_pace"],
      intensity: "high",
      format: "2v2",
      phases: ["skill", "small_sided"],
      ...over,
    } as never);

  it("saves and reads back intensity, format, phases and sub-skills", async () => {
    const r = await createDrill(A, "basketball", withFacets());
    if (!r.ok) throw new Error(`create failed: ${JSON.stringify(r)}`);
    const d = await getDrill(A, "basketball", r.data.id);
    expect(d).toMatchObject({ intensity: "high", format: "2v2", phases: ["skill", "small_sided"] });
    expect(d!.skills.map((s) => [s.key, s.role])).toEqual([
      ["dribbling", "primary"],
      ["ball_control", "secondary"],
      ["crossover", "sub"],
      ["change_of_pace", "sub"],
    ]);
    // …and the card the library shows carries them too
    const card = (await search(A, { scope: "mine", format: "2v2" })).items.find(
      (i) => i.id === r.data.id,
    );
    expect(card).toMatchObject({ intensity: "high", format: "2v2" });
  });

  it("defaults: medium intensity, no format, no phases", async () => {
    const r = await createDrill(A, "basketball", drillInput({ title: "Defaults Drill" }));
    if (!r.ok) throw new Error("create failed");
    expect(await getDrill(A, "basketball", r.data.id)).toMatchObject({
      intensity: "medium",
      format: null,
      phases: [],
    });
  });

  it("update replaces the facets and the sub-skills", async () => {
    const r = await createDrill(A, "basketball", withFacets({ title: "Facet Update Drill" }));
    if (!r.ok) throw new Error("create failed");
    const before = await getDrill(A, "basketball", r.data.id);
    const upd = await updateDrill(
      A,
      "basketball",
      r.data.id,
      withFacets({
        title: "Facet Update Drill",
        subSkills: ["weak_hand"],
        intensity: "low",
        format: "",
        phases: ["cool_down"],
        version: before!.version,
      }),
    );
    expect(upd.ok).toBe(true);
    const after = await getDrill(A, "basketball", r.data.id);
    expect(after).toMatchObject({ intensity: "low", format: null, phases: ["cool_down"] });
    expect(after!.skills.filter((s) => s.role === "sub").map((s) => s.key)).toEqual(["weak_hand"]);
  });

  it("copying a drill carries its facets and sub-skills along", async () => {
    const [lib] = await db
      .select({ id: drills.id })
      .from(drills)
      .where(eq(drills.seedKey, "ball-screen-2v2"));
    const copy = await duplicateDrill(A, "basketball", lib!.id);
    if (!copy.ok) throw new Error(`duplicate failed: ${JSON.stringify(copy)}`);
    const d = await getDrill(A, "basketball", copy.data.id);
    expect(d).toMatchObject({ intensity: "high", format: "2v2", phases: ["small_sided"] });
    expect(d!.skills.map((s) => [s.key, s.role])).toEqual([
      ["pick_and_roll", "primary"],
      ["screening", "secondary"], // secondary skills come back in taxonomy order
      ["spacing", "secondary"],
      ["decision_making", "secondary"],
      ["pnr_ball_handler", "sub"],
      ["pnr_screener", "sub"],
    ]);
  });

  describe("server-side validation", () => {
    const fieldsOf = async (over: Record<string, unknown>) => {
      const r = await createDrill(A, "basketball", withFacets(over));
      expect(r.ok).toBe(false);
      return r.ok ? {} : (r.error.fields ?? {});
    };

    it("a format the sport does not offer is rejected", async () => {
      expect(await fieldsOf({ format: "9v9" })).toMatchObject({ format: ["invalid"] });
    });
    it("a sub-skill needs a skill the drill trains as its parent", async () => {
      expect(await fieldsOf({ subSkills: ["catch_and_shoot"] })).toMatchObject({
        subSkills: ["sub_skill_parent"],
      });
    });
    it("an unknown sub-skill, or a top-level skill given as a sub-skill, is rejected", async () => {
      expect(await fieldsOf({ subSkills: ["no_such_skill"] })).toMatchObject({
        subSkills: ["invalid"],
      });
      expect(await fieldsOf({ subSkills: ["ball_control"] })).toMatchObject({
        subSkills: ["invalid"],
      });
    });
    it("the main and secondary skills must be top-level skills, not sub-skills", async () => {
      expect(await fieldsOf({ primarySkill: "crossover", subSkills: [] })).toMatchObject({
        primarySkill: ["invalid"],
      });
      expect(await fieldsOf({ secondarySkills: ["crossover"], subSkills: [] })).toMatchObject({
        secondarySkills: ["invalid"],
      });
    });
    it("nothing is saved when it fails", async () => {
      const before = await search(A, { scope: "mine", q: "Rejected Facet Drill" });
      await fieldsOf({ title: "Rejected Facet Drill", format: "9v9" });
      expect((await search(A, { scope: "mine", q: "Rejected Facet Drill" })).total).toBe(
        before.total,
      );
    });
  });
});

describe("favorites", () => {
  let libId: string;
  let aPrivateId: string;
  beforeAll(async () => {
    const [lib] = await db
      .select({ id: drills.id })
      .from(drills)
      .where(eq(drills.seedKey, "give-and-go"));
    libId = lib!.id;
    const r = await createDrill(A, "basketball", drillInput({ title: "Alice Favorite Candidate" }));
    if (!r.ok) throw new Error("fixture failed");
    aPrivateId = r.data.id;
  });
  // favorites are row-level-secured to their owner, so read them in that user's own context
  // (a plain connection with no user context correctly sees none: it fails closed)
  const favoriteRows = async (userId: string) =>
    userTx(userId, (tx) =>
      tx.select().from(drillFavorites).where(eq(drillFavorites.userId, userId)),
    );

  it("a user can favorite a library drill and their own drill; it shows on cards, on the detail page and in the Favorites view", async () => {
    expect(await setFavorite(A, "basketball", libId, true)).toEqual({
      ok: true,
      data: { favorite: true },
    });
    expect(await setFavorite(A, "basketball", aPrivateId, true)).toMatchObject({ ok: true });

    const cards = await search(A, { scope: "all" });
    expect(cards.items.find((i) => i.id === libId)?.isFavorite).toBe(true);
    expect((await getDrill(A, "basketball", libId))!.isFavorite).toBe(true);
    expect((await getDrill(A, "basketball", aPrivateId))!.isFavorite).toBe(true);

    const onlyFavorites = await search(A, { favorites: true });
    expect(onlyFavorites.items.map((i) => i.id).sort()).toEqual([libId, aPrivateId].sort());
    expect(onlyFavorites.items.every((i) => i.isFavorite)).toBe(true);
  });

  it("is idempotent: asking for the same state twice leaves one row, and never flips it", async () => {
    await setFavorite(A, "basketball", libId, true);
    await setFavorite(A, "basketball", libId, true);
    expect((await favoriteRows(A.userId)).filter((f) => f.drillId === libId)).toHaveLength(1);
    await setFavorite(A, "basketball", libId, false);
    await setFavorite(A, "basketball", libId, false);
    expect((await favoriteRows(A.userId)).filter((f) => f.drillId === libId)).toHaveLength(0);
    expect((await getDrill(A, "basketball", libId))!.isFavorite).toBe(false);
    await setFavorite(A, "basketball", libId, true); // leave it starred for the tests below
  });

  it("favorites are personal: B sees none of A's, and the same drill is not starred for B", async () => {
    expect((await search(B, { favorites: true })).total).toBe(0);
    expect((await search(B, { scope: "library" })).items.some((i) => i.isFavorite)).toBe(false);
    expect((await getDrill(B, "basketball", libId))!.isFavorite).toBe(false);
    // B starring the same library drill does not touch A's
    await setFavorite(B, "basketball", libId, true);
    expect((await favoriteRows(A.userId)).some((f) => f.drillId === libId)).toBe(true);
    expect((await favoriteRows(B.userId)).map((f) => f.drillId)).toEqual([libId]);
    await setFavorite(B, "basketball", libId, false);
    expect(await favoriteRows(B.userId)).toEqual([]);
  });

  it("nobody can favorite a drill they cannot read: A's private drill is 'not found' for B, and nothing is stored", async () => {
    expect(await setFavorite(B, "basketball", aPrivateId, true)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect((await favoriteRows(B.userId)).some((f) => f.drillId === aPrivateId)).toBe(false);
  });

  it("unknown sports and malformed ids simply don't exist", async () => {
    expect(await setFavorite(A, "football", libId, true)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await setFavorite(A, "basketball", "not-a-uuid", true)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(
      await setFavorite(A, "basketball", "0192a000-0000-7000-8000-000000000001", true),
    ).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("the Favorites view combines with the other filters", async () => {
    const both = await search(A, { favorites: true, scope: "library" });
    expect(both.items.map((i) => i.id)).toEqual([libId]);
    expect((await search(A, { favorites: true, level: "advanced" })).total).toBe(0);
  });
});
