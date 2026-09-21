import { getCourtPack } from "@/sports/registry";
import type { Diagram } from "@/engines/diagram";
import {
  activitySectionShown,
  emptyReflection,
  type DocumentDesign,
  type Reflection,
  type SectionId,
} from "./design";
import {
  lineHeightMm,
  listHeight,
  shorten,
  splitItems,
  splitParagraph,
  textHeight,
  wrapLines,
  type TextStyle,
} from "./estimate";
import { METRICS, TYPE_PT, pageGeometry, type PageGeometry } from "./layout";
import { paginate, type Segment } from "./paginate";
import type {
  ActivityHead,
  BandBlock,
  Cell,
  CellKey,
  DocumentActivityContent,
  DocumentActivityInput,
  DocumentModel,
  DocumentPage,
  EquipmentItem,
  Fact,
  FactKey,
  Figure,
  Group,
  Row,
  SessionDocumentInput,
  TimelineRow,
  Unit,
} from "./types";

/**
 * Session + design → the document, page by page. Pure and deterministic: no I/O, no clock, no browser, no
 * React. The steps are separate functions so each can be tested alone:
 *   facts / equipment / timeline / activities  →  groups of pieces with estimated heights
 *   paginate()                                 →  pages
 * `SessionDocumentInput.startMin/endMin` come from the same `buildTimeline` the session builder uses, so the
 * times printed here are the times on the screen the coach built the session on.
 */

const TITLE_LINE_HEIGHT = 1.2;
/** Width reserved for an activity's time box and number badge in its header (see document.css). */
const ACT_TIME_BOX = 40;
const ACT_NUMBER_BOX = 9;
/** Below this column width the activity's time moves under its title. */
const NARROW_SLOT_MM = 110;
/** From this column width the diagram can sit beside an activity's text. */
const BESIDE_MIN_MM = 120;
/** A meta item ("Small-sided", "8–12 players", "Intensity: Medium") is roughly this many characters. */
const META_ITEM_CHARS = 20;

/**
 * The running header shows the title on one line and clips it (with an ellipsis) when it does not fit. A title longer
 * than this is therefore also written out in full in the overview, so no title is ever only half on paper.
 */
const TITLE_FACT_CHARS = 44;

const OVERVIEW_ORDER: readonly FactKey[] = [
  "title",
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
];
/** What the cover already says, so the overview does not say it twice. */
const COVER_FACTS: readonly FactKey[] = [
  "team",
  "ageGroup",
  "level",
  "coach",
  "date",
  "startTime",
  "endTime",
  "duration",
  "location",
  "sessionNumber",
];

const hm = (time: string) => time.slice(0, 5);

/** The overview's facts, in reading order; a fact with nothing to say is not there. */
export function buildFacts(input: SessionDocumentInput, keys: readonly FactKey[]): Fact[] {
  const out: Fact[] = [];
  const has = (k: FactKey) => keys.includes(k);
  const text = (key: FactKey, value: string | null | undefined) => {
    if (has(key) && value && value.trim())
      out.push({ key, value: { t: "text", text: value.trim() } });
  };
  const byKey: Record<FactKey, () => void> = {
    title: () => {
      if (input.title.trim().length > TITLE_FACT_CHARS) text("title", input.title);
    },
    team: () => text("team", input.teamName),
    ageGroup: () =>
      text(
        "ageGroup",
        input.ageGroup ?? (input.ageRange ? `${input.ageRange.min}–${input.ageRange.max}` : null),
      ),
    level: () => {
      if (has("level") && input.level)
        out.push({ key: "level", value: { t: "level", level: input.level } });
    },
    players: () => {
      if (has("players") && input.players)
        out.push({ key: "players", value: { t: "number", n: input.players } });
    },
    date: () => {
      if (has("date") && input.scheduledDate)
        out.push({ key: "date", value: { t: "date", iso: input.scheduledDate } });
    },
    startTime: () => {
      if (has("startTime") && input.startTime)
        out.push({
          key: "startTime",
          value: { t: "time", hm: hm(input.startTime), nextDay: false },
        });
    },
    endTime: () => {
      if (has("endTime") && input.endTime)
        out.push({
          key: "endTime",
          value: { t: "time", hm: hm(input.endTime), nextDay: input.endsNextDay },
        });
    },
    duration: () => {
      if (has("duration") && input.totalMinutes > 0)
        out.push({ key: "duration", value: { t: "minutes", n: input.totalMinutes } });
    },
    location: () => text("location", input.location),
    coach: () => text("coach", input.coachName),
    club: () => text("club", input.clubName),
    season: () => text("season", input.season),
    sessionNumber: () => {
      if (has("sessionNumber") && input.sessionNumber)
        out.push({ key: "sessionNumber", value: { t: "number", n: input.sessionNumber } });
    },
  };
  for (const key of OVERVIEW_ORDER) byKey[key]();
  return out;
}

