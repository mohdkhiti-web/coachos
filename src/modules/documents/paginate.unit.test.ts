import { describe, expect, it } from "vitest";
import { MARGINS, MODES, ORIENTATIONS, PAPERS, SPACINGS, type DocumentDesign } from "./design";
import { buildDocumentModel } from "./model";
import { fragmentHeight, paginate } from "./paginate";
import { presetDesign } from "./presets";
import { drillKeys, session, typicalSession } from "./test-support";
import type {
  DocumentActivityContent,
  DocumentModel,
  Fragment,
  Group,
  SessionDocumentInput,
} from "./types";

const design = (patch: Partial<DocumentDesign> = {}): DocumentDesign => ({
  ...presetDesign("classic"),
  ...patch,
});
const layout = (page: Partial<DocumentDesign["page"]>, mode: DocumentDesign["mode"] = "detailed") =>
  design({ mode, page: { ...design().page, ...page } });

const bodyPages = (m: DocumentModel) => m.pages.flatMap((p) => (p.kind === "body" ? [p] : []));
const fragments = (m: DocumentModel): Fragment[] => bodyPages(m).flatMap((p) => p.fragments);
const activityFragments = (m: DocumentModel) => fragments(m).filter((f) => f.kind === "activity");
const blocksOf = (f: Fragment) =>
  f.units.flatMap((u) => (u.row.t === "band" ? [...u.row.left, ...u.row.right] : []));

/**
 * The rules every document must satisfy, whatever the session and the design. If one of these fails the
 * document would print with clipped, overlapping, missing or blank parts.
 */
function expectSound(m: DocumentModel, label = "") {
  const at = (msg: string) => `${label} ${msg}`.trim();
  expect(m.pageCount, at("page count")).toBe(m.pages.length);
  m.pages.forEach((p, i) => expect(p.number, at("numbering")).toBe(i + 1));

  const body = m.geometry.bodyHeightMm;
  const seen = new Map<string, Fragment[]>();
  for (const page of bodyPages(m)) {
    expect(page.fragments.length, at(`page ${page.number} is not empty`)).toBeGreaterThan(0);
    for (let col = 0; col < page.columns; col++) {
      const inColumn = page.fragments.filter((f) => f.column === col);
      const used =
        inColumn.reduce((sum, f) => sum + f.heightMm, 0) +
        Math.max(0, inColumn.length - 1) * m.geometry.groupGapMm;
      // nothing taller than the space between the header and the footer: nothing is clipped
      expect(used, at(`page ${page.number} column ${col} fits`)).toBeLessThanOrEqual(body + 0.02);
      expect(page.usedMm[col]!, at("usedMm is the real total")).toBeCloseTo(used, 1);
    }
    for (const f of page.fragments) {
      expect(f.column, at("column exists")).toBeLessThan(page.columns);
      expect(f.units.length, at("a fragment is never empty")).toBeGreaterThan(0);
      expect(f.heightMm, at("fragment height is positive")).toBeGreaterThan(0);
      seen.set(f.groupId, [...(seen.get(f.groupId) ?? []), f]);
    }
  }
  // a group that continues is marked, in order, and only its first piece is not
  for (const [id, parts] of seen) {
    parts.forEach((p, i) => expect(p.continued, at(`${id} piece ${i}`)).toBe(i > 0));
  }
  // no heading is left alone at the bottom: a split table keeps at least three rows with its heading
  for (const [, parts] of seen) {
    parts.forEach((p, i) => {
      if (p.kind === "timeline" && i < parts.length - 1)
        expect(p.units.length).toBeGreaterThanOrEqual(3);
    });
  }
}

const heavyContent = (): DocumentActivityContent => {
  const sentence = (n: number) =>
    `Step ${n}: keep the feet moving, talk to your partner and finish the movement with a full follow-through before resetting.`;
  const long = (n: number) => (sentence(n) + " ").repeat(4).trim(); // ≈ 490 characters
  return {
    objective: "Rehearse the movement patterns of the session. ".repeat(12).trim(),
    description: "",
    setup: "Groups of four start on the baseline and rotate every thirty seconds. "
      .repeat(24)
      .trim(),
    organization: "Three lines behind the cones; the coach calls the changes. ".repeat(14).trim(),
    instructions: Array.from({ length: 20 }, (_, i) => long(i + 1)),
    coachingPoints: Array.from({ length: 20 }, (_, i) => long(i + 21)),
    commonMistakes: Array.from({ length: 20 }, (_, i) => long(i + 41)),
    safety: "Check the floor is dry and clear. ".repeat(28).trim(),
    progressions: Array.from({ length: 10 }, (_, i) => long(i + 61)),
    regressions: Array.from({ length: 10 }, (_, i) => long(i + 71)),
    variations: Array.from({ length: 10 }, (_, i) => long(i + 81)),
    equipment: [{ key: "cones", name: "Cones", rule: "fixed", quantity: 12 }],
    diagrams: session([{ drill: "give-and-go" }]).activities[0]!.content!.diagrams,
    format: "5v5",
    intensity: "high",
    playersRange: { min: 8, max: 12 },
  };
};

