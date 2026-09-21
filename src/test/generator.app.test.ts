import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditEvents, plans } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import { archiveDrill, createDrill } from "@/modules/drills/commands";
import {
  createGeneratedSession,
  loadCandidates,
  previewGeneration,
  reviseGeneration,
  type GenerationLabels,
  type GenerationPreview,
} from "@/modules/generator";
import { updateActivity } from "@/modules/plans/commands";
import { getPlan } from "@/modules/plans/queries";
import { updateActivitySchema } from "@/modules/plans/validators";
import { createClub, drillInput } from "./drill-fixtures";
import { createTestActor } from "./factories";

/**
 * The generator's server side against a real database: what a coach can be offered (row-level security decides), that
 * a generated session is an ordinary session, and that nothing unsound or invented is ever created.
 */

const SPORT = "basketball";
const labels: GenerationLabels = {
  breakTitle: "Water break",
  title: (objective, minutes) => `${objective} · ${minutes} min`,
};
let coach: Actor;
let teacher: Actor;
let assistant: Actor;
let outsider: Actor;

const good = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r.error)}`);
  return r.data;
};
const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);

const request = (over: Record<string, unknown> = {}) => ({
  players: 12,
  durationMin: 75,
  ageGroup: "u14",
  level: "beginner",
  primaryObjective: "ball_handling",
  ...over,
});

const asItems = (p: GenerationPreview) =>
  p.items.map((i) => ({
    kind: i.kind,
    drillId: i.drillId,
    phase: i.phase,
    durationMin: i.durationMin,
    locked: i.locked,
  }));

beforeAll(async () => {
  const founder = await createTestActor("Gen Founder");
  const club = await createClub(founder, [
    { role: "coach", name: "Gia Coach" },
    { role: "teacher", name: "Tom Teacher" },
    { role: "assistant", name: "Ann Assistant" },
  ]);
  [coach, teacher, assistant] = club.members as [Actor, Actor, Actor];
  outsider = await createTestActor("Gen Outsider");
});

afterAll(async () => {
  await pool.end();
});

describe("what the generator may choose from", () => {
  it("offers the published library drills, as metadata only", async () => {
    const all = await loadCandidates(coach, SPORT);
    expect(all.length).toBeGreaterThanOrEqual(40);
    const mikan = all.find((d) => d.title === "Mikan Drill")!;
    expect(mikan).toMatchObject({
      category: "finishing",
      primarySkill: "finishing",
      level: "beginner",
      scope: "library",
    });
    expect(mikan.secondarySkills).toEqual(expect.arrayContaining(["footwork", "ball_control"]));
    expect(mikan.subSkills).toContain("both_hands_finishing");
    expect(mikan.equipment).toEqual(
      expect.arrayContaining([{ key: "hoop", rule: "fixed", quantity: 1 }]),
    );
    expect(Object.keys(mikan)).not.toContain("content");
  });

  it("adds the coach's own and shared drills, never a colleague's private drill or another workspace's", async () => {
    const mine = good(await createDrill(coach, SPORT, drillInput({ title: "Gia Private Drill" })));
    const shared = good(
      await createDrill(
        coach,
        SPORT,
        drillInput({ title: "Gia Shared Drill", visibility: "organization" }),
      ),
    );
    const foreign = good(
      await createDrill(
        outsider,
        SPORT,
        drillInput({ title: "Otto Shared Drill", visibility: "organization" }),
      ),
    );
    const ids = (list: Array<{ id: string }>) => list.map((d) => d.id);
    const gia = await loadCandidates(coach, SPORT);
    expect(ids(gia)).toEqual(expect.arrayContaining([mine.id, shared.id]));
    expect(ids(gia)).not.toContain(foreign.id);
    expect(gia.find((d) => d.id === mine.id)!.scope).toBe("mine");
    expect(gia.find((d) => d.id === shared.id)!.scope).toBe("mine");

    const tom = await loadCandidates(teacher, SPORT);
    expect(ids(tom)).toContain(shared.id);
    expect(ids(tom)).not.toContain(mine.id);
    expect(tom.find((d) => d.id === shared.id)!.scope).toBe("workspace");

    const otto = await loadCandidates(outsider, SPORT);
    expect(ids(otto)).toContain(foreign.id);
    expect(ids(otto)).not.toContain(shared.id);

    good(await archiveDrill(coach, SPORT, shared.id));
    expect(ids(await loadCandidates(coach, SPORT))).not.toContain(shared.id);
  });

  it("finds nothing for an unknown sport", async () => {
    expect(await loadCandidates(coach, "quidditch")).toEqual([]);
  });
});

describe("previewing a generated session", () => {
  it("builds a sound timeline of real drills that adds up to the requested minutes", async () => {
    const p = good(await previewGeneration(coach, SPORT, request()));
    expect(p.validation.ok).toBe(true);
    expect(p.items.reduce((n, i) => n + i.durationMin, 0)).toBe(75);
    expect(p.items.filter((i) => i.kind === "drill").length).toBeGreaterThanOrEqual(4);
    for (const i of p.items.filter((x) => x.kind === "drill")) {
      expect(p.drills[i.drillId!]).toBeDefined();
      expect(i.reasons.length).toBeGreaterThan(0);
    }
    expect(p.requirements).toMatchObject({ ageMin: 13, ageMax: 14 }); // from the age group
  });

  it("gives the same answer for the same request, and another one for another variant", async () => {
    const a = good(await previewGeneration(coach, SPORT, request()));
    const b = good(await previewGeneration(coach, SPORT, request()));
    expect(asItems(a)).toEqual(asItems(b));
    const others = [];
    for (const variant of [1, 2, 3, 4]) {
      const v = good(await previewGeneration(coach, SPORT, request({ variant })));
      expect(v.validation.ok).toBe(true);
      others.push(asItems(v).map((i) => i.drillId));
    }
    expect(
      others.some(
        (ids) =>
          ids.join() !==
          asItems(a)
            .map((i) => i.drillId)
            .join(),
      ),
    ).toBe(true);
  });

  it("respects the equipment and the players it is told about", async () => {
    const p = good(
      await previewGeneration(
        coach,
        SPORT,
        request({ players: 20, baskets: 1, equipment: { basketball: 6, cones: 6 } }),
      ),
    );
    for (const [key, have] of [
      ["hoop", 1],
      ["basketball", 6],
      ["cones", 6],
    ] as const) {
      if (p.equipment[key] !== undefined) expect(p.equipment[key]).toBeLessThanOrEqual(have);
    }
    for (const i of p.items.filter((x) => x.kind === "drill")) {
      expect(p.drills[i.drillId!]!.playersMin).toBeLessThanOrEqual(20);
    }
  });

  it("keeps the drills the coach insists on, and drops the ones excluded", async () => {
    const base = good(await previewGeneration(coach, SPORT, request()));
    const drillIds = base.items.filter((i) => i.drillId).map((i) => i.drillId!);
    const p = good(
      await previewGeneration(coach, SPORT, request({ exclude: [drillIds[1]!], variant: 0 })),
    );
    expect(p.items.map((i) => i.drillId)).not.toContain(drillIds[1]);
    const all = await loadCandidates(coach, SPORT);
    const wanted = all.find((d) => d.title === "Mikan Drill")!.id;
    const withWanted = good(
      await previewGeneration(coach, SPORT, request({ mustInclude: [wanted] })),
    );
    expect(withWanted.items.find((i) => i.drillId === wanted)).toMatchObject({ locked: true });
  });

  it("is refused for an assistant, an unknown sport and an invalid request — with the fields named", async () => {
    expect(codeOf(await previewGeneration(assistant, SPORT, request()))).toBe("FORBIDDEN");
    expect(codeOf(await previewGeneration(coach, "quidditch", request()))).toBe("NOT_FOUND");

    const bad = await previewGeneration(coach, SPORT, request({ players: 0 }));
    expect(bad.ok ? "OK" : bad.error.code).toBe("VALIDATION");
    expect(bad.ok ? [] : Object.keys(bad.error.fields ?? {})).toContain("players");
    const noObjective = await previewGeneration(coach, SPORT, request({ primaryObjective: "" }));
    expect(noObjective.ok ? [] : Object.keys(noObjective.error.fields ?? {})).toContain(
      "primaryObjective",
    );
    const unknownObjective = await previewGeneration(
      coach,
      SPORT,
      request({ primaryObjective: "telepathy" }),
    );
    expect(unknownObjective.ok ? "" : unknownObjective.error.fields?.primaryObjective).toEqual([
      "invalid",
    ]);
    const unknownAge = await previewGeneration(coach, SPORT, request({ ageGroup: "u99" }));
    expect(unknownAge.ok ? "" : unknownAge.error.fields?.ageGroup).toEqual(["invalid"]);
    // a field the schema does not know is refused, not ignored
    expect(codeOf(await previewGeneration(coach, SPORT, { ...request(), sql: "drop table" }))).toBe(
      "VALIDATION",
    );
  });
});

describe("revising what a coach has arranged", () => {
  it("marks a hand-picked drill as locked, offers alternatives, and re-validates", async () => {
    const p = good(await previewGeneration(coach, SPORT, request()));
    const items = asItems(p);
    const at = items.findIndex((i) => i.kind === "drill" && i.phase === "skill");
    const alt = p.items[at]!.alternatives[0]!;
    items[at] = { ...items[at]!, drillId: alt.drillId, locked: true };
    const r = good(await reviseGeneration(coach, SPORT, request(), items));
    expect(r.items[at]).toMatchObject({ drillId: alt.drillId, locked: true });
    expect(r.items[at]!.reasons).toEqual([{ code: "locked" }]);
    expect(r.items[at]!.alternatives.length).toBeGreaterThan(0);
    expect(r.validation.ok).toBe(true);
  });

  it("reports the problems of a timeline that does not add up", async () => {
    const p = good(await previewGeneration(coach, SPORT, request()));
    const items = asItems(p);
    items[0] = { ...items[0]!, durationMin: items[0]!.durationMin + 7 };
    const r = good(await reviseGeneration(coach, SPORT, request(), items));
    expect(r.validation.ok).toBe(false);
    expect(r.validation.issues.map((i) => i.code)).toContain("duration_mismatch");
  });

  it("does not know a drill it cannot read: invented, foreign and archived ids are all 'not found'", async () => {
    const p = good(await previewGeneration(coach, SPORT, request()));
    const foreign = good(
      await createDrill(
        outsider,
        SPORT,
        drillInput({ title: "Otto Secret", visibility: "private" }),
      ),
    );
    for (const id of ["0192a000-0000-7000-8000-0000000000ff", foreign.id]) {
      const items = asItems(p);
      items[1] = { ...items[1]!, drillId: id };
      expect(codeOf(await reviseGeneration(coach, SPORT, request(), items))).toBe("NOT_FOUND");
    }
    const items = asItems(p);
    items[1] = { ...items[1]!, drillId: "not-a-uuid" };
    expect(codeOf(await reviseGeneration(coach, SPORT, request(), items))).toBe("VALIDATION");
    expect(codeOf(await reviseGeneration(coach, SPORT, request(), []))).toBe("VALIDATION");
  });
});

describe("creating the generated session", () => {
  const count = async (title: string) =>
    (
      await tenantTx(coach, (tx) =>
        tx
          .select({ id: plans.id })
          .from(plans)
          .where(and(eq(plans.title, title), eq(plans.organizationId, coach.organizationId))),
      )
    ).length;

  it("creates an ordinary session, with copied drill snapshots, in one step", async () => {
    const req = request({
      title: "Generated Tuesday",
      teamName: "U14 Girls",
      secondaryObjectives: ["passing"],
    });
    const p = good(await previewGeneration(coach, SPORT, req));
    const created = good(
      await createGeneratedSession(
        coach,
        SPORT,
        req,
        asItems(p),
        { visibility: "private" },
        labels,
      ),
    );
    expect(created.version).toBe(1);

    const plan = (await getPlan(coach, SPORT, created.id))!;
    expect(plan).toMatchObject({
      title: "Generated Tuesday",
      teamName: "U14 Girls",
      status: "draft",
      level: "beginner",
      players: 12,
      ageMin: 13,
      ageMax: 14,
      permissions: { canEdit: true },
    });
    expect(plan.ageGroup?.key).toBe("u14");
    expect(plan.objectives.primary?.key).toBe("ball_handling");
    expect(plan.objectives.secondary.map((o) => o.key)).toEqual(["passing"]);
    expect(plan.totals).toMatchObject({ totalMinutes: 75, targetMinutes: 75, remainingMinutes: 0 });
    expect(plan.activities).toHaveLength(p.items.length);
    p.items.forEach((item, i) => {
      const a = plan.activities[i]!;
      expect(a.durationMin).toBe(item.durationMin);
      expect(a.kind).toBe(item.kind);
      if (item.kind === "drill") {
        expect(a.source.drillId).toBe(item.drillId);
        expect(a.title).toBe(item.title);
        expect(a.snapshotValid).toBe(true);
        expect(a.snapshot).toMatchObject({ title: item.title });
      } else {
        expect(a.title).toBe("Water break");
      }
    });

    const [event] = await tenantTx(coach, (tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.entityId, created.id), eq(auditEvents.action, "plan.created"))),
    );
    expect(event!.metadata).toMatchObject({ origin: "generator", activities: p.items.length });
  });

  it("is editable like any session: the builder's own command works on it", async () => {
    const req = request({ title: "Generated then edited" });
    const p = good(await previewGeneration(coach, SPORT, req));
    const created = good(await createGeneratedSession(coach, SPORT, req, asItems(p), {}, labels));
    const plan = (await getPlan(coach, SPORT, created.id))!;
    const first = plan.activities[0]!;
    const changed = good(
      await updateActivity(
        coach,
        SPORT,
        created.id,
        first.id,
        updateActivitySchema.parse({ version: plan.version, durationMin: first.durationMin + 1 }),
      ),
    );
    expect(changed.version).toBe(2);
  });

  it("names the session from the objective when the coach gave no title", async () => {
    const req = request({ title: "" });
    const p = good(await previewGeneration(coach, SPORT, req));
    const created = good(await createGeneratedSession(coach, SPORT, req, asItems(p), {}, labels));
    expect((await getPlan(coach, SPORT, created.id))!.title).toBe("Ball Handling · 75 min");
  });

  it("takes the schedule and details from the extras, and ignores anything else in them", async () => {
    const req = request({ title: "Generated scheduled" });
    const p = good(await previewGeneration(coach, SPORT, req));
    const created = good(
      await createGeneratedSession(
        coach,
        SPORT,
        req,
        asItems(p),
        {
          scheduledDate: "2030-05-06",
          startTime: "18:30",
          timezone: "Europe/Paris",
          details: { location: "Gym A" },
          createdBy: "someone-else",
          organizationId: "another-org",
          status: "published",
        },
        labels,
      ),
    );
    const plan = (await getPlan(coach, SPORT, created.id))!;
    expect(plan).toMatchObject({ scheduledDate: "2030-05-06", status: "draft", isMine: true });
    expect(plan.startTime?.slice(0, 5)).toBe("18:30");
    expect(plan.details.location).toBe("Gym A");
  });

  it("refuses an unsound timeline and creates nothing", async () => {
    const req = request({ title: "Generated refused" });
    const p = good(await previewGeneration(coach, SPORT, req));
    const items = asItems(p);
    items[0] = { ...items[0]!, durationMin: items[0]!.durationMin + 5 };
    const r = await createGeneratedSession(coach, SPORT, req, items, {}, labels);
    expect(r.ok ? "OK" : r.error.code).toBe("VALIDATION");
    expect(r.ok ? [] : r.error.fields?.generator).toContain("duration_mismatch");
    expect(await count("Generated refused")).toBe(0);
  });

  it("creates nothing when a drill is not one the coach can read (all or nothing)", async () => {
    const req = request({ title: "Generated invented" });
    const p = good(await previewGeneration(coach, SPORT, req));
    const items = asItems(p);
    items[items.length - 2] = {
      ...items[items.length - 2]!,
      drillId: "0192a000-0000-7000-8000-0000000000ff",
    };
    expect(codeOf(await createGeneratedSession(coach, SPORT, req, items, {}, labels))).toBe(
      "NOT_FOUND",
    );
    expect(await count("Generated invented")).toBe(0);
  });

  it("is refused for roles that cannot author sessions, and for invalid extras", async () => {
    const req = request({ title: "Generated forbidden" });
    const p = good(await previewGeneration(coach, SPORT, req));
    expect(
      codeOf(await createGeneratedSession(assistant, SPORT, req, asItems(p), {}, labels)),
    ).toBe("FORBIDDEN");
    const bad = await createGeneratedSession(
      coach,
      SPORT,
      req,
      asItems(p),
      { scheduledDate: "not a date" },
      labels,
    );
    expect(bad.ok ? "OK" : bad.error.code).toBe("VALIDATION");
    expect(await count("Generated forbidden")).toBe(0);
  });

  it("works for a teacher with their workspace's shared drills, and never leaks a colleague's private one", async () => {
    const priv = good(
      await createDrill(
        coach,
        SPORT,
        drillInput({ title: "Gia Hidden Drill", visibility: "private" }),
      ),
    );
    const req = request({ title: "Generated by teacher" });
    const p = good(await previewGeneration(teacher, SPORT, req));
    expect(p.items.some((i) => i.drillId === priv.id)).toBe(false);
    const items = asItems(p);
    items[1] = { ...items[1]!, drillId: priv.id };
    expect(codeOf(await createGeneratedSession(teacher, SPORT, req, items, {}, labels))).toBe(
      "NOT_FOUND",
    );
  });
});
