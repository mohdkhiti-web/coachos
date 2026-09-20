import { describe, expect, it } from "vitest";
import { SEED_DRILLS } from "@/db/seed/drills";
import { diagramSchema } from "@/engines/diagram";
import type { DrillDetailDto } from "@/modules/drills/dto";
import { drillContentSchema } from "@/modules/drills/content";
import { drillInputSchema } from "@/modules/drills/validators";
import {
  emptyValues,
  errorsFor,
  fromLines,
  toLines,
  toPayload,
  valuesFromDrill,
} from "./form-model";

const equipmentKeys = ["basketball", "cones", "bibs", "stopwatch"];

/** A DTO built from a real library drill, so the round trip is tested on real content. */
function dtoFrom(seedKey: string): DrillDetailDto {
  const d = SEED_DRILLS.find((x) => x.seedKey === seedKey)!;
  const label = (k: string) => k.replaceAll("_", " ");
  return {
    id: "0192a000-0000-7000-8000-000000000001",
    sportKey: "basketball",
    title: d.title,
    description: d.description,
    category: { key: d.category, name: label(d.category) },
    primarySkill: { key: d.primarySkill, name: label(d.primarySkill) },
    level: d.level,
    ageMin: d.ageMin,
    ageMax: d.ageMax,
    playersMin: d.playersMin,
    playersMax: d.playersMax,
    durationMin: d.durationMin,
    durationMax: d.durationMax,
    space: d.space,
    scope: "library",
    updatedAt: new Date(),
    content: drillContentSchema.parse(d.content),
    tags: d.tags,
    skills: [
      { key: d.primarySkill, name: "", role: "primary" },
      ...(d.secondarySkills ?? []).map((k) => ({ key: k, name: "", role: "secondary" as const })),
    ],
    equipment: d.equipment.map((e) => ({
      key: e.type,
      name: e.type,
      rule: e.rule,
      quantity: e.quantity,
    })),
    diagrams: d.diagrams.map((g, i) => ({
      id: String(i),
      title: g.title,
      diagram: diagramSchema.parse(g.diagram),
    })),
    source: { kind: "original", name: null, url: null },
    visibility: "public",
    status: "published",
    version: 3,
    forkedFromId: null,
    createdAt: new Date(),
    permissions: { canEdit: false, canArchive: false, canDuplicate: true },
  } as DrillDetailDto;
}

describe("lines", () => {
  it("one item per non-empty line, trimmed", () => {
    expect(toLines("  one \n\ntwo\r\n   \nthree")).toEqual(["one", "two", "three"]);
    expect(toLines("")).toEqual([]);
    expect(fromLines(["a", "b"])).toBe("a\nb");
  });
});

describe("form model", () => {
  it("starts empty with every equipment type unticked", () => {
    const v = emptyValues({ space: "half_court", equipmentKeys });
    expect(Object.keys(v.equipment)).toEqual(equipmentKeys);
    expect(Object.values(v.equipment).every((e) => !e.on)).toBe(true);
    expect(v).toMatchObject({
      space: "half_court",
      visibility: "private",
      sourceKind: "original",
      diagrams: [],
    });
  });

  it("empty numeric fields become undefined (rejected server-side), not 0", () => {
    const p = toPayload(emptyValues({ space: "half_court", equipmentKeys }));
    expect(p.ageMin).toBeUndefined();
    expect(p.durationMax).toBeUndefined();
    expect(drillInputSchema.safeParse(p).success).toBe(false);
  });

  it("round-trips REAL library drills: DTO → form → payload passes the server schema with identical content", () => {
    for (const d of SEED_DRILLS) {
      const dto = dtoFrom(d.seedKey);
      const payload = toPayload(valuesFromDrill(dto, equipmentKeys), dto.version);
      const parsed = drillInputSchema.safeParse(payload);
      expect(parsed.success, `${d.seedKey}: ${parsed.success ? "" : parsed.error.message}`).toBe(
        true,
      );
      if (!parsed.success) continue;
      expect(parsed.data.title).toBe(d.title);
      expect(parsed.data.primarySkill).toBe(d.primarySkill);
      expect(parsed.data.secondarySkills).toEqual(d.secondarySkills ?? []);
      // order follows the catalog, not the seed file, so compare as sets
      const eq = (list: Array<{ type: string; rule: string; quantity: number }>) =>
        list.map((e) => `${e.type}:${e.rule}:${e.quantity}`).sort();
      expect(eq(parsed.data.equipment)).toEqual(eq(d.equipment));
      expect(parsed.data.content.instructions).toEqual(d.content.instructions);
      expect(parsed.data.content.coachingPoints).toEqual(d.content.coachingPoints);
      expect(parsed.data.diagrams.map((g) => g.diagram)).toEqual(
        dto.diagrams.map((g) => g.diagram),
      ); // lossless
      expect(parsed.data.version).toBe(3);
    }
  });

  it("only sends ticked equipment, and parses comma-separated tags", () => {
    const v = emptyValues({ space: "half_court", equipmentKeys });
    v.equipment.cones = { on: true, rule: "fixed", quantity: "4" };
    v.equipment.bibs = { on: false, rule: "per_player", quantity: "2" };
    v.tags = " layups ,  fast break ,, ";
    const p = toPayload(v);
    expect(p.equipment).toEqual([{ type: "cones", rule: "fixed", quantity: 4 }]);
    expect(p.tags).toEqual(["layups", "fast break"]);
  });

  it("drops blank resource rows", () => {
    const v = emptyValues({ space: "half_court", equipmentKeys });
    v.resources = [
      { kind: "video", title: "", url: "" },
      { kind: "article", title: "Read", url: "https://example.org/a" },
    ];
    expect(toPayload(v).content.resources).toEqual([
      { kind: "article", title: "Read", url: "https://example.org/a" },
    ]);
  });

  it("errorsFor aggregates a field and everything beneath it", () => {
    const fields = {
      "content.instructions": ["required"],
      "content.instructions.2": ["too_long"],
      "content.setup": ["required"],
      title: ["too_short"],
    };
    expect(errorsFor(fields, "content.instructions").sort()).toEqual(["required", "too_long"]);
    expect(errorsFor(fields, "content.setup")).toEqual(["required"]);
    expect(errorsFor(fields, "content").sort()).toEqual(["required", "too_long"]); // duplicates collapse
    expect(errorsFor(fields, "conte")).toEqual([]); // no partial-word matches
    expect(errorsFor(undefined, "title")).toEqual([]);
  });
});