/** A worst-case string for a fact's value, to estimate how many lines it takes. */
function factText(f: Fact): string {
  switch (f.value.t) {
    case "text":
      return f.value.text;
    case "number":
      return String(f.value.n);
    case "date":
      return "Wednesday, 30 September 2026";
    case "time":
      return f.value.nextDay ? "12:00 AM (next day)" : "12:00 AM";
    case "minutes":
      return `${f.value.n} min`;
    case "level":
      return "Intermediate";
  }
}

/** Equipment for the whole session: every activity's kit, once, at the largest quantity any activity needs. */
export function collectEquipment(
  activities: readonly DocumentActivityInput[],
  players: number | null,
): EquipmentItem[] {
  const seen = new Map<string, EquipmentItem>();
  for (const a of activities) {
    for (const e of a.content?.equipment ?? []) {
      const item = resolveEquipment(e, players);
      const key = e.key.toLowerCase();
      const prior = seen.get(key);
      if (!prior || item.quantity > prior.quantity) seen.set(key, item);
    }
  }
  return [...seen.values()].sort((x, y) => (x.name.toLowerCase() < y.name.toLowerCase() ? -1 : 1));
}

function resolveEquipment(
  e: { name: string; rule: "fixed" | "per_player" | "per_pair"; quantity: number },
  players: number | null,
): EquipmentItem {
  if (e.rule === "fixed") return { name: e.name, quantity: e.quantity, per: null };
  if (players) {
    const count = e.rule === "per_player" ? players : Math.ceil(players / 2);
    return { name: e.name, quantity: e.quantity * count, per: null };
  }
  return { name: e.name, quantity: e.quantity, per: e.rule === "per_player" ? "player" : "pair" };
}

const equipmentText = (i: EquipmentItem) =>
  i.quantity > 1 || i.per ? `${i.name} ×${i.quantity}` : i.name;

// ---- pieces ------------------------------------------------------------------------------------------

interface Ctx {
  design: DocumentDesign;
  geo: PageGeometry;
  body: TextStyle;
  small: TextStyle;
  fact: TextStyle;
  title: TextStyle;
}

function makeCtx(design: DocumentDesign, geo: PageGeometry): Ctx {
  const family = design.typography.family;
  const run = { family, lineHeight: geo.lineHeight };
  return {
    design,
    geo,
    body: { ...run, sizePt: TYPE_PT.body },
    small: { ...run, sizePt: TYPE_PT.small },
    fact: { ...run, sizePt: TYPE_PT.fact },
    title: { family, sizePt: TYPE_PT.activity, lineHeight: TITLE_LINE_HEIGHT, bold: true },
  };
}

const sectionHead = (geo: PageGeometry) => METRICS.sectionHead + geo.gapMm;

function sectionGroup(
  id: string,
  kind: Group["kind"],
  ctx: Ctx,
  units: Unit[],
  opts: { keepTogether: boolean; lead: number; unitGap: number },
): Group {
  const head = sectionHead(ctx.geo);
  return {
    id,
    kind,
    activity: null,
    headMm: { first: head, continued: head },
    tailMm: 0,
    unitGap: opts.unitGap,
    keepTogether: opts.keepTogether,
    lead: opts.lead,
    units,
  };
}

