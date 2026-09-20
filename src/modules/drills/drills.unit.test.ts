import { describe, expect, it } from "vitest";
import { drillContentSchema, isSafeHttpsUrl } from "./content";
import {
  activeFilterCount,
  filtersToSearchParams,
  hrefFor,
  parseFilters,
  MAX_PAGE,
} from "./filters";
import { drillInputSchema } from "./validators";

describe("URL filters (untrusted input: lenient, never throws)", () => {
  it("parses a full valid query", () => {
    const f = parseFilters({
      q: " layup  drills ",
      category: "shooting",
      skill: "closeouts",
      level: "advanced",
      age: "14",
      players: "8",
      duration: "medium",
      equipment: "cones",
      scope: "mine",
      sort: "title",
      page: "3",
    });
    expect(f).toEqual({
      q: "layup drills",
      category: "shooting",
      skill: "closeouts",
      level: "advanced",
      age: 14,
      players: 8,
      duration: "medium",
      equipment: "cones",
      scope: "mine",
      sort: "title",
      page: 3,
    });
  });

  it("drops anything malformed instead of failing", () => {
    const f = parseFilters({
      category: "Bad Key!",
      skill: "x",
      level: "legend",
      age: "abc",
      players: "-1",
      duration: "epic",
      scope: "everything",
      sort: "random",
      page: "0",
    });
    expect(f).toMatchObject({
      category: undefined,
      skill: undefined,
      level: undefined,
      age: undefined,
      players: undefined,
      duration: undefined,
      scope: "all",
      page: 1,
    });
  });

  it("bounds numbers and text", () => {
    expect(parseFilters({ age: "2" }).age).toBeUndefined(); // below 3
    expect(parseFilters({ age: "100" }).age).toBeUndefined();
    expect(parseFilters({ players: "61" }).players).toBeUndefined();
    expect(parseFilters({ page: String(MAX_PAGE + 1) }).page).toBe(1);
    expect(parseFilters({ q: "x".repeat(500) }).q).toHaveLength(80);
  });

  it("takes the first value of repeated params and tolerates arrays", () => {
    expect(parseFilters({ level: ["beginner", "advanced"] }).level).toBe("beginner");
    expect(parseFilters({ q: ["one", "two"] }).q).toBe("one");
  });

  it("sort defaults to relevance only when there is a search term", () => {
    expect(parseFilters({}).sort).toBe("recent");
    expect(parseFilters({ q: "dribble" }).sort).toBe("relevance");
    expect(parseFilters({ sort: "relevance" }).sort).toBe("recent"); // relevance without a query is meaningless
    expect(parseFilters({ q: "x", sort: "title" }).sort).toBe("title");
  });

  it("round-trips through a URL, omitting defaults so links stay short", () => {
    const f = parseFilters({ q: "pass", level: "beginner", age: "10", page: "2" });
    const qs = filtersToSearchParams(f).toString();
    expect(qs).toBe("q=pass&level=beginner&age=10&page=2");
    expect(parseFilters(Object.fromEntries(new URLSearchParams(qs)))).toEqual(f);
    expect(filtersToSearchParams(parseFilters({})).toString()).toBe("");
    expect(hrefFor("/sports/basketball/drills", parseFilters({}))).toBe(
      "/sports/basketball/drills",
    );
    expect(hrefFor("/x", { level: "advanced" })).toBe("/x?level=advanced");
  });

  it("counts narrowing filters but not paging/sorting", () => {
    expect(activeFilterCount(parseFilters({}))).toBe(0);
    expect(activeFilterCount(parseFilters({ page: "4", sort: "title" }))).toBe(0);
    expect(activeFilterCount(parseFilters({ q: "a b", level: "beginner", scope: "library" }))).toBe(
      3,
    );
  });
});

