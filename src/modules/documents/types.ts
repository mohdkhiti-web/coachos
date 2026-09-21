import type { Diagram } from "@/engines/diagram";
import type { DocumentDesign, HeaderStyle, Reflection, SectionId } from "./design";
import type { PageGeometry } from "./layout";

/**
 * The document model (ARCHITECTURE.md §13.1): "what goes on the page", decided once, in a pure function
 * (`buildDocumentModel`). The React page components draw it for the screen preview AND for browser print, and
 * the PDF renderer of a later step draws the very same thing — there is no second layout.
 *
 * INPUT is deliberately not the plans module's DTO: the documents module knows nothing about how a session is
 * stored. `toDocumentInput` (in the plans module) maps a session onto this shape.
 * OUTPUT carries raw values and semantic keys — never translated text or locale-formatted dates — so one model
 * serves every language; the renderer translates and formats.
 */

// ---- input -----------------------------------------------------------------------------------

export interface DocumentEquipmentInput {
  key: string;
  name: string;
  rule: "fixed" | "per_player" | "per_pair";
  quantity: number;
}

/** Everything an activity can print, whichever kind it is (a coach-written activity fills only some of it). */
export interface DocumentActivityContent {
  /** A drill's objective. */
  objective: string;
  /** A coach-written activity's description. */
  description: string;
  setup: string;
  organization: string;
  instructions: string[];
  coachingPoints: string[];
  commonMistakes: string[];
  safety: string;
  progressions: string[];
  regressions: string[];
  variations: string[];
  equipment: DocumentEquipmentInput[];
  diagrams: Array<{ title: string; diagram: Diagram }>;
  format: string | null;
  intensity: "low" | "medium" | "high" | null;
  playersRange: { min: number; max: number } | null;
}

export interface DocumentActivityInput {
  id: string;
  kind: "drill" | "custom" | "break";
  title: string;
  phase: string | null;
  durationMin: number;
  /** Minutes from the start of the session: the SAME calculation the builder shows (`buildTimeline`). */
  startMin: number;
  endMin: number;
  players: number | null;
  repetitions: number | null;
  /** The coach's own notes on this activity. */
  notes: string;
  content: DocumentActivityContent | null;
}

export interface SessionDocumentInput {
  title: string;
  teamName: string | null;
  ageGroup: string | null;
  ageRange: { min: number; max: number } | null;
  level: "beginner" | "intermediate" | "advanced" | null;
  players: number | null;
  /** The one-sentence "what this session is about". */
  goal: string;
  /** Local wall-clock values, exactly as stored / computed (see schedule.ts). */
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  endsNextDay: boolean;
  totalMinutes: number;
  location: string;
  season: string;
  sessionNumber: number | null;
  coachName: string;
  clubName: string;
  coachNotes: string;
  objectives: { primary: string | null; secondary: string[] };
  activities: DocumentActivityInput[];
}

// ---- output: facts, figures, rows ---------------------------------------------------------------

export type FactKey =
  | "title"
  | "team"
  | "ageGroup"
  | "level"
  | "players"
  | "coach"
  | "club"
  | "season"
  | "sessionNumber"
  | "date"
  | "startTime"
  | "endTime"
  | "duration"
  | "location";

export type FactValue =
  | { t: "text"; text: string }
  | { t: "number"; n: number }
  | { t: "date"; iso: string }
  | { t: "time"; hm: string; nextDay: boolean }
  | { t: "minutes"; n: number }
  | { t: "level"; level: "beginner" | "intermediate" | "advanced" };

export interface Fact {
  key: FactKey;
  value: FactValue;
}

/** A diagram at the size it is drawn on the page (millimetres), so the renderer never has to guess. */
export interface Figure {
  /** Caption; empty means none (and no caption space). */
  title: string;
  diagram: Diagram;
  widthMm: number;
  /** The drawing only. */
  heightMm: number;
  /** Space the caption takes below it (0 when there is none). */
  captionMm: number;
}

export type CellKey =
  | "instructions"
  | "coachingPoints"
  | "commonMistakes"
  | "safety"
  | "progressions"
  | "regressions"
  | "variations"
  | "notes";

export interface Cell {
  key: CellKey;
  /** A paragraph (safety, notes) or a list. */
  text: string | null;
  items: string[];
  ordered: boolean;
  /** Number of the first item (a list continued on a later page keeps counting). */
  start: number;
  /** The second and later pieces of a cell too long for one page. */
  continued: boolean;
  heightMm: number;
}

export interface EquipmentItem {
  name: string;
  quantity: number;
  /** "player" / "pair": `quantity` is per player / per pair (the session's player count was not known). */
  per: "player" | "pair" | null;
}