function overviewGroup(facts: Fact[], ctx: Ctx): Group | null {
  if (facts.length === 0) return null;
  const width = ctx.geo.bodyWidthMm;
  const across = width >= 240 ? 4 : width >= 120 ? 3 : 2;
  const colWidth = (width - (across - 1) * ctx.geo.gapMm) / across;
  let height = 0;
  const rows = Math.ceil(facts.length / across);
  for (let r = 0; r < rows; r++) {
    const rowFacts = facts.slice(r * across, (r + 1) * across);
    const values = Math.max(...rowFacts.map((f) => textHeight(factText(f), colWidth, ctx.fact)));
    height += METRICS.factLabel + values;
  }
  height += (rows - 1) * ctx.geo.stackGapMm;
  return sectionGroup(
    "overview",
    "overview",
    ctx,
    [{ row: { t: "facts", facts, across }, heightMm: height }],
    {
      keepTogether: true,
      lead: 1,
      unitGap: 0,
    },
  );
}

function objectivesGroup(input: SessionDocumentInput, ctx: Ctx): Group | null {
  const { primary, secondary } = input.objectives;
  const goal = input.goal.trim();
  if (!primary && secondary.length === 0 && !goal) return null;
  const width = ctx.geo.bodyWidthMm;
  const colWidth = (width - ctx.geo.gapMm) / 2;
  const left = primary
    ? METRICS.cellLabel +
      textHeight(primary, colWidth, { ...ctx.fact, sizePt: TYPE_PT.section, bold: true })
    : 0;
  const right =
    secondary.length > 0
      ? METRICS.cellLabel + textHeight(secondary.join("  ·  "), colWidth, ctx.body)
      : 0;
  const cols = Math.max(left, right);
  const goalH = goal ? METRICS.cellLabel + textHeight(goal, width, ctx.body) : 0;
  const height = cols + (cols > 0 && goalH > 0 ? ctx.geo.stackGapMm : 0) + goalH;
  return sectionGroup(
    "objectives",
    "objectives",
    ctx,
    [{ row: { t: "objectives", primary, secondary, goal }, heightMm: height }],
    { keepTogether: true, lead: 1, unitGap: 0 },
  );
}

function equipmentGroup(items: EquipmentItem[], ctx: Ctx): Group | null {
  if (items.length === 0) return null;
  const width = ctx.geo.bodyWidthMm;
  const across = width >= 150 ? 3 : 2;
  const colWidth = (width - (across - 1) * ctx.geo.gapMm) / across - 6; // 6mm: the tick box and its gap
  const rows = Math.ceil(items.length / across);
  let height = 0;
  for (let r = 0; r < rows; r++) {
    const rowItems = items.slice(r * across, (r + 1) * across);
    height += Math.max(...rowItems.map((i) => textHeight(equipmentText(i), colWidth, ctx.body)));
  }
  height += (rows - 1) * ctx.geo.stackGapMm;
  return sectionGroup(
    "equipment",
    "equipment",
    ctx,
    [{ row: { t: "equipment", items, across }, heightMm: height }],
    {
      keepTogether: true,
      lead: 1,
      unitGap: 0,
    },
  );
}

const toTimelineRow = (a: DocumentActivityInput, number: number | null): TimelineRow => ({
  number,
  kind: a.kind,
  title: a.title,
  phase: a.phase,
  startMin: a.startMin,
  endMin: a.endMin,
  durationMin: a.durationMin,
});

/** 1, 2, 3… for the activities a coach thinks of as such; a break is not numbered. */
function numbering(activities: readonly DocumentActivityInput[]): Array<number | null> {
  let n = 0;
  return activities.map((a) => (a.kind === "break" ? null : ++n));
}

function timelineGroup(activities: readonly DocumentActivityInput[], ctx: Ctx): Group | null {
  if (activities.length === 0) return null;
  const numbers = numbering(activities);
  const titleWidth =
    ctx.geo.bodyWidthMm -
    METRICS.tableTimeCol -
    METRICS.tablePhaseCol -
    METRICS.tableDurationCol -
    4;
  const units: Unit[] = activities.map((a, i) => ({
    row: { t: "timeline", row: toTimelineRow(a, numbers[i]!) },
    heightMm: textHeight(a.title, titleWidth - 8, ctx.body) + 2 * METRICS.tableRowPad + 0.35,
  }));
  const head = sectionHead(ctx.geo) + METRICS.tableHead; // the column headings sit right under the section bar
  return {
    ...sectionGroup("timeline", "timeline", ctx, units, {
      keepTogether: true,
      lead: 3,
      unitGap: 0,
    }),
    headMm: { first: head, continued: head },
    // the table's bottom border and rounding: never let the estimate be shorter than the real table
    tailMm: 0.8,
  };
}