describe("safe URLs for resources", () => {
  it.each(["https://www.youtube.com/watch?v=abc", "https://example.org/coaching/article"])(
    "accepts %s",
    (u) => expect(isSafeHttpsUrl(u)).toBe(true),
  );

  it.each([
    "http://example.org/x",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.org/x",
    "https://user:pass@example.org/x",
    "https://example.org:8443/x",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://[::1]/x",
    "//example.org/x",
    "not a url",
    `https://example.org/${"a".repeat(600)}`,
  ])("rejects %s", (u) => expect(isSafeHttpsUrl(u)).toBe(false));
});

describe("drill content schema", () => {
  const ok = {
    objective: "Do the thing well.",
    setup: "Cones in a line.",
    instructions: ["Go."],
    coachingPoints: ["Eyes up."],
  };

  it("applies defaults for the optional lists", () => {
    const c = drillContentSchema.parse(ok);
    expect(c).toMatchObject({
      schemaVersion: 1,
      commonMistakes: [],
      safety: "",
      progressions: [],
      regressions: [],
      variations: [],
      resources: [],
    });
  });

  it("requires an objective, setup, and at least one instruction and coaching point", () => {
    expect(drillContentSchema.safeParse({ ...ok, instructions: [] }).success).toBe(false);
    expect(drillContentSchema.safeParse({ ...ok, coachingPoints: [] }).success).toBe(false);
    expect(drillContentSchema.safeParse({ ...ok, objective: "  " }).success).toBe(false);
  });

  it("trims and bounds lines; rejects unknown keys", () => {
    expect(drillContentSchema.parse({ ...ok, instructions: ["  padded  "] }).instructions).toEqual([
      "padded",
    ]);
    expect(drillContentSchema.safeParse({ ...ok, instructions: ["x".repeat(501)] }).success).toBe(
      false,
    );
    expect(drillContentSchema.safeParse({ ...ok, instructions: Array(21).fill("x") }).success).toBe(
      false,
    );
    expect(drillContentSchema.safeParse({ ...ok, html: "<script>" }).success).toBe(false);
  });

  it("video resources must be on allow-listed hosts; article links only need to be safe https", () => {
    const res = (kind: string, url: string) =>
      drillContentSchema.safeParse({ ...ok, resources: [{ title: "T", kind, url }] });
    expect(res("video", "https://www.youtube.com/watch?v=1").success).toBe(true);
    expect(res("video", "https://vimeo.com/123").success).toBe(true);
    expect(res("video", "https://evil.example/video").success).toBe(false);
    expect(res("article", "https://evil.example/read").success).toBe(true);
    expect(res("article", "http://insecure.example/read").success).toBe(false);
  });
});