export interface TimelineRow {
  /** 1, 2, 3… for drills and custom activities; null for a break. */
  number: number | null;
  kind: "drill" | "custom" | "break";
  title: string;
  phase: string | null;
  startMin: number;
  endMin: number;
  durationMin: number;
}

export interface ActivityHead {
  number: number | null;
  /** A narrow column: the time sits under the title instead of beside it. */
  narrow: boolean;
  kind: "drill" | "custom" | "break";
  title: string;
  phase: string | null;
  startMin: number;
  endMin: number;
  durationMin: number;
  playersMin: number | null;
  playersMax: number | null;
  format: string | null;
  intensity: "low" | "medium" | "high" | null;
  repetitions: number | null;
}

/** A labelled part of an activity, placed in one column of a band (see `Row`). */
export type BandBlock =
  | {
      b: "text";
      label: "objective" | "description" | "setup" | "organization";
      text: string;
      /** A later piece of text that was too long for one page (its label says so). */
      continued: boolean;
      heightMm: number;
    }
  | { b: "equipment"; items: EquipmentItem[]; heightMm: number }
  | { b: "cell"; cell: Cell; heightMm: number }
  | { b: "figure"; figure: Figure; heightMm: number };

/** One indivisible piece of a group: the paginator places these whole and only ever breaks BETWEEN them. */
export type Row =
  | { t: "facts"; facts: Fact[]; across: number }
  | { t: "objectives"; primary: string | null; secondary: string[]; goal: string }
  | { t: "equipment"; items: EquipmentItem[]; across: number }
  | { t: "timeline"; row: TimelineRow }
  /**
   * The body of an activity: its blocks in two balanced columns (diagram top right), or in one column when the
   * page is too narrow for two. `rightMm` is 0 for a single column.
   */
  | { t: "band"; leftMm: number; rightMm: number; left: BandBlock[]; right: BandBlock[] }
  | { t: "break"; row: TimelineRow }
  | { t: "text"; text: string }
  | {
      t: "reflection";
      prompt: keyof Reflection;
      /** The design's own wording for this prompt; "" = the built-in one. */
      label: string;
      text: string;
      boxMm: number;
    };

export interface Unit {
  row: Row;
  /** Estimated height in millimetres, including the row's own padding. */
  heightMm: number;
}

export type GroupKind =
  | "overview"
  | "objectives"
  | "equipment"
  | "timeline"
  | "activity"
  | "break"
  | "notes"
  | "reflection";

export interface Group {
  id: string;
  kind: GroupKind;
  /** Present for an activity (its numbered header). */
  activity: ActivityHead | null;
  /**
   * Height of everything above the first piece on a page (the heading, plus the frame's top edge and padding),
   * the first time and when the group continues on a later page. Includes the space below the heading.
   */
  headMm: { first: number; continued: number };
  /** Space below the last piece on a page (the frame's bottom padding and border). */
  tailMm: number;
  /** Space between two pieces (0 for the rows of a table). */
  unitGap: number;
  /** Move the whole group to the next page/column rather than split it, when it fits on one. */
  keepTogether: boolean;
  /** Pieces that must share a page with the heading (never leave a heading alone at the bottom). */
  lead: number;
  units: Unit[];
}

// ---- output: pages ------------------------------------------------------------------------------

export interface Fragment {
  groupId: string;
  kind: GroupKind;
  activity: ActivityHead | null;
  /** True when this is not the first piece of its group: the heading says "continued". */
  continued: boolean;
  /** Which column of the page (0, or 0/1 in a two-column layout). */
  column: number;
  units: Unit[];
  /** Estimated height including the heading. */
  heightMm: number;
}

export interface CoverContent {
  title: string;
  facts: Fact[];
  primaryObjective: string | null;
  secondaryObjectives: string[];
  clubName: string;
  logo: LogoRef | null;
}

export type DocumentPage =
  | { number: number; kind: "cover"; cover: CoverContent }
  | {
      number: number;
      kind: "body";
      columns: 1 | 2;
      fragments: Fragment[];
      /** Estimated used height per column, for the model's own tests and the e2e overflow check. */
      usedMm: number[];
    };

export interface LogoRef {
  assetId: string;
}

export interface DocumentModel {
  schemaVersion: 1;
  design: DocumentDesign;
  geometry: PageGeometry;
  title: string;
  header: {
    style: HeaderStyle;
    brand: "CoachOS";
    clubName: string;
    title: string;
    logo: LogoRef | null;
  };
  footer: { coachName: string; date: string | null; text: string };
  pages: DocumentPage[];
  pageCount: number;
  /** The sections that actually appear (a switched-on section with nothing to say is left out). */
  sections: SectionId[];
}
