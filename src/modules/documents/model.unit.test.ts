import { describe, expect, it } from "vitest";
import { SECTION_IDS, type DocumentDesign, type SectionId } from "./design";
import { buildDocumentModel, buildFacts, collectEquipment } from "./model";
import { presetDesign } from "./presets";
import { METRICS } from "./layout";
import { activities, drillContent, drillKeys, session, typicalSession } from "./test-support";
import type {
  BandBlock,
  Cell,
  DocumentModel,
  DocumentActivityInput,
  Fragment,
  Row,
  SessionDocumentInput,
} from "./types";

const design = (patch: Partial<DocumentDesign> = {}): DocumentDesign => ({
  ...presetDesign("classic"),
  ...patch,
});
const withSections = (
  on: Partial<DocumentDesign["sections"]>,
  base = design(),
): DocumentDesign => ({
  ...base,
  sections: { ...base.sections, ...on },
});
const compact = (base = design()): DocumentDesign => ({ ...base, mode: "compact" });

const fragments = (m: DocumentModel): Fragment[] =>
  m.pages.flatMap((p) => (p.kind === "body" ? p.fragments : []));
const rows = (m: DocumentModel): Row[] => fragments(m).flatMap((f) => f.units.map((u) => u.row));
/** Everything an activity body says, in either column. */
const blocks = (m: DocumentModel): BandBlock[] =>
  rows(m).flatMap((r) => (r.t === "band" ? [...r.left, ...r.right] : []));
const cells = (m: DocumentModel): Cell[] =>
  blocks(m).flatMap((b) => (b.b === "cell" ? [b.cell] : []));
const figures = (m: DocumentModel) =>
  blocks(m).flatMap((b) => (b.b === "figure" ? [b.figure] : []));
const texts = (m: DocumentModel, label: string) =>
  blocks(m).flatMap((b) => (b.b === "text" && b.label === label ? [b.text] : []));
const equipmentBlocks = (m: DocumentModel) => blocks(m).filter((b) => b.b === "equipment");
const activityFragments = (m: DocumentModel) => fragments(m).filter((f) => f.kind === "activity");