// ---- figures -------------------------------------------------------------------------------------

function aspectOf(diagram: Diagram): number | null {
  const pack = getCourtPack(diagram.sport, diagram.court);
  if (!pack) return null;
  const { minX, maxX, minY, maxY } = pack.bounds;
  const w = maxX - minX + 2 * pack.margin;
  const h = maxY - minY + 2 * pack.margin;
  return h > 0 ? w / h : null;
}

/** Size a diagram to fit a box. A diagram whose court is unknown is left out (as everywhere else in the app). */
function sizeFigure(
  entry: { title: string; diagram: Diagram },
  maxWidthMm: number,
  maxHeightMm: number,
): Figure | null {
  const aspect = aspectOf(entry.diagram);
  if (!aspect) return null;
  const widthMm = Math.max(20, Math.min(maxWidthMm, maxHeightMm * aspect));
  return {
    title: entry.title,
    diagram: entry.diagram,
    widthMm: round(widthMm),
    heightMm: round(widthMm / aspect),
    captionMm: entry.title.trim() ? METRICS.figureCaption : 0,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

// ---- activities ----------------------------------------------------------------------------------

interface CellSpec {
  key: CellKey;
  ordered: boolean;
  start: number;
  text: string | null;
  items: string[];
  continued: boolean;
}

const cellHeight = (c: CellSpec, width: number, ctx: Ctx) =>
  METRICS.cellLabel +
  (c.text !== null ? textHeight(c.text, width, ctx.body) : listHeight(c.items, width, ctx.body));

/** Text > a page is cut (sentence / item boundaries) so every piece the paginator sees fits on one. */
function chunkCell(c: CellSpec, width: number, ctx: Ctx, maxHeight: number): CellSpec[] {
  const room = maxHeight - METRICS.cellLabel;
  if (c.text !== null) {
    return splitParagraph(c.text, width, ctx.body, room).map((text, i) => ({
      ...c,
      text,
      continued: i > 0,
    }));
  }
  let start = 1;
  return splitItems(c.items, width, ctx.body, room).map((items, i) => {
    const piece = { ...c, items, start, continued: i > 0 };
    start += items.length;
    return piece;
  });
}

function activityHead(
  a: DocumentActivityInput,
  number: number | null,
  narrow: boolean,
): ActivityHead {
  const range = a.content?.playersRange ?? null;
  return {
    number,
    narrow,
    kind: a.kind,
    title: a.title,
    phase: a.phase,
    startMin: a.startMin,
    endMin: a.endMin,
    durationMin: a.durationMin,
    playersMin: a.players ?? range?.min ?? null,
    playersMax: a.players ?? range?.max ?? null,
    format: a.content?.format ?? null,
    intensity: a.content?.intensity ?? null,
    repetitions: a.repetitions,
  };
}

function activityGroup(
  a: DocumentActivityInput,
  number: number | null,
  sessionPlayers: number | null,
  ctx: Ctx,
): Group {
  const { design, geo } = ctx;
  // in a narrow column (two-column pages) the time goes under the title, not beside it
  const narrow = geo.columnWidthMm < NARROW_SLOT_MM;
  const head = activityHead(a, number, narrow);

  if (a.kind === "break") {
    return {
      id: `activity-${a.id}`,
      kind: "break",
      activity: head,
      headMm: { first: 0, continued: 0 },
      tailMm: 0,
      unitGap: 0,
      keepTogether: true,
      lead: 1,
      units: [{ row: { t: "break", row: toTimelineRow(a, null) }, heightMm: METRICS.breakStrip }],
    };
  }

  const slot = geo.columnWidthMm;
  const inner = slot - 2 * METRICS.actBorder - 2 * METRICS.actBodyPad;
  const c: DocumentActivityContent | null = a.content;
  const compact = design.mode === "compact";

  // header: title beside the number and the time box, then one line of facts
  const titleWidth = inner - ACT_NUMBER_BOX - (narrow ? 0 : ACT_TIME_BOX);
  const titleH = wrapLines(a.title, titleWidth, ctx.title) * lineHeightMm(ctx.title);
  const metaCount = [
    a.phase,
    head.playersMin,
    head.format,
    head.intensity,
    head.repetitions,
  ].filter((v) => v !== null && v !== undefined).length;
  const metaText = Array.from({ length: metaCount }, () => "M".repeat(META_ITEM_CHARS - 6)).join(
    " · ",
  );
  const metaH = metaCount > 0 ? textHeight(metaText, inner, ctx.small) : 0;
  const headBlock =
    2 * METRICS.actHeadPad +
    (narrow
      ? titleH + ctx.geo.stackGapMm * 0.4 + lineHeightMm(ctx.small)
      : Math.max(titleH, 2 * lineHeightMm(ctx.small))) +
    (metaH > 0 ? ctx.geo.stackGapMm * 0.4 + metaH : 0);
  const continuedBlock = 2 * METRICS.actHeadPad + lineHeightMm(ctx.title);

  /**
   * The activity's body as pieces. `pieceFactor` caps how tall one piece of text may be and `bandFactor` how tall a
   * two-column band may grow, both as a share of a page body. Coarse (half a page, 62%) keeps an ordinary activity in
   * few, well-balanced bands; fine is for an activity that cannot fit one page anyway and has to break, where small
   * pieces fill the pages better.
   */
  const arrange = (pieceFactor: number, bandFactor: number): Unit[] => {
    const units: Unit[] = [];
    const push = (row: Row, heightMm: number) => units.push({ row, heightMm });

    // -- what the activity says, as blocks in reading order. Each block can be drawn at any column width
    //    (`make`); text longer than half a page is cut first, at the narrowest width it could land in.
    const entries = (c && activitySectionShown(design, "diagrams") ? c.diagrams : []).filter(
      (entry) => aspectOf(entry.diagram) !== null, // a court this build does not know is left out, as everywhere
    );
    const figureMaxHeight = compact ? METRICS.figureMaxHeightCompact : METRICS.figureMaxHeight;
    const wide = inner >= BESIDE_MIN_MM;
    const rightW = wide
      ? Math.min(METRICS.figureMaxWidth, Math.max(METRICS.figureMinWidth, inner * 0.42))
      : 0;
    const leftW = wide ? inner - rightW - geo.gapMm : inner;
    const narrowest = wide ? Math.min(leftW, rightW) : inner;
    const maxPiece = geo.bodyHeightMm * pieceFactor;

    interface Item {
      side: "L" | "R" | null;
      make: (width: number) => BandBlock;
      /** The piece of the same list that comes right before this one: this piece must read AFTER it. */
      follows?: Item;
    }
    const items: Item[] = [];

    const textBlocks = (
      kind: "objective" | "description" | "setup" | "organization",
      value: string,
    ) => {
      if (!value) return;
      splitParagraph(value, narrowest, ctx.body, maxPiece - METRICS.cellLabel).forEach((piece, i) =>
        items.push({
          side: "L",
          make: (w) => ({
            b: "text",
            label: kind,
            text: piece,
            continued: i > 0,
            heightMm: METRICS.cellLabel + textHeight(piece, w, ctx.body),
          }),
        }),
      );
    };
    const equipment =
      c && design.sections.equipment
        ? c.equipment.map((e) => resolveEquipment(e, a.players ?? sessionPlayers))
        : [];
    const equipmentLine = equipment.map(equipmentText).join(", ");
    const setup = c ? (compact ? shorten(c.setup, 200) : c.setup.trim()) : "";

    if (!compact && c)
      textBlocks(c.objective ? "objective" : "description", (c.objective || c.description).trim());
    if (compact && c && !c.objective) textBlocks("description", c.description.trim());
    if (equipment.length > 0)
      items.push({
        side: "L",
        make: (w) => ({
          b: "equipment",
          items: equipment,
          heightMm: METRICS.cellLabel + textHeight(equipmentLine, w, ctx.body),
        }),
      });
    textBlocks("setup", setup);
    if (!compact && c) textBlocks("organization", c.organization.trim());

    // the diagrams: the first is pinned top right; more (detailed mode) go wherever there is room. On two columns the
    // first is queued FIRST, so it is always in the opening band, beside the text and under the activity's heading
    // even when the text is long enough to fill several bands.
    (compact ? entries.slice(0, 1) : entries).forEach((entry, i) => {
      const item: Item = {
        side: i === 0 && wide ? "R" : null,
        make: (w) => {
          const figure = sizeFigure(entry, Math.min(w, METRICS.figureMaxWidth), figureMaxHeight)!;
          return { b: "figure", figure, heightMm: figure.heightMm + figure.captionMm };
        },
      };
      if (i === 0 && wide) items.unshift(item);
      else items.push(item);
    });

    // the write-up: lists and paragraphs, each cut to at most half a page
    const specs: CellSpec[] = [];
    const list = (key: CellKey, listItems: string[], ordered = false) => {
      if (listItems.length > 0)
        specs.push({ key, ordered, start: 1, text: null, items: listItems, continued: false });
    };
    const para = (key: CellKey, text: string) => {
      if (text.trim())
        specs.push({
          key,
          ordered: false,
          start: 1,
          text: text.trim(),
          items: [],
          continued: false,
        });
    };
    if (c) {
      if (activitySectionShown(design, "instructions")) list("instructions", c.instructions, true);
      if (activitySectionShown(design, "coachingPoints"))
        list("coachingPoints", compact ? c.coachingPoints.slice(0, 3) : c.coachingPoints);
      if (activitySectionShown(design, "commonMistakes")) list("commonMistakes", c.commonMistakes);
      if (activitySectionShown(design, "safety")) para("safety", c.safety);
      if (activitySectionShown(design, "progressions")) list("progressions", c.progressions);
      if (activitySectionShown(design, "regressions")) list("regressions", c.regressions);
      if (activitySectionShown(design, "variations")) list("variations", c.variations);
    }
    if (!compact && design.sections.coachNotes) para("notes", a.notes);
    let previous: Item | undefined;
    for (const piece of specs.flatMap((sp) => chunkCell(sp, narrowest, ctx, maxPiece))) {
      const item: Item = {
        side: null,
        make: (w) => {
          const cell: Cell = { ...piece, heightMm: cellHeight(piece, w, ctx) };
          return { b: "cell", cell, heightMm: cell.heightMm };
        },
        follows: piece.continued ? previous : undefined,
      };
      items.push(item);
      previous = item;
    }

    // -- lay the blocks out
    if (!wide) {
      // one column: every block is a piece of its own, so a very long activity can break between any two
      for (const item of items) {
        const block = item.make(inner);
        push({ t: "band", leftMm: inner, rightMm: 0, left: [block], right: [] }, block.heightMm);
      }
    } else {
      // two columns, balanced: blocks that belong on the left go left, the diagram goes top right, and every other
      // block joins whichever column would end up shorter. A band is closed once it reaches its share of a page, so
      // an activity longer than a page has somewhere to break.
      const maxBand = geo.bodyHeightMm * bandFactor;
      interface Column {
        width: number;
        blocks: BandBlock[];
        makers: Item[];
        height: number;
      }
      const fresh = (width: number): Column => ({ width, blocks: [], makers: [], height: 0 });
      // where each item was placed, and in which band: a continued piece may not go LEFT of the piece before it
      // when that one is on the right of the same band (the column on the left is read first)
      const placed = new Map<Item, { side: "L" | "R"; band: number }>();
      let band = 0;
      let left = fresh(leftW);
      let right = fresh(rightW);
      const grown = (col: Column, block: BandBlock) =>
        col.height + (col.blocks.length > 0 ? geo.gapMm : 0) + block.heightMm;
      const close = () => {
        if (left.blocks.length === 0 && right.blocks.length === 0) return;
        if (right.blocks.length === 0) {
          // nothing on the right: use the whole width
          const blocks = left.makers.map((m) => m.make(inner));
          const height =
            blocks.reduce((sum, blk) => sum + blk.heightMm, 0) + (blocks.length - 1) * geo.gapMm;
          push({ t: "band", leftMm: inner, rightMm: 0, left: blocks, right: [] }, height);
        } else {
          push(
            { t: "band", leftMm: leftW, rightMm: rightW, left: left.blocks, right: right.blocks },
            Math.max(left.height, right.height),
          );
        }
        left = fresh(leftW);
        right = fresh(rightW);
        band += 1;
      };
      const choose = (item: Item) => {
        const onLeft = item.make(leftW);
        const onRight = item.make(rightW);
        const hl = grown(left, onLeft);
        const hr = grown(right, onRight);
        const before = item.follows ? placed.get(item.follows) : undefined;
        const mustBeRight = before?.band === band && before.side === "R";
        const useLeft = !mustBeRight && (item.side === "L" || (item.side === null && hl <= hr));
        return useLeft
          ? { col: left, block: onLeft, height: hl, other: right.height }
          : { col: right, block: onRight, height: hr, other: left.height };
      };
      for (const item of items) {
        let pick = choose(item);
        const started = left.blocks.length + right.blocks.length > 0;
        if (started && Math.max(pick.height, pick.other) > maxBand) {
          close();
          pick = choose(item);
        }
        pick.col.blocks.push(pick.block);
        pick.col.makers.push(item);
        pick.col.height = pick.height;
        placed.set(item, { side: pick.col === left ? "L" : "R", band });
      }
      close();
    }

    // an activity with nothing to say beyond its header still has its header
    if (units.length === 0) push({ t: "band", leftMm: inner, rightMm: 0, left: [], right: [] }, 0);
    return units;
  };

  const headFirst = METRICS.actBorder + headBlock + METRICS.actBodyPad;
  const tail = METRICS.actBodyPad + METRICS.actBorder;
  const heightOf = (us: Unit[]) =>
    headFirst +
    us.reduce((sum, u) => sum + u.heightMm, 0) +
    Math.max(0, us.length - 1) * geo.gapMm +
    tail;
  let units = arrange(0.5, 0.62);
  if (heightOf(units) > geo.bodyHeightMm) units = arrange(0.25, 0.3);

  return {
    id: `activity-${a.id}`,
    kind: "activity",
    activity: head,
    headMm: {
      first: headFirst,
      continued: METRICS.actBorder + continuedBlock + METRICS.actBodyPad,
    },
    tailMm: tail,
    unitGap: geo.gapMm,
    keepTogether: true,
    lead: 1,
    units,
  };
}

// ---- notes and reflection -----------------------------------------------------------------------

function notesGroup(notes: string, ctx: Ctx): Group | null {
  const text = notes.trim();
  if (!text) return null;
  const width = ctx.geo.bodyWidthMm;
  const pieces = splitParagraph(text, width, ctx.body, ctx.geo.bodyHeightMm * 0.5);
  const units: Unit[] = pieces.map((p) => ({
    row: { t: "text", text: p },
    heightMm: textHeight(p, width, ctx.body),
  }));
  return sectionGroup("notes", "notes", ctx, units, {
    keepTogether: true,
    lead: 1,
    unitGap: ctx.geo.gapMm,
  });
}

const REFLECTION_PROMPTS: ReadonlyArray<keyof Reflection> = [
  "wentWell",
  "needsImprovement",
  "nextFocus",
  "notes",
];
const REFLECTION_PADDING = 4.8;

function reflectionGroup(reflection: Reflection, ctx: Ctx): Group {
  const { geo } = ctx;
  const available = geo.bodyHeightMm - sectionHead(geo);
  const perPrompt =
    (available - (REFLECTION_PROMPTS.length - 1) * geo.gapMm) / REFLECTION_PROMPTS.length;
  const blank = Math.max(
    METRICS.reflectionMinBox,
    Math.min(METRICS.reflectionMaxBox, perPrompt - METRICS.reflectionLabel),
  );
  const units: Unit[] = REFLECTION_PROMPTS.map((prompt) => {
    const text = reflection[prompt].trim();
    const box = text
      ? Math.max(
          blank,
          textHeight(text, geo.bodyWidthMm - REFLECTION_PADDING, ctx.body) + REFLECTION_PADDING,
        )
      : blank;
    return {
      row: { t: "reflection", prompt, label: ctx.design.prompts[prompt], text, boxMm: round(box) },
      heightMm: METRICS.reflectionLabel + box,
    };
  });
  return sectionGroup("reflection", "reflection", ctx, units, {
    keepTogether: true,
    lead: 1,
    unitGap: geo.gapMm,
  });
}

// ---- the whole document -------------------------------------------------------------------------

const CELL_SECTION: Record<CellKey, SectionId> = {
  instructions: "instructions",
  coachingPoints: "coachingPoints",
  commonMistakes: "commonMistakes",
  safety: "safety",
  progressions: "progressions",
  regressions: "regressions",
  variations: "variations",
  notes: "coachNotes",
};

/**
 * The session's own club and coach win; the design's branding (from a template, say) only fills what the session
 * leaves empty. Nothing is ever written back into the session.
 */
export function withBranding(
  input: SessionDocumentInput,
  design: DocumentDesign,
): SessionDocumentInput {
  const clubName = input.clubName.trim() || design.branding.clubName.trim();
  const coachName = input.coachName.trim() || design.branding.coachName.trim();
  return clubName === input.clubName && coachName === input.coachName
    ? input
    : { ...input, clubName, coachName };
}

export function buildDocumentModel(
  rawInput: SessionDocumentInput,
  design: DocumentDesign,
  reflection: Reflection = emptyReflection(),
): DocumentModel {
  const input = withBranding(rawInput, design);
  const geo = pageGeometry(design);
  const ctx = makeCtx(design, geo);
  const on = design.sections;
  const present = new Set<SectionId>();

  const cover = on.cover;
  const overviewKeys = cover
    ? OVERVIEW_ORDER.filter(
        (k) =>
          !COVER_FACTS.includes(k) && k !== "title" && !(k === "club" && input.clubName.trim()),
      )
    : OVERVIEW_ORDER;

  // front matter (full width)
  const front: Group[] = [];
  if (on.overview) {
    const g = overviewGroup(buildFacts(input, overviewKeys), ctx);
    if (g) front.push(g);
  }
  if (on.objectives) {
    const g = objectivesGroup(input, ctx);
    if (g) front.push(g);
  }
  if (on.equipment) {
    const g = equipmentGroup(collectEquipment(input.activities, input.players), ctx);
    if (g) front.push(g);
  }
  if (on.timeline) {
    const g = timelineGroup(input.activities, ctx);
    if (g) front.push(g);
  }

  // the activities, in the design's columns
  const numbers = numbering(input.activities);
  const activities = input.activities.map((a, i) =>
    activityGroup(a, numbers[i]!, input.players, ctx),
  );

  // closing
  const closing: Group[] = [];
  if (on.coachNotes) {
    const g = notesGroup(input.coachNotes, ctx);
    if (g) closing.push(g);
  }
  if (on.reflection) closing.push(reflectionGroup(reflection, ctx));

  const segments: Segment[] = [
    { groups: front, columns: 1, newPage: true },
    { groups: activities, columns: geo.columns, newPage: true },
    { groups: closing, columns: 1, newPage: false },
  ];
  const body = paginate(segments, geo);

  // ---- assemble pages
  const pages: DocumentPage[] = [];
  const clubName = input.clubName.trim();
  if (cover) {
    present.add("cover");
    pages.push({
      number: 1,
      kind: "cover",
      cover: {
        title: input.title,
        facts: buildFacts(input, COVER_FACTS),
        primaryObjective: input.objectives.primary,
        secondaryObjectives: input.objectives.secondary,
        clubName,
        logo: design.logo,
      },
    });
  }
  for (const page of body) {
    pages.push({
      number: pages.length + 1,
      kind: "body",
      columns: page.columns,
      fragments: page.fragments,
      usedMm: page.usedMm,
    });
    for (const f of page.fragments) {
      if (f.kind === "overview") present.add("overview");
      else if (f.kind === "objectives") present.add("objectives");
      else if (f.kind === "equipment") present.add("equipment");
      else if (f.kind === "timeline") present.add("timeline");
      else if (f.kind === "notes") present.add("coachNotes");
      else if (f.kind === "reflection") present.add("reflection");
      for (const u of f.units) {
        if (u.row.t !== "band") continue;
        for (const block of [...u.row.left, ...u.row.right]) {
          if (block.b === "cell") present.add(CELL_SECTION[block.cell.key]);
          else if (block.b === "figure") present.add("diagrams");
          else if (block.b === "equipment") present.add("equipment");
        }
      }
    }
  }

  return {
    schemaVersion: 1,
    design,
    geometry: geo,
    title: input.title,
    header: {
      style: design.header.style,
      brand: "CoachOS",
      clubName,
      title: input.title,
      logo: design.logo,
    },
    footer: {
      coachName: input.coachName.trim(),
      date: input.scheduledDate,
      text: design.footer.text.trim(),
    },
    pages,
    pageCount: pages.length,
    sections: SECTION_ORDER.filter((s) => present.has(s)),
  };
}

const SECTION_ORDER: readonly SectionId[] = [
  "cover",
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
  "reflection",
];