describe("short, normal and long sessions", () => {
  it("a short session is a few pages, all sound", () => {
    const m = buildDocumentModel(
      session([{ drill: "mikan-drill" }, { drill: "give-and-go" }]),
      design(),
    );
    expectSound(m, "short");
    expect(m.pageCount).toBeLessThanOrEqual(3);
  });

  it("a normal evening: the overview, objectives, equipment and timeline share the first page; each drill then has its own", () => {
    const m = buildDocumentModel(typicalSession(), design());
    expectSound(m, "normal");
    const first = bodyPages(m)[0]!;
    expect(first.fragments.map((f) => f.kind)).toEqual([
      "overview",
      "objectives",
      "equipment",
      "timeline",
    ]);
    expect(first.fragments.every((f) => !f.continued)).toBe(true);
    // the activities start on a fresh page, in the coach's order
    expect(bodyPages(m)[1]!.fragments[0]!.kind).toBe("activity");
    const heads = activityFragments(m).filter((f) => !f.continued);
    expect(heads.map((f) => f.activity!.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("a long session of every library drill keeps them all, once each and in order", () => {
    const keys = drillKeys();
    const input = session(keys.map((k) => ({ drill: k, minutes: 8 })));
    const m = buildDocumentModel(input, design());
    expectSound(m, "long");
    const titles = activityFragments(m)
      .filter((f) => !f.continued)
      .map((f) => f.activity!.title);
    expect(titles).toEqual(input.activities.map((a) => a.title));
    expect(m.pageCount).toBeGreaterThan(20);
  });

  it("keeps an activity that fits one page whole, with its diagram under its own heading", () => {
    const m = buildDocumentModel(
      session(
        drillKeys()
          .slice(0, 12)
          .map((k) => ({ drill: k })),
      ),
      design(),
    );
    expectSound(m);
    const parts = new Map<string, Fragment[]>();
    for (const f of activityFragments(m))
      parts.set(f.groupId, [...(parts.get(f.groupId) ?? []), f]);
    const whole = [...parts.values()].filter((p) => p.length === 1);
    expect(whole.length).toBeGreaterThan(8); // nearly every real drill fits an A4 page in detailed mode
    for (const [piece] of whole) {
      expect(piece!.continued).toBe(false);
      expect(
        blocksOf(piece!).some((b) => b.b === "figure"),
        piece!.activity!.title,
      ).toBe(true);
    }
  });
});

describe("a very large drill", () => {
  const input = session([{ drill: "give-and-go" }, { drill: "mikan-drill" }]);
  input.activities[0]!.content = heavyContent();
  const m = buildDocumentModel(input, design());
  const parts = activityFragments(m).filter((f) => f.groupId === "activity-a1");

  it("is split between its pieces, never inside one, and every piece fits a page", () => {
    expectSound(m, "large");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.heightMm).toBeLessThanOrEqual(m.geometry.bodyHeightMm + 0.02);
  });

  it("keeps the heading, the setup and the diagram together on the first page", () => {
    const first = parts[0]!;
    expect(first.continued).toBe(false);
    expect(first.activity!.title).toBe("Give-and-Go (Pass and Cut)");
    const kinds = blocksOf(first).map((b) => b.b);
    expect(kinds).toContain("figure");
    expect(kinds).toContain("text");
  });

  it("says it continues, and repeats the activity's title, on every later page", () => {
    for (const p of parts.slice(1)) {
      expect(p.continued).toBe(true);
      expect(p.activity!.title).toBe(parts[0]!.activity!.title);
    }
  });

  it("loses nothing: every item and every paragraph appears exactly once, in order, with the numbering carried on", () => {
    const original = heavyContent();
    const cellsOf = (key: string) =>
      parts.flatMap((p) =>
        blocksOf(p).flatMap((b) => (b.b === "cell" && b.cell.key === key ? [b.cell] : [])),
      );
    for (const key of [
      "instructions",
      "coachingPoints",
      "commonMistakes",
      "progressions",
      "regressions",
      "variations",
    ] as const) {
      const got = cellsOf(key);
      expect(
        got.flatMap((c) => c.items),
        key,
      ).toEqual(original[key]);
      // a numbered list that continues on a later page keeps counting where it left off
      let expected = 1;
      for (const c of got) {
        expect(c.start, `${key} start`).toBe(expected);
        expected += c.items.length;
      }
    }
    const safety = cellsOf("safety")
      .map((c) => c.text)
      .join(" ");
    expect(safety.replace(/\s+/g, " ")).toBe(original.safety.replace(/\s+/g, " "));
    const text = (label: string) =>
      parts
        .flatMap((p) =>
          blocksOf(p).flatMap((b) => (b.b === "text" && b.label === label ? [b.text] : [])),
        )
        .join(" ")
        .replace(/\s+/g, " ");
    expect(text("setup")).toBe(original.setup.replace(/\s+/g, " "));
    expect(text("organization")).toBe(original.organization.replace(/\s+/g, " "));
  });

  it("does not disturb the activity that follows it", () => {
    const next = activityFragments(m).filter((f) => f.groupId === "activity-a2");
    expect(next).toHaveLength(1);
    expect(next[0]!.continued).toBe(false);
  });

  it.each([
    ["A4 portrait", layout({})],
    [
      "Letter landscape, narrow margins",
      layout({ paper: "letter", orientation: "landscape", margins: "narrow" }),
    ],
    ["two columns, wide margins", layout({ columns: 2, margins: "wide", spacing: "spacious" })],
  ])("stays sound on %s", (_name, d) => {
    const big = buildDocumentModel(input, d);
    expectSound(big);
    const kept = activityFragments(big)
      .filter((f) => f.groupId === "activity-a1")
      .flatMap((f) =>
        blocksOf(f).flatMap((b) =>
          b.b === "cell" && b.cell.key === "instructions" ? b.cell.items : [],
        ),
      );
    expect(kept).toEqual(heavyContent().instructions);
  });
});

describe("multiple diagrams", () => {
  it("keeps every diagram, and the first one with the activity's heading", () => {
    const one = session([{ drill: "give-and-go" }]);
    const original = one.activities[0]!.content!.diagrams[0]!;
    one.activities[0]!.content!.diagrams = Array.from({ length: 5 }, (_, i) => ({
      ...original,
      title: `Option ${i + 1}`,
    }));
    const m = buildDocumentModel(one, design());
    expectSound(m);
    const figures = activityFragments(m).flatMap((f) =>
      blocksOf(f).flatMap((b) =>
        b.b === "figure" ? [{ title: b.figure.title, continued: f.continued }] : [],
      ),
    );
    expect(figures.map((f) => f.title).sort()).toEqual([
      "Option 1",
      "Option 2",
      "Option 3",
      "Option 4",
      "Option 5",
    ]);
    expect(figures.find((f) => f.title === "Option 1")!.continued).toBe(false);
  });

  it("never draws a diagram taller than a page", () => {
    const one = session([{ drill: "give-and-go" }]);
    for (const d of [
      layout({ paper: "letter", orientation: "landscape", margins: "wide" }),
      layout({ columns: 2 }),
    ]) {
      const m = buildDocumentModel(one, d);
      for (const f of activityFragments(m))
        for (const b of blocksOf(f))
          if (b.b === "figure") expect(b.heightMm).toBeLessThan(m.geometry.bodyHeightMm);
    }
  });
});

describe("the paginator itself: an activity near a page boundary", () => {
  const group = (id: string, heights: number[], over: Partial<Group> = {}): Group => ({
    id,
    kind: "activity",
    activity: null,
    headMm: { first: 10, continued: 6 },
    tailMm: 2,
    unitGap: 2,
    keepTogether: true,
    lead: 1,
    units: heights.map((h) => ({ row: { t: "text", text: "x" }, heightMm: h })),
    ...over,
  });
  const geo = { bodyHeightMm: 200, groupGapMm: 5 };
  const place = (groups: Group[], columns: 1 | 2 = 1, newPage = true) =>
    paginate([{ groups, columns, newPage }], geo);
  const total = (g: Group) => fragmentHeight(g, 0, g.units.length, false);

  it("moves a group that does not fit the rest of the page to the next page, whole", () => {
    const a = group("a", [100]); // 112 tall
    const b = group("b", [90]); // 102 tall: 112 + 5 + 102 = 219 > 200
    const pages = place([a, b]);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.fragments.map((f) => f.groupId)).toEqual(["a"]);
    expect(pages[1]!.fragments.map((f) => f.groupId)).toEqual(["b"]);
    expect(pages[1]!.fragments[0]!.continued).toBe(false);
  });

  it("keeps a group that fits exactly, and moves one that is a millimetre too big", () => {
    const a = group("a", [78]); // 90
    const fits = group("b", [200 - 90 - 5 - 12]); // 12 = head + tail → exactly the rest of the page
    expect(total(a) + 5 + total(fits)).toBeCloseTo(200, 5);
    expect(place([a, fits])).toHaveLength(1);
    const tooBig = group("c", [200 - 90 - 5 - 12 + 1]);
    const pages = place([a, tooBig]);
    expect(pages).toHaveLength(2);
    expect(pages[1]!.fragments[0]!.groupId).toBe("c");
  });

  it("splits only a group taller than a whole page, between its pieces", () => {
    const big = group("big", [60, 60, 60, 60]); // 10 + 240 + 6 + 2 = 258 > 200
    const pages = place([big]);
    expect(pages.length).toBeGreaterThan(1);
    const all = pages.flatMap((p) => p.fragments);
    expect(all.flatMap((f) => f.units)).toHaveLength(4); // every piece exactly once
    all.forEach((f, i) => expect(f.continued).toBe(i > 0));
    for (const p of pages) expect(p.usedMm[0]!).toBeLessThanOrEqual(200 + 0.01);
  });

  it("never leaves a heading alone at the bottom of a page: it travels with its first pieces", () => {
    const filler = group("filler", [150]); // 162 tall, leaves 33 free
    const table = group("table", [8, 8, 8, 8, 8, 8], {
      keepTogether: false,
      lead: 3,
      headMm: { first: 20, continued: 20 },
      tailMm: 0,
      unitGap: 0,
    });
    const pages = place([filler, table]);
    const first = pages[1]!.fragments[0]!;
    expect(first.groupId).toBe("table"); // 20 + 3×8 = 44 > 33 → the heading moved with its rows
    expect(pages[0]!.fragments.map((f) => f.groupId)).toEqual(["filler"]);
  });

  it("puts a two-column group's pieces in column 0 first, then column 1, then the next page", () => {
    const groups = ["a", "b", "c", "d", "e"].map((id) => group(id, [70])); // 82 tall each
    const pages = place(groups, 2);
    expect(pages.map((p) => p.fragments.map((f) => `${f.groupId}@${f.column}`))).toEqual([
      ["a@0", "b@0", "c@1", "d@1"],
      ["e@0"],
    ]);
  });

  it("never creates an empty page, and skips groups with nothing in them", () => {
    expect(place([group("nothing", [])])).toEqual([]);
    expect(place([])).toEqual([]);
    const pages = place([group("a", [50]), group("empty", []), group("b", [50])]);
    expect(pages).toHaveLength(1);
  });

  it("starts the next section on a fresh page when asked, and after a multi-column run", () => {
    const two = paginate(
      [
        { groups: [group("a", [50])], columns: 2, newPage: true },
        { groups: [group("b", [50])], columns: 1, newPage: false },
      ],
      geo,
    );
    expect(two).toHaveLength(2);
    const stay = paginate(
      [
        { groups: [group("a", [50])], columns: 1, newPage: true },
        { groups: [group("b", [50])], columns: 1, newPage: false },
      ],
      geo,
    );
    expect(stay).toHaveLength(1);
    const fresh = paginate(
      [
        { groups: [group("a", [50])], columns: 1, newPage: true },
        { groups: [group("b", [50])], columns: 1, newPage: true },
      ],
      geo,
    );
    expect(fresh).toHaveLength(2);
  });

  it("is deterministic", () => {
    const groups = [group("a", [100]), group("b", [90]), group("c", [30, 30])];
    expect(JSON.stringify(place(groups))).toBe(JSON.stringify(place(groups)));
  });
});

describe("a long timeline", () => {
  it("splits with its heading repeated, its rows counted once, and never a heading alone", () => {
    const many = session(
      Array.from({ length: 60 }, (_, i) => ({ custom: `Station ${i + 1}`, minutes: 5 })),
      { objectives: { primary: "Shooting", secondary: [] } },
    );
    const m = buildDocumentModel(many, design());
    expectSound(m, "timeline");
    const parts = fragments(m).filter((f) => f.kind === "timeline");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flatMap((f) => f.units)).toHaveLength(60);
    expect(parts[0]!.continued).toBe(false);
    expect(parts.slice(1).every((p) => p.continued)).toBe(true);
  });

  it("keeps a table that fits one page whole, even when that means starting it on a new page", () => {
    const m = buildDocumentModel(
      typicalSession(),
      layout({ paper: "letter", orientation: "landscape" }),
    );
    expectSound(m);
    expect(fragments(m).filter((f) => f.kind === "timeline")).toHaveLength(1);
  });
});

describe("two columns", () => {
  it("fills the left column, then the right, then the next page", () => {
    const m = buildDocumentModel(
      session(
        drillKeys()
          .slice(0, 10)
          .map((k) => ({ drill: k })),
      ),
      layout({ columns: 2 }, "compact"),
    );
    expectSound(m, "2col");
    const activityPages = bodyPages(m).filter((p) => p.columns === 2);
    expect(activityPages.length).toBeGreaterThan(1);
    for (const p of activityPages) {
      const cols = p.fragments.map((f) => f.column);
      expect(cols).toEqual([...cols].sort((x, y) => x - y)); // column 0 entirely before column 1
    }
    expect(activityPages[0]!.fragments.some((f) => f.column === 1)).toBe(true);
  });

  it("puts the closing sections on a page of their own after two-column pages", () => {
    const m = buildDocumentModel(typicalSession({ coachNotes: "Watch number 9." }), {
      ...layout({ columns: 2 }),
      sections: { ...design().sections, reflection: true },
    });
    expectSound(m);
    const last = bodyPages(m).at(-1)!;
    expect(last.columns).toBe(1);
    expect(last.fragments.map((f) => f.kind)).toEqual(["notes", "reflection"]);
  });
});

describe("every page setup, both densities: nothing is clipped, lost or blank", () => {
  const inputs: Array<[string, SessionDocumentInput]> = [
    ["typical", typicalSession({ coachNotes: "Keep the intensity high." })],
    ["long", session(drillKeys().map((k) => ({ drill: k, minutes: 8 })))],
  ];
  const combos = PAPERS.flatMap((paper) =>
    ORIENTATIONS.flatMap((orientation) =>
      MARGINS.flatMap((margins) =>
        [1, 2].flatMap((columns) =>
          SPACINGS.flatMap((spacing) =>
            MODES.map((mode) => ({
              paper,
              orientation,
              margins,
              columns: columns as 1 | 2,
              spacing,
              mode,
            })),
          ),
        ),
      ),
    ),
  );

  it(`checks ${combos.length} designs on a typical and on a long session`, () => {
    expect(combos).toHaveLength(2 * 2 * 3 * 2 * 3 * 2);
    for (const [name, input] of inputs) {
      const activityCount = input.activities.filter((a) => a.kind !== "break").length;
      for (const { mode, ...page } of combos) {
        const d = design({ mode, page });
        const m = buildDocumentModel(input, {
          ...d,
          sections: { ...d.sections, cover: true, reflection: true },
        });
        expectSound(m, `${name} ${JSON.stringify({ mode, ...page })}`);
        // every activity is on some page, exactly once as a first piece
        expect(activityFragments(m).filter((f) => !f.continued)).toHaveLength(activityCount);
      }
    }
  });

  it("gives the same pages for the same input, every time", () => {
    const [, input] = inputs[1]!;
    const d = layout({ columns: 2, paper: "letter" }, "compact");
    expect(JSON.stringify(buildDocumentModel(input, d))).toBe(
      JSON.stringify(buildDocumentModel(input, d)),
    );
  });
});

describe("large sessions stay cheap", () => {
  it("builds the document for the longest session a coach can make (60 activities) well inside a frame", () => {
    const keys = drillKeys();
    const input = session(
      Array.from({ length: 60 }, (_, i) => ({ drill: keys[i % keys.length]!, minutes: 10 })),
    );
    const d = design();
    const start = performance.now();
    const m = buildDocumentModel(input, {
      ...d,
      sections: { ...d.sections, cover: true, reflection: true },
    });
    const ms = performance.now() - start;
    expectSound(m, "60 activities");
    expect(m.pageCount).toBeGreaterThan(50);
    // generous for a slow CI machine: it is normally a few tens of milliseconds
    expect(ms).toBeLessThan(750);
  });
});