describe("drill input schema", () => {
  const base = {
    title: "Good Title",
    description: "A perfectly reasonable one-paragraph description.",
    category: "passing",
    primarySkill: "passing",
    level: "beginner",
    ageMin: 8,
    ageMax: 12,
    playersMin: 2,
    playersMax: 8,
    durationMin: 5,
    durationMax: 10,
    space: "half_court",
    content: {
      objective: "Pass well.",
      setup: "Two lines.",
      instructions: ["Pass."],
      coachingPoints: ["Step."],
    },
  };
  const issues = (over: object) => {
    const r = drillInputSchema.safeParse({ ...base, ...over });
    return r.success
      ? {}
      : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("accepts a minimal valid drill and applies defaults", () => {
    const r = drillInputSchema.parse(base);
    expect(r).toMatchObject({
      secondarySkills: [],
      tags: [],
      equipment: [],
      diagrams: [],
      visibility: "private",
      sourceKind: "original",
    });
  });

  it("checks lengths and ranges, with i18n keys as messages", () => {
    expect(issues({ title: "ab" }).title).toBe("too_short");
    expect(issues({ description: "short" }).description).toBe("too_short");
    expect(issues({ ageMin: 2 }).ageMin).toBe("range_invalid");
    expect(issues({ durationMax: 999 }).durationMax).toBe("range_invalid");
    expect(issues({ level: "pro" }).level).toBe("required");
  });

  it("an unchosen category/skill says 'required', a malformed one says 'invalid'", () => {
    expect(issues({ category: "" }).category).toBe("required");
    expect(issues({ primarySkill: "" }).primarySkill).toBe("required");
    expect(issues({ category: "Bad Key!" }).category).toBe("invalid");
  });

  it("min must not exceed max, on every pair", () => {
    expect(issues({ ageMin: 15, ageMax: 10 }).ageMax).toBe("range_order");
    expect(issues({ playersMin: 9, playersMax: 8 }).playersMax).toBe("range_order");
    expect(issues({ durationMin: 20, durationMax: 10 }).durationMax).toBe("range_order");
  });

  it("skills: secondary can't repeat or include the primary; at most three", () => {
    expect(issues({ secondarySkills: ["passing"] }).secondarySkills).toBe("skill_duplicate");
    expect(issues({ secondarySkills: ["catching", "catching"] }).secondarySkills).toBe(
      "skill_duplicate",
    );
    expect(issues({ secondarySkills: ["a_b", "c_d", "e_f", "g_h"] }).secondarySkills).toBe(
      "too_many",
    );
  });

  it("tags are normalised (trim, lower-case) and validated", () => {
    expect(drillInputSchema.parse({ ...base, tags: ["  Fast Break ", "3-on-2"] }).tags).toEqual([
      "fast break",
      "3-on-2",
    ]);
    expect(issues({ tags: ["<script>"] })["tags.0"]).toBe("tag_invalid");
    expect(issues({ tags: Array(9).fill("ok tag") }).tags).toBe("too_many");
  });

  it("equipment: no duplicates, sane quantities", () => {
    expect(
      issues({
        equipment: [
          { type: "cones", rule: "fixed", quantity: 2 },
          { type: "cones", rule: "fixed", quantity: 3 },
        ],
      }).equipment,
    ).toBe("equipment_duplicate");
    expect(
      issues({ equipment: [{ type: "cones", rule: "sometimes", quantity: 2 }] })[
        "equipment.0.rule"
      ],
    ).toBeDefined();
    expect(
      issues({ equipment: [{ type: "cones", rule: "fixed", quantity: 0 }] })[
        "equipment.0.quantity"
      ],
    ).toBe("range_invalid");
  });

  it("source information is required when the source isn't the author's own", () => {
    expect(issues({ sourceKind: "adapted" }).sourceName).toBe("source_name_required");
    expect(issues({ sourceKind: "adapted", sourceName: "Coach handbook" })).toEqual({});
    expect(issues({ sourceKind: "external" }).sourceUrl).toBe("source_external_required");
    expect(
      issues({
        sourceKind: "external",
        sourceName: "Federation",
        sourceUrl: "https://example.org/drill",
      }),
    ).toEqual({});
    expect(issues({ sourceUrl: "http://example.org" }).sourceUrl).toBe("url_invalid");
  });

  it("users can only choose private or organization visibility — never public", () => {
    expect(issues({ visibility: "public" }).visibility).toBeDefined();
  });

  it("rejects unknown keys (mass-assignment defence): ownership fields can't be smuggled in", () => {
    for (const evil of [
      { organizationId: "x" },
      { createdBy: "x" },
      { id: "x" },
      { status: "published" },
      { seedKey: "x" },
    ]) {
      expect(drillInputSchema.safeParse({ ...base, ...evil }).success).toBe(false);
    }
  });

  it("at most three diagrams", () => {
    const d = {
      title: "",
      diagram: {
        schemaVersion: 1,
        sport: "basketball",
        court: { type: "half", variant: "fiba" },
        entities: [],
      },
    };
    expect(drillInputSchema.safeParse({ ...base, diagrams: [d, d, d] }).success).toBe(true);
    expect(drillInputSchema.safeParse({ ...base, diagrams: [d, d, d, d] }).success).toBe(false);
  });
});
