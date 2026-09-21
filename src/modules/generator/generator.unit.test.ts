import { describe, expect, it } from "vitest";
import { requirementsSchema } from "./requirements";
import { generateSession } from "./generate";
import {
  ageFit,
  equipmentNeed,
  equipmentShortfalls,
  groupsFor,
  isEligible,
  levelFit,
  planSlots,
  slotIntensity,
  spaceFits,
} from "./rules";
import { drillIdOf, libraryCandidates, objectiveRules, request } from "./test-support";
import { servesObjective, validateSession } from "./validate";
import type { DrillCandidate, GeneratedItem } from "./types";

const drills = libraryCandidates();
const objectives = objectiveRules();
const byId = new Map(drills.map((d) => [d.id, d]));
const run = (over: Parameters<typeof request>[0] = {}, pool = drills) =>
  generateSession({ req: request(over), drills: pool, objectives });
const idsOf = (s: ReturnType<typeof run>) => s.items.flatMap((i) => (i.drillId ? [i.drillId] : []));
const minutes = (s: ReturnType<typeof run>) => s.items.reduce((n, i) => n + i.durationMin, 0);
const seed = (d: DrillCandidate) => [...byId.entries()].find(([, v]) => v === d)?.[0];

describe("the request", () => {
  it("is validated like anything a browser sends, with defaults for everything optional", () => {
    const r = requirementsSchema.parse({ players: 14, durationMin: 60 });
    expect(r).toMatchObject({
      level: "",
      space: "any",
      sessionType: "practice",
      variant: 0,
      mustInclude: [],
      equipment: {},
    });
    for (const bad of [
      { players: 0, durationMin: 60 },
      { players: 14, durationMin: 2 },
      { players: 14, durationMin: 9999 },
      { players: 14, durationMin: 60, level: "expert" },
      { players: 14, durationMin: 60, space: "outdoor" },
      { players: 14, durationMin: 60, equipment: { "Bad Key": 1 } },
      { players: 14, durationMin: 60, mustInclude: ["not-a-uuid"] },
      { players: 14, durationMin: 60, unknownField: true },
      { players: 14, durationMin: 60, secondaryObjectives: ["a", "b", "c", "d", "e"] },
    ])
      expect(requirementsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});

describe("the rules", () => {
  const drill = (over: Partial<DrillCandidate> = {}): DrillCandidate => ({
    id: "d1",
    title: "T",
    level: "beginner",
    ageMin: 10,
    ageMax: 14,
    playersMin: 4,
    playersMax: 8,
    durationMin: 8,
    durationMax: 12,
    space: "half_court",
    intensity: "medium",
    format: "group",
    phases: ["skill"],
    category: "shooting",
    primarySkill: "shooting_form",
    secondarySkills: [],
    subSkills: [],
    equipment: [
      { key: "basketball", rule: "per_pair", quantity: 1 },
      { key: "hoop", rule: "fixed", quantity: 1 },
    ],
    scope: "library",
    ...over,
  });

  it("splits a big squad into groups, and every group needs its own equipment", () => {
    expect(groupsFor(drill(), 8)).toBe(1);
    expect(groupsFor(drill(), 12)).toBe(2);
    expect(groupsFor(drill(), 17)).toBe(3);
    expect(equipmentNeed(drill(), 12, 2)).toEqual({ basketball: 6, hoop: 2 }); // pairs: 6 balls; a hoop per group
    expect(
      equipmentNeed(
        drill({ equipment: [{ key: "basketball", rule: "per_player", quantity: 1 }] }),
        12,
        2,
      ),
    ).toEqual({ basketball: 12 });
    expect(
      equipmentNeed(drill({ equipment: [{ key: "cones", rule: "fixed", quantity: 5 }] }), 12, 2),
    ).toEqual({ cones: 10 });
  });

  it("finds a shortfall only where the coach has counted, and never invents a limit", () => {
    const req = request({ players: 12, baskets: 1, equipment: { basketball: 6 } });
    expect(equipmentShortfalls(drill(), req)).toEqual([{ key: "hoop", need: 2, have: 1 }]); // two groups, one basket
    expect(equipmentShortfalls(drill({ playersMax: 12 }), req)).toEqual([]); // everyone in one group: one basket is enough
    expect(equipmentShortfalls(drill(), request({ players: 12 }))).toEqual([]); // nothing counted: nothing short
    expect(
      equipmentShortfalls(
        drill(),
        request({ players: 12, equipment: { basketball: 2, hoop: 5 } }),
      ).map((s) => s.key),
    ).toEqual(["basketball"]);
  });

  it("checks space, age and level: beginners never get a harder drill", () => {
    expect(spaceFits(drill({ space: "full_court" }), { space: "half" })).toBe(false);
    expect(spaceFits(drill({ space: "half_court" }), { space: "half" })).toBe(true);
    expect(spaceFits(drill({ space: "full_court" }), { space: "any" })).toBe(true);
    expect(ageFit(drill(), { ageMin: 11, ageMax: 12 })).toBe("within");
    expect(ageFit(drill(), { ageMin: 13, ageMax: 16 })).toBe("overlap");
    expect(ageFit(drill(), { ageMin: 15, ageMax: 16 })).toBe("outside");
    expect(ageFit(drill(), { ageMin: null, ageMax: null })).toBe("unknown");
    expect(levelFit(drill({ level: "intermediate" }), "beginner")).toBe("too_hard");
    expect(levelFit(drill({ level: "intermediate" }), "intermediate")).toBe("exact");
    expect(levelFit(drill({ level: "intermediate" }), "advanced")).toBe("easier");
    expect(levelFit(drill({ level: "advanced" }), "intermediate")).toBe("harder");
    expect(levelFit(drill({ level: "advanced" }), "")).toBe("unknown");
  });

  it("a drill is on the table only if the squad, the space, the equipment, the age and the level allow it", () => {
    const ok = request({ players: 6, baskets: 2 });
    expect(isEligible(drill(), ok)).toBe(true);
    expect(isEligible(drill({ playersMin: 8 }), ok)).toBe(false);
    expect(isEligible(drill({ playersMax: 1 }), request({ players: 30 }))).toBe(false); // more than six groups
    expect(isEligible(drill({ level: "advanced" }), ok)).toBe(false); // beginners
    expect(isEligible(drill({ ageMin: 16, ageMax: 18 }), ok)).toBe(false);
  });

  it("shapes a session by its length: nothing but a drill when tiny, a warm-up first and a cool-down last when longer", () => {
    const shape = (n: number) =>
      planSlots(n, "practice").map((s) => (s.kind === "break" ? "break" : s.phase));
    expect(shape(10)).toEqual(["skill"]);
    expect(shape(20)).toEqual(["warm_up", "skill"]);
    expect(shape(30)).toEqual(["warm_up", "skill", "cool_down"]);
    expect(shape(60)[0]).toBe("warm_up");
    for (const n of [45, 60, 75, 90, 120, 150]) {
      const s = shape(n);
      expect(s[0], String(n)).toBe("warm_up");
      expect(s.at(-1), String(n)).toBe("cool_down");
      expect(s.includes("small_sided"), String(n)).toBe(true);
    }
    expect(shape(90)).toContain("game");
    expect(shape(90)).toContain("break");
    expect(shape(45)).not.toContain("break");
  });

  it("the kind of session changes the middle only", () => {
    const shape = (n: number, t: Parameters<typeof planSlots>[1]) =>
      planSlots(n, t).map((s) => (s.kind === "break" ? "break" : s.phase));
    expect(shape(90, "skills")).not.toContain("game");
    expect(shape(90, "conditioning")).toContain("conditioning");
    expect(shape(60, "game_prep").filter((p) => p === "skill")).toHaveLength(1);
    for (const t of ["practice", "skills", "game_prep", "conditioning"] as const) {
      expect(shape(75, t)[0]).toBe("warm_up");
      expect(shape(75, t).at(-1)).toBe("cool_down");
    }
    expect(slotIntensity("warm_up", "high")).toBe("low");
    expect(slotIntensity("game", "low")).toBe("medium");
    expect(slotIntensity("skill", "high")).toBe("high");
  });
});

describe("generating a session", () => {
  it("builds a balanced, valid session whose minutes add up EXACTLY to the request, for every duration from 20 to 180", () => {
    for (let total = 20; total <= 180; total += 5) {
      const s = run({ durationMin: total, players: 12 });
      expect(minutes(s), `${total} min`).toBe(total);
      expect(
        s.validation.ok,
        `${total} min: ${JSON.stringify(s.validation.issues.filter((i) => i.severity === "error"))}`,
      ).toBe(true);
      expect(s.items.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses only real drills from the candidates it was given — never an invented one", () => {
    const s = run();
    for (const id of idsOf(s)) expect(byId.has(id), id).toBe(true);
    const few = run({}, drills.slice(0, 4));
    for (const id of idsOf(few)) expect(drills.slice(0, 4).some((d) => d.id === id)).toBe(true);
    expect(run({}, []).items).toEqual([]);
    expect(run({}, []).validation.ok).toBe(false);
    expect(run({}, []).validation.issues.map((i) => i.code)).toContain("empty");
  });

  it("is deterministic: the same request over the same drills is the same session, every time", () => {
    const a = run({ variant: 0 });
    const b = run({ variant: 0 });
    expect(b).toEqual(a);
    expect(idsOf(run({ variant: 3 }))).toEqual(idsOf(run({ variant: 3 })));
  });

  it("other variants are other, equally valid sessions", () => {
    const base = idsOf(run({ variant: 0 }));
    const others = [1, 2, 3, 4].map((v) => run({ variant: v }));
    expect(others.some((o) => idsOf(o).join() !== base.join())).toBe(true);
    for (const o of others) {
      expect(minutes(o)).toBe(75);
      expect(o.validation.ok).toBe(true);
    }
  });

  it("puts a warm-up first and a cool-down last, and never repeats a drill", () => {
    const s = run({ durationMin: 90 });
    const first = byId.get(s.items[0]!.drillId!)!;
    const last = byId.get(s.items.at(-1)!.drillId!)!;
    expect(first.phases).toContain("warm_up");
    expect(last.phases).toContain("cool_down");
    const ids = idsOf(s);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.items.some((i) => i.kind === "break")).toBe(true);
    expect(s.items.find((i) => i.kind === "break")).toMatchObject({
      durationMin: 3,
      drillId: null,
    });
  });

  it("serves the objective: the teaching blocks come from the requested skill", () => {
    for (const key of [
      "ball_handling",
      "shooting",
      "passing",
      "defense",
      "finishing",
      "transition",
    ]) {
      const obj = objectives.find((o) => o.key === key)!;
      const s = run({ primaryObjective: key, level: "intermediate", durationMin: 90 });
      const serving = s.items.filter(
        (i) => i.drillId && servesObjective(byId.get(i.drillId)!, obj),
      );
      expect(serving.length, key).toBeGreaterThanOrEqual(2);
      expect(
        s.validation.issues.find((i) => i.code === "objective_uncovered"),
        key,
      ).toBeUndefined();
    }
  });

  it("weighs secondary objectives too", () => {
    const s = run({
      primaryObjective: "ball_handling",
      secondaryObjectives: ["finishing"],
      durationMin: 90,
      level: "intermediate",
    });
    const finishing = objectives.find((o) => o.key === "finishing")!;
    expect(s.items.some((i) => i.drillId && servesObjective(byId.get(i.drillId)!, finishing))).toBe(
      true,
    );
  });

  it("gives a beginner group beginner drills only, and an under-14 group drills that suit their age", () => {
    const s = run({ level: "beginner", ageGroup: "u12", durationMin: 90 });
    for (const id of idsOf(s)) {
      const d = byId.get(id)!;
      expect(d.level, d.title).toBe("beginner");
      expect(d.ageMin, d.title).toBeLessThanOrEqual(12);
    }
    const senior = run({ level: "advanced", ageGroup: "u18", durationMin: 90 });
    for (const id of idsOf(senior)) expect(byId.get(id)!.ageMax).toBeGreaterThanOrEqual(15);
  });

  it("respects the players: too small a squad excludes the big drills; a big squad is split into groups", () => {
    for (const id of idsOf(run({ players: 3, durationMin: 60 })))
      expect(byId.get(id)!.playersMin, byId.get(id)!.title).toBeLessThanOrEqual(3);
    const big = run({ players: 24, durationMin: 60 });
    expect(big.validation.ok).toBe(true);
    expect(big.items.some((i) => i.groups > 1)).toBe(true);
    for (const i of big.items.filter((x) => x.kind === "drill"))
      expect(i.groups).toBe(groupsFor(byId.get(i.drillId!)!, 24));
  });

  it("respects the equipment: one basket and six balls changes what is chosen, and nothing chosen needs more", () => {
    const req = { players: 12, durationMin: 75, baskets: 1, equipment: { basketball: 6 } };
    const s = run(req);
    expect(s.validation.ok).toBe(true);
    expect(s.validation.issues.filter((i) => i.code === "equipment_short")).toEqual([]);
    for (const id of idsOf(s))
      expect(equipmentShortfalls(byId.get(id)!, request(req)), byId.get(id)!.title).toEqual([]);
    expect(s.equipment.hoop ?? 0).toBeLessThanOrEqual(1);
    expect(s.equipment.basketball ?? 0).toBeLessThanOrEqual(6);
    // and it really is different from a session with plenty of baskets
    expect(idsOf(s)).not.toEqual(idsOf(run({ players: 12, durationMin: 75, baskets: 6 })));
    const two = run({ players: 12, durationMin: 75, baskets: 1 });
    expect(Object.keys(two.equipment)).toContain("hoop");
  });

  it("respects the space: with half a court, no full-court drill", () => {
    const s = run({ space: "half", durationMin: 90, level: "intermediate" });
    for (const id of idsOf(s)) expect(byId.get(id)!.space).not.toBe("full_court");
    expect(s.validation.ok).toBe(true);
  });

  it("respects the intensity asked for, at least as a nudge: a low-intensity request is gentler than a high one", () => {
    const rank = { low: 0, medium: 1, high: 2 } as const;
    const avg = (s: ReturnType<typeof run>) =>
      idsOf(s).reduce((n, id) => n + rank[byId.get(id)!.intensity], 0) / idsOf(s).length;
    expect(avg(run({ intensity: "low", durationMin: 90, level: "intermediate" }))).toBeLessThan(
      avg(run({ intensity: "high", durationMin: 90, level: "intermediate" })),
    );
  });

  it("never puts three high-intensity drills in a row", () => {
    for (const total of [60, 90, 120, 150]) {
      const s = run({
        durationMin: total,
        intensity: "high",
        level: "intermediate",
        ageGroup: "u16",
      });
      expect(
        s.validation.issues.find((i) => i.code === "high_intensity_run"),
        String(total),
      ).toBeUndefined();
    }
  });

  it("locked drills asked for by id are in the session; a drill that cannot be run is not, and is never invented", () => {
    const wanted = drills.find(
      (d) => d.level === "beginner" && d.phases.includes("skill") && d.playersMin <= 12,
    )!;
    const s = run({ mustInclude: [wanted.id] });
    expect(idsOf(s)).toContain(wanted.id);
    expect(s.items.find((i) => i.drillId === wanted.id)).toMatchObject({ locked: true });
    expect(s.items.find((i) => i.drillId === wanted.id)!.reasons[0]).toEqual({ code: "locked" });
    const tooHard = drills.find((d) => d.level === "advanced")!;
    expect(idsOf(run({ mustInclude: [tooHard.id], level: "beginner" }))).not.toContain(tooHard.id);
    expect(idsOf(run({ mustInclude: ["00000000-0000-4000-8000-000000000000"] }))).not.toContain(
      "00000000-0000-4000-8000-000000000000",
    );
  });

  it("excluded drills are never used", () => {
    const first = idsOf(run());
    const s = run({ exclude: first });
    for (const id of first) expect(idsOf(s)).not.toContain(id);
    expect(minutes(s)).toBe(75);
  });

  it("explains every choice with reasons and offers alternatives from the same pool", () => {
    const s = run({ durationMin: 90, level: "intermediate", primaryObjective: "shooting" });
    for (const item of s.items.filter((i) => i.kind === "drill")) {
      expect(item.reasons.length, item.title).toBeGreaterThan(0);
      for (const alt of item.alternatives) {
        expect(byId.has(alt.drillId)).toBe(true);
        expect(alt.drillId).not.toBe(item.drillId);
      }
    }
    expect(
      s.items.find((i) => i.reasons.some((r) => r.code === "primary_objective")),
    ).toBeDefined();
  });

  it("says why when nothing can be built, instead of pretending", () => {
    const none = run({ players: 1, level: "beginner", equipment: { basketball: 0 } });
    expect(none.considered.eligible).toBeLessThan(none.considered.total);
    const impossible = run({ players: 40, baskets: 1, equipment: { basketball: 1 } });
    expect(
      impossible.validation.issues.length + (impossible.items.length === 0 ? 1 : 0),
    ).toBeGreaterThan(0);
  });

  it("a tiny session is a single drill, and a very long one stays within the activity limit", () => {
    const tiny = run({ durationMin: 8 });
    expect(tiny.items).toHaveLength(1);
    expect(minutes(tiny)).toBe(8);
    const huge = run({ durationMin: 480 });
    expect(huge.items.length).toBeLessThanOrEqual(60);
    expect(minutes(huge)).toBe(480);
  });

  it("keeps each drill near its own range where it can", () => {
    const s = run({ durationMin: 75 });
    for (const i of s.items.filter((x) => x.kind === "drill")) {
      const d = byId.get(i.drillId!)!;
      expect(i.durationMin, d.title).toBeGreaterThanOrEqual(Math.floor(d.durationMin * 0.5));
      expect(i.durationMin, d.title).toBeLessThanOrEqual(Math.ceil(d.durationMax * 1.5));
    }
  });
});

describe("validating a session", () => {
  const item = (
    drillId: string,
    durationMin: number,
    phase: GeneratedItem["phase"] = "skill",
  ): GeneratedItem => ({
    kind: "drill",
    drillId,
    title: "x",
    phase,
    durationMin,
    groups: 1,
    reasons: [],
    alternatives: [],
    locked: false,
  });
  const check = (items: GeneratedItem[], over: Parameters<typeof request>[0] = {}) =>
    validateSession({ items, req: request(over), drills: byId, objectives }).issues.map(
      (i) => i.code,
    );

  it("flags a total that is not the request", () => {
    const d = drills.find((x) => x.phases.includes("skill") && x.level === "beginner")!;
    expect(check([item(d.id, 10)], { durationMin: 30 })).toContain("duration_mismatch");
    expect(check([item(d.id, 30)], { durationMin: 30 })).not.toContain("duration_mismatch");
  });

  it("flags too few players, missing equipment, no space, and drills that do not suit the age or level", () => {
    const big = drills.find((x) => x.playersMin >= 8)!;
    expect(check([item(big.id, 20)], { players: 3, durationMin: 20 })).toContain(
      "players_below_min",
    );
    const hoops = drills.find((x) => x.equipment.some((e) => e.key === "hoop"))!;
    expect(
      check([item(hoops.id, 20)], {
        players: hoops.playersMin,
        equipment: { hoop: 0 },
        durationMin: 20,
      }),
    ).toContain("equipment_short");
    const full = drills.find((x) => x.space === "full_court")!;
    expect(
      check([item(full.id, 20)], {
        space: "half",
        durationMin: 20,
        players: Math.max(full.playersMin, 10),
      }),
    ).toContain("space_not_available");
    const adv = drills.find((x) => x.level === "advanced")!;
    expect(
      check([item(adv.id, 20)], {
        level: "beginner",
        durationMin: 20,
        players: Math.max(adv.playersMin, 10),
      }),
    ).toContain("level_mismatch");
    const senior = drills.find((x) => x.ageMin >= 13)!;
    expect(
      check([item(senior.id, 20)], {
        ageGroup: "u8",
        ageMin: 5,
        ageMax: 8,
        durationMin: 20,
        players: Math.max(senior.playersMin, 10),
      }),
    ).toContain("age_mismatch");
  });

  it("flags a session that never serves the main objective, a missing warm-up and cool-down, and a repeated drill", () => {
    const shooting = drills.find((x) => x.category === "shooting" && x.phases.includes("skill"))!;
    expect(
      check([item(shooting.id, 30)], { primaryObjective: "rebounding", durationMin: 30 }),
    ).toContain("objective_uncovered");
    expect(
      check([item(shooting.id, 45, "skill")], { durationMin: 45, primaryObjective: "shooting" }),
    ).toEqual(expect.arrayContaining(["no_warm_up", "no_cool_down"]));
    expect(
      check([item(shooting.id, 10), item(shooting.id, 10)], {
        durationMin: 20,
        primaryObjective: "shooting",
      }),
    ).toContain("duplicate_drill");
  });

  it("errors are errors and warnings are warnings: a session with only warnings is still ok", () => {
    const s = run();
    expect(s.validation.ok).toBe(true);
    const bad = validateSession({ items: [], req: request(), drills: byId, objectives });
    expect(bad).toEqual({ ok: false, issues: [{ code: "empty", severity: "error" }] });
    void seed;
    void drillIdOf;
  });
});

describe("over many requests", () => {
  const OBJECTIVES = objectives.map((o) => o.key);
  const cases = Array.from({ length: 240 }, (_, n) => ({
    players: 1 + ((n * 7) % 30),
    durationMin: [5, 12, 20, 30, 45, 60, 75, 90, 120, 180, 300, 480][n % 12]!,
    primaryObjective: OBJECTIVES[n % OBJECTIVES.length]!,
    level: (["beginner", "intermediate", "advanced", ""] as const)[n % 4]!,
    ageGroup: (["u8", "u10", "u12", "u14", "u16", "senior"] as const)[n % 6]!,
    sessionType: (["practice", "skills", "game_prep", "conditioning"] as const)[n % 4]!,
    variant: n % 7,
  }));

  it("always finishes, always adds up exactly, and never lists a drill twice or offers a drill another slot uses", () => {
    for (const c of cases) {
      const s = run(c);
      if (s.items.length === 0) continue; // nothing could run (very small groups, tiny sessions): reported, not invented
      expect(minutes(s), JSON.stringify(c)).toBe(c.durationMin);
      const used = idsOf(s);
      expect(new Set(used).size, JSON.stringify(c)).toBe(used.length);
      for (const item of s.items)
        for (const alt of item.alternatives)
          expect(used.includes(alt.drillId), `${JSON.stringify(c)} offers a used drill`).toBe(
            false,
          );
    }
  });
});