describe("session → document model", () => {
  const input = typicalSession();
  const model = buildDocumentModel(input, design());

  it("carries the session's identity into the header and footer", () => {
    expect(model.title).toBe("Tuesday shooting and transition");
    expect(model.header).toMatchObject({
      brand: "CoachOS",
      clubName: "Riverside Basketball Club",
      title: "Tuesday shooting and transition",
      style: "line",
      logo: null,
    });
    expect(model.footer).toEqual({ coachName: "Sam Rivera", date: "2026-10-06", text: "" });
  });

  it("numbers its pages from 1 with a matching count, and lists what it contains", () => {
    expect(model.pages.map((p) => p.number)).toEqual(model.pages.map((_, i) => i + 1));
    expect(model.pageCount).toBe(model.pages.length);
    expect(model.pageCount).toBeGreaterThan(1);
    expect(model.sections).toEqual([
      "overview",
      "objectives",
      "equipment",
      "timeline",
      "diagrams",
      "instructions",
      "coachingPoints",
      "commonMistakes",
      "safety",
      "progressions",
      "regressions",
      "variations",
      "coachNotes",
    ]);
  });

  it("puts every activity on the page exactly once, in the coach's order, numbering breaks out", () => {
    const heads = activityFragments(model)
      .filter((f) => !f.continued)
      .map((f) => f.activity!);
    expect(heads.map((h) => h.title)).toEqual(
      input.activities.filter((a) => a.kind !== "break").map((a) => a.title),
    );
    expect(heads.map((h) => h.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // …and the break sits between its neighbours as a strip, unnumbered
    const order = fragments(model)
      .filter((f) => f.kind === "activity" || f.kind === "break")
      .map((f) => f.kind);
    expect(order[2]).toBe("break");
    const strip = fragments(model).find((f) => f.kind === "break")!;
    expect(strip.activity!.number).toBeNull();
  });

  it("describes each activity: phase, players, format, intensity and its time on the timeline", () => {
    const first = activityFragments(model)[0]!.activity!;
    const src = input.activities[0]!;
    expect(first).toMatchObject({
      kind: "drill",
      phase: src.phase,
      startMin: 0,
      endMin: 10,
      durationMin: 10,
      format: src.content!.format,
      intensity: src.content!.intensity,
      playersMin: src.content!.playersRange!.min,
      playersMax: src.content!.playersRange!.max,
    });
    // an explicit number of players on the activity beats the drill's own range
    const custom = buildDocumentModel(
      {
        ...input,
        activities: input.activities.map((a, i) => (i === 0 ? { ...a, players: 9 } : a)),
      },
      design(),
    );
    expect(activityFragments(custom)[0]!.activity).toMatchObject({ playersMin: 9, playersMax: 9 });
  });
});

describe("timing is the builder's own calculation", () => {
  it("prints the timeline rows with the offsets the builder shows: each starts where the one before ends", () => {
    const input = typicalSession();
    const model = buildDocumentModel(input, design());
    const timeline = fragments(model)
      .filter((f) => f.kind === "timeline")
      .flatMap((f) => f.units.map((u) => u.row))
      .flatMap((r) => (r.t === "timeline" ? [r.row] : []));
    // the builder's rule, written out: an activity starts when the previous one ends, from minute 0
    let at = 0;
    const expected = input.activities.map((a) => {
      const row = { startMin: at, endMin: at + a.durationMin };
      at = row.endMin;
      return row;
    });
    expect(timeline).toHaveLength(input.activities.length);
    timeline.forEach((row, i) => {
      expect([row.startMin, row.endMin]).toEqual([expected[i]!.startMin, expected[i]!.endMin]);
      expect(row.durationMin).toBe(input.activities[i]!.durationMin);
    });
    expect([timeline[0]!.startMin, timeline[0]!.endMin]).toEqual([0, 10]); // 00:00–10:00
    const last = timeline.at(-1)!;
    expect(last.endMin).toBe(input.totalMinutes);
  });

  it("puts the start, end and length into the overview, and marks an end after midnight", () => {
    const input = typicalSession({ endTime: "00:20", endsNextDay: true, startTime: "23:00:00" });
    const facts = buildFacts(input, ["startTime", "endTime", "duration", "date"]);
    expect(facts.find((f) => f.key === "startTime")!.value).toEqual({
      t: "time",
      hm: "23:00",
      nextDay: false,
    });
    expect(facts.find((f) => f.key === "endTime")!.value).toEqual({
      t: "time",
      hm: "00:20",
      nextDay: true,
    });
    expect(facts.find((f) => f.key === "duration")!.value).toEqual({
      t: "minutes",
      n: input.totalMinutes,
    });
    expect(facts.find((f) => f.key === "date")!.value).toEqual({ t: "date", iso: "2026-10-06" });
  });

  it("leaves out times it does not know rather than inventing them", () => {
    const input = typicalSession({ scheduledDate: null, startTime: null, endTime: null });
    const keys = buildFacts(input, ["date", "startTime", "endTime", "duration"]).map((f) => f.key);
    expect(keys).toEqual(["duration"]);
  });
});

describe("overview, cover and objectives", () => {
  const input = typicalSession();

  it("lists the overview facts in reading order and skips what is empty (no blanks, no repeats)", () => {
    const keys = buildFacts(input, [
      "team",
      "ageGroup",
      "level",
      "players",
      "date",
      "startTime",
      "endTime",
      "duration",
      "location",
      "coach",
      "club",
      "season",
      "sessionNumber",
    ]).map((f) => f.key);
    expect(keys).toEqual([
      "team",
      "ageGroup",
      "level",
      "players",
      "date",
      "startTime",
      "endTime",
      "duration",
      "location",
      "coach",
      "club",
      "season",
      "sessionNumber",
    ]);
    const sparse = session([], {
      teamName: null,
      ageGroup: null,
      ageRange: null,
      level: null,
      players: null,
      location: "",
      coachName: "  ",
      clubName: "",
      season: "",
      sessionNumber: null,
    });
    expect(
      buildFacts(sparse, [
        "team",
        "ageGroup",
        "level",
        "players",
        "location",
        "coach",
        "club",
        "season",
        "sessionNumber",
      ]),
    ).toEqual([]);
    // the age group falls back to the actual ages
    expect(buildFacts({ ...input, ageGroup: null }, ["ageGroup"])[0]!.value).toEqual({
      t: "text",
      text: "13–14",
    });
  });

  it("adds a cover page first when it is switched on, with the title, team, objectives and dates", () => {
    const model = buildDocumentModel(input, withSections({ cover: true }));
    const cover = model.pages[0];
    expect(cover).toMatchObject({ number: 1, kind: "cover" });
    if (cover?.kind !== "cover") throw new Error("cover expected");
    expect(cover.cover.title).toBe(input.title);
    expect(cover.cover.clubName).toBe("Riverside Basketball Club");
    expect(cover.cover.primaryObjective).toBe("Shooting");
    expect(cover.cover.secondaryObjectives).toEqual(["Transition", "Passing"]);
    expect(cover.cover.facts.map((f) => f.key)).toEqual([
      "team",
      "ageGroup",
      "level",
      "date",
      "startTime",
      "endTime",
      "duration",
      "location",
      "coach",
      "sessionNumber",
    ]);
    expect(model.sections[0]).toBe("cover");
    expect(model.pageCount).toBe(buildDocumentModel(input, design()).pageCount + 1);
  });

  it("does not say the same thing on the cover and on the overview", () => {
    const model = buildDocumentModel(input, withSections({ cover: true }));
    const overview = fragments(model).find((f) => f.kind === "overview")!;
    const row = overview.units[0]!.row;
    if (row.t !== "facts") throw new Error("facts expected");
    expect(row.facts.map((f) => f.key)).toEqual(["players", "season"]);
    const bare = buildDocumentModel(input, design());
    const plain = fragments(bare).find((f) => f.kind === "overview")!.units[0]!.row;
    if (plain.t !== "facts") throw new Error("facts expected");
    expect(plain.facts.length).toBeGreaterThan(8); // without a cover the overview carries it all
  });

  it("leaves out the overview when the cover already said everything", () => {
    const only = session([{ custom: "Team talk" }], { players: null, season: "" });
    const model = buildDocumentModel(only, {
      ...withSections({ cover: true, objectives: false, timeline: false }),
    });
    expect(fragments(model).some((f) => f.kind === "overview")).toBe(false);
  });

  it("shows the main objective and 'also working on' apart, with the session goal", () => {
    const model = buildDocumentModel(input, design());
    const row = fragments(model).find((f) => f.kind === "objectives")!.units[0]!.row;
    expect(row).toMatchObject({
      t: "objectives",
      primary: "Shooting",
      secondary: ["Transition", "Passing"],
      goal: "Better spacing and quicker decisions in transition.",
    });
    const none = buildDocumentModel(
      session([{ custom: "x" }], { objectives: { primary: null, secondary: [] }, goal: "" }),
      design(),
    );
    expect(fragments(none).some((f) => f.kind === "objectives")).toBe(false);
  });
});

describe("equipment", () => {
  const two = (a: string, b: string) => activities([{ drill: a }, { drill: b }]);

  it("is collected from the activities, once each, at the largest quantity any of them needs", () => {
    const list = two("ball-screen-2v2", "shell-defense-4v4");
    const items = collectEquipment(list, null);
    const names = items.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length); // deduplicated
    expect(names).toEqual([...names].sort((x, y) => (x.toLowerCase() < y.toLowerCase() ? -1 : 1)));
    for (const a of list) for (const e of a.content!.equipment) expect(names).toContain(e.name);
    // where two activities both use an item, the larger quantity wins
    const shared = items.find((i) => i.name === "Basketball")!;
    const quantities = list.flatMap((a) =>
      a.content!.equipment.filter((e) => e.name === "Basketball").map((e) => e.quantity),
    );
    expect(shared.quantity).toBe(Math.max(...quantities));
  });

  it("turns per-player and per-pair quantities into totals when the session's players are known", () => {
    const list: DocumentActivityInput[] = activities([{ custom: "x" }, { custom: "y" }]).map(
      (a, i) => ({
        ...a,
        content: {
          ...a.content!,
          equipment: [
            {
              key: "basketball",
              name: "Basketballs",
              rule: i === 0 ? "per_player" : "fixed",
              quantity: i === 0 ? 1 : 6,
            },
            { key: "cones", name: "Cones", rule: "per_pair", quantity: 2 },
          ],
        },
      }),
    );
    expect(collectEquipment(list, 12)).toEqual([
      { name: "Basketballs", quantity: 12, per: null }, // 1 per player × 12 beats a fixed 6
      { name: "Cones", quantity: 12, per: null }, // 2 per pair × 6 pairs
    ]);
    // without a player count the rule is kept, so nothing is invented
    expect(collectEquipment(list, null)).toEqual([
      { name: "Basketballs", quantity: 6, per: null },
      { name: "Cones", quantity: 2, per: "pair" },
    ]);
  });

  it("is absent when no activity needs anything (a coach-written session)", () => {
    const model = buildDocumentModel(session([{ custom: "Talk" }, { break: 2 }]), design());
    expect(fragments(model).some((f) => f.kind === "equipment")).toBe(false);
    expect(collectEquipment([], 10)).toEqual([]);
  });
});

describe("section toggles: a switched-off section disappears completely", () => {
  const input = typicalSession({ coachNotes: "Watch number 9's shoulder." });
  const base = buildDocumentModel(input, design());

  /** What in the model belongs to each toggle. */
  const present = (m: DocumentModel, id: SectionId): boolean => {
    switch (id) {
      case "cover":
        return m.pages.some((p) => p.kind === "cover");
      case "overview":
      case "objectives":
      case "equipment":
      case "timeline":
        return fragments(m).some((f) => f.kind === id);
      case "diagrams":
        return figures(m).length > 0;
      case "coachNotes":
        return (
          fragments(m).some((f) => f.kind === "notes") || cells(m).some((c) => c.key === "notes")
        );
      case "reflection":
        return fragments(m).some((f) => f.kind === "reflection");
      default:
        return cells(m).some((c) => c.key === id);
    }
  };

  it.each(SECTION_IDS.filter((id) => id !== "cover" && id !== "reflection"))(
    "%s: on → present, off → gone",
    (id) => {
      expect(present(base, id), `${id} on`).toBe(true);
      const off = buildDocumentModel(input, withSections({ [id]: false }));
      expect(present(off, id), `${id} off`).toBe(false);
      expect(off.sections).not.toContain(id);
      // nothing else disappears with it
      for (const other of base.sections.filter(
        (s) => s !== id && s !== "coachNotes" && s !== "equipment",
      ))
        expect(off.sections, `${other} stays`).toContain(other);
    },
  );

  it("cover and reflection are off by default and appear when switched on", () => {
    expect(present(base, "cover")).toBe(false);
    expect(present(base, "reflection")).toBe(false);
    expect(present(buildDocumentModel(input, withSections({ cover: true })), "cover")).toBe(true);
    expect(
      present(buildDocumentModel(input, withSections({ reflection: true })), "reflection"),
    ).toBe(true);
  });

  it("with every section off only the activities remain (they are the document and have no switch)", () => {
    const allOff = Object.fromEntries(
      SECTION_IDS.map((sectionId) => [sectionId, false]),
    ) as DocumentDesign["sections"];
    const m = buildDocumentModel(input, { ...design(), sections: allOff });
    expect(m.sections).toEqual([]);
    expect(fragments(m).every((f) => f.kind === "activity" || f.kind === "break")).toBe(true);
    expect(cells(m)).toEqual([]);
    expect(figures(m)).toEqual([]);
    expect(texts(m, "setup").length).toBeGreaterThan(0);
    // and a session with no activities and everything off is simply empty: no blank pages
    const empty = buildDocumentModel(session([]), { ...design(), sections: allOff });
    expect(empty.pageCount).toBe(0);
    expect(empty.pages).toEqual([]);
  });

  it("switching the equipment list off also drops each activity's own equipment line", () => {
    const off = buildDocumentModel(input, withSections({ equipment: false }));
    expect(fragments(off).some((f) => f.kind === "equipment")).toBe(false);
    expect(equipmentBlocks(off)).toEqual([]);
    expect(equipmentBlocks(base).length).toBeGreaterThan(0);
  });
});

describe("compact and detailed", () => {
  const input = typicalSession();

  it("detailed shows every part of a drill that the toggles allow", () => {
    const m = buildDocumentModel(input, design());
    const keys = new Set(cells(m).map((c) => c.key));
    for (const key of [
      "instructions",
      "coachingPoints",
      "commonMistakes",
      "safety",
      "progressions",
      "regressions",
      "variations",
    ] as const)
      expect(keys.has(key), key).toBe(true);
    expect(texts(m, "objective").length).toBeGreaterThan(0);
    expect(texts(m, "setup").length).toBeGreaterThan(0);
    expect(equipmentBlocks(m).length).toBeGreaterThan(0);
  });

  it("compact keeps the title, timing, players, equipment, a short setup, the diagram and key coaching points", () => {
    const m = buildDocumentModel(input, compact());
    expect([...new Set(cells(m).map((c) => c.key))]).toEqual(["coachingPoints"]);
    for (const c of cells(m)) expect(c.items.length).toBeLessThanOrEqual(3);
    expect(texts(m, "objective")).toEqual([]);
    expect(texts(m, "organization")).toEqual([]);
    for (const setup of texts(m, "setup")) expect(setup.length).toBeLessThanOrEqual(201);
    expect(equipmentBlocks(m).length).toBeGreaterThan(0);
    const drills = activityFragments(m)
      .map((f) => f.activity!)
      .filter((h) => h.kind === "drill");
    expect(drills.every((h) => h.startMin >= 0 && h.durationMin > 0 && h.playersMin !== null)).toBe(
      true,
    );
    // one diagram per drill, no more
    expect(figures(m)).toHaveLength(drills.length);
    expect(m.pageCount).toBeLessThan(buildDocumentModel(input, design()).pageCount);
  });

  it("compact never prints an activity's own notes; detailed does, if the toggle is on", () => {
    const noted = typicalSession();
    noted.activities[0] = { ...noted.activities[0]!, notes: "Both hands, call your makes." };
    expect(cells(buildDocumentModel(noted, compact())).some((c) => c.key === "notes")).toBe(false);
    const detailed = cells(buildDocumentModel(noted, design()));
    expect(detailed.find((c) => c.key === "notes")).toMatchObject({
      text: "Both hands, call your makes.",
    });
    expect(
      cells(buildDocumentModel(noted, withSections({ coachNotes: false }))).some(
        (c) => c.key === "notes",
      ),
    ).toBe(false);
  });

  it("shortens the setup at a word, marking the cut", () => {
    const long = session([{ drill: drillKeys()[0]! }]);
    long.activities[0]!.content!.setup = "Players form three lines on the baseline. "
      .repeat(12)
      .trim();
    const [setup] = texts(buildDocumentModel(long, compact()), "setup");
    expect(setup!.endsWith("…")).toBe(true);
    expect(setup!.length).toBeLessThanOrEqual(201);
  });

  it("switching mode back and forth gives the same document each time", () => {
    const a = buildDocumentModel(input, design());
    buildDocumentModel(input, compact());
    expect(buildDocumentModel(input, design())).toEqual(a);
  });
});

describe("empty parts are not forced", () => {
  it("a drill without safety notes or variations has no such cells", () => {
    const one = session([{ drill: "mikan-drill" }]);
    one.activities[0]!.content = {
      ...one.activities[0]!.content!,
      safety: "",
      variations: [],
      commonMistakes: [],
      progressions: [],
      regressions: [],
    };
    const keys = cells(buildDocumentModel(one, design())).map((c) => c.key);
    expect(keys).toEqual(["instructions", "coachingPoints"]);
  });

  it("a coach-written activity prints only what the coach wrote, and a bare one keeps just its header", () => {
    const m = buildDocumentModel(
      session([
        { custom: "Free throws", description: "Pairs shoot ten each." },
        { custom: "Water and talk" },
      ]),
      design(),
    );
    const [first, second] = activityFragments(m);
    const firstBlocks = first!.units.flatMap((u) =>
      u.row.t === "band" ? [...u.row.left, ...u.row.right] : [],
    );
    expect(firstBlocks).toHaveLength(1);
    expect(firstBlocks[0]).toMatchObject({
      b: "text",
      label: "description",
      text: "Pairs shoot ten each.",
    });
    expect(
      second!.units.every(
        (u) => u.row.t === "band" && u.row.left.length + u.row.right.length === 0,
      ),
    ).toBe(true);
    expect(second!.activity!.title).toBe("Water and talk");
  });

  it("a session with no activities still produces its overview", () => {
    const m = buildDocumentModel(session([]), design());
    expect(fragments(m).map((f) => f.kind)).toEqual(["overview", "objectives", "notes"]);
    expect(m.pageCount).toBe(1);
  });
});

describe("diagrams", () => {
  const withDiagrams = (count: number): SessionDocumentInput => {
    const one = session([{ drill: "give-and-go" }]);
    const original = one.activities[0]!.content!.diagrams[0]!;
    one.activities[0]!.content!.diagrams = Array.from({ length: count }, (_, i) => ({
      ...original,
      title: `Option ${i + 1}`,
    }));
    return one;
  };

  it("draws the first diagram top right and any further ones in whichever column has room, all at true proportions", () => {
    const m = buildDocumentModel(withDiagrams(3), design());
    const all = figures(m);
    expect(all.map((f) => f.title).sort()).toEqual(["Option 1", "Option 2", "Option 3"]);
    const band = rows(m).find((r) => r.t === "band");
    if (band?.t !== "band") throw new Error("band expected");
    expect(band.right[0]).toMatchObject({ b: "figure", figure: { title: "Option 1" } });
    const [a, b] = all;
    expect(a!.widthMm / a!.heightMm).toBeCloseTo(b!.widthMm / b!.heightMm, 1);
    for (const f of all) {
      expect(f.widthMm).toBeLessThanOrEqual(METRICS.figureMaxWidth + 0.01);
      expect(f.heightMm).toBeLessThanOrEqual(METRICS.figureMaxHeight + 0.01);
      expect(f.captionMm).toBe(METRICS.figureCaption);
    }
  });

  it("compact mode draws only the first", () => {
    expect(figures(buildDocumentModel(withDiagrams(3), compact()))).toHaveLength(1);
  });

  it("the diagrams switch removes them all, and an unknown court is left out rather than breaking the page", () => {
    expect(
      figures(buildDocumentModel(withDiagrams(3), withSections({ diagrams: false }))),
    ).toHaveLength(0);
    const odd = withDiagrams(2);
    const bad = odd.activities[0]!.content!.diagrams[0]!;
    odd.activities[0]!.content!.diagrams[0] = {
      ...bad,
      diagram: { ...bad.diagram, court: { type: "half", variant: "nope" } } as typeof bad.diagram,
    };
    expect(figures(buildDocumentModel(odd, design())).map((f) => f.title)).toEqual(["Option 2"]);
  });

  it("gives a real drill a figure that fits the box it is drawn in", () => {
    const m = buildDocumentModel(typicalSession(), design());
    for (const f of figures(m)) {
      expect(f.widthMm).toBeGreaterThan(20);
      expect(f.heightMm).toBeGreaterThan(20);
    }
  });
});

describe("logo, footer and reflection", () => {
  const id = "01a0c262-7596-7410-91b4-08c214915c45";

  it("carries a logo reference to the header and the cover (the pixels are somebody else's job)", () => {
    const m = buildDocumentModel(typicalSession(), {
      ...withSections({ cover: true }),
      logo: { assetId: id },
    });
    expect(m.header.logo).toEqual({ assetId: id });
    const cover = m.pages[0]!;
    if (cover.kind !== "cover") throw new Error("cover expected");
    expect(cover.cover.logo).toEqual({ assetId: id });
    expect(buildDocumentModel(typicalSession(), design()).header.logo).toBeNull();
  });

  it("puts the custom footer text and the coach into the footer, trimmed", () => {
    const m = buildDocumentModel(typicalSession(), {
      ...design(),
      footer: { text: "  Riverside BC · Confidential  " },
    });
    expect(m.footer).toMatchObject({
      text: "Riverside BC · Confidential",
      coachName: "Sam Rivera",
    });
  });

  it("prints the four reflection prompts, with the coach's text where there is some", () => {
    const m = buildDocumentModel(typicalSession(), withSections({ reflection: true }), {
      wentWell: "Sharp press release.",
      needsImprovement: "",
      nextFocus: "Finishing",
      notes: "",
    });
    const reflection = rows(m).flatMap((r) => (r.t === "reflection" ? [r] : []));
    expect(reflection.map((r) => r.prompt)).toEqual([
      "wentWell",
      "needsImprovement",
      "nextFocus",
      "notes",
    ]);
    expect(reflection.map((r) => r.text)).toEqual(["Sharp press release.", "", "Finishing", ""]);
    // blank prompts keep room to write by hand
    for (const r of reflection.filter((x) => !x.text))
      expect(r.boxMm).toBeGreaterThanOrEqual(METRICS.reflectionMinBox);
  });

  it("prints the session's coach notes as their own section after the activities", () => {
    const m = buildDocumentModel(typicalSession({ coachNotes: "Watch number 9." }), design());
    const kinds = fragments(m).map((f) => f.kind);
    expect(kinds.at(-1)).toBe("notes");
    expect(kinds.indexOf("notes")).toBeGreaterThan(kinds.lastIndexOf("activity"));
    expect(buildDocumentModel(typicalSession({ coachNotes: "" }), design()).sections).not.toContain(
      "coachNotes",
    );
  });
});

describe("purity and determinism", () => {
  const deepFreeze = <T>(o: T): T => {
    if (o && typeof o === "object") {
      Object.freeze(o);
      for (const v of Object.values(o)) deepFreeze(v);
    }
    return o;
  };

  it("does not touch its inputs and gives the same document for the same input, run after run", () => {
    const input = deepFreeze(typicalSession());
    const d = deepFreeze(design());
    const a = buildDocumentModel(input, d);
    const b = buildDocumentModel(input, d);
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    // a JSON round trip of the input (as it crosses from the server) changes nothing
    const viaJson = buildDocumentModel(JSON.parse(JSON.stringify(input)), d);
    expect(JSON.stringify(viaJson)).toBe(JSON.stringify(a));
  });

  it("is a plain, serialisable value (no functions, no dates, no class instances)", () => {
    const m = buildDocumentModel(typicalSession(), design());
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });

  it("gives different pages for different designs, from the same session", () => {
    const input = typicalSession();
    const a4 = buildDocumentModel(input, design());
    const letter = buildDocumentModel(input, {
      ...design(),
      page: { ...design().page, paper: "letter", orientation: "landscape" },
    });
    expect(a4.geometry.widthMm).not.toBe(letter.geometry.widthMm);
    expect(letter.pageCount).not.toBe(a4.pageCount);
  });

  it("reads real library content of every drill without failing", () => {
    for (const key of drillKeys()) {
      const m = buildDocumentModel(session([{ drill: key }]), design());
      expect(m.pageCount, key).toBeGreaterThan(0);
      expect(drillContent(key).title.length).toBeGreaterThan(0);
    }
  });
});
