import type { DocumentDesign, FontFamily, MarginSize, Paper, Spacing } from "./design";
import { deriveTokens } from "./design";

/**
 * The geometry of a page and the measurements of everything on it, in ONE place. The paginator estimates the
 * height of every piece from these numbers and the stylesheet draws the pieces from the very same numbers
 * (they are handed to CSS as custom properties by `designCssVars`), so what the model believes about a page
 * and what the browser lays out cannot drift apart. All lengths are millimetres unless a name says `Pt`.
 */

export const MM_PER_PT = 25.4 / 72;

export const PAPER_MM: Readonly<Record<Paper, { w: number; h: number }>> = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
};

export const MARGIN_MM: Readonly<Record<MarginSize, number>> = {
  narrow: 12,
  normal: 18,
  wide: 24,
};

/** `gap` separates pieces on a page; `lineHeight` is the multiplier for running text. */
export const SPACING_METRICS: Readonly<Record<Spacing, { gap: number; lineHeight: number }>> = {
  compact: { gap: 2.4, lineHeight: 1.32 },
  normal: { gap: 3.4, lineHeight: 1.42 },
  spacious: { gap: 4.6, lineHeight: 1.55 },
};

export const HEADER_MM = 10;
export const FOOTER_MM = 9;
export const COLUMN_GAP_MM = 6;

export const TYPE_PT = {
  body: 9.5,
  small: 8.5,
  label: 7.2,
  section: 12,
  activity: 12.5,
  fact: 10.5,
  coverTitle: 30,
  coverSub: 13,
} as const;

/** Fixed measurements of the parts (see document.css). */
export const METRICS = {
  /** the coloured bar above a group of pieces ("Session overview") */
  sectionHead: 8,
  /** padding inside an activity's header / body */
  actHeadPad: 2.2,
  actBodyPad: 2.6,
  actBorder: 0.5,
  /** small caps label above a cell ("Coaching points") */
  cellLabel: 4.6,
  itemGap: 0.9,
  listIndent: 5,
  /** timeline table */
  tableHead: 7,
  tableRowPad: 1.7,
  tableTimeCol: 30,
  tablePhaseCol: 40,
  tableDurationCol: 24,
  /** the break strip between activities */
  breakStrip: 8,
  /** a fact (label over value) */
  factLabel: 3.8,
  /** reflection */
  reflectionMinBox: 22,
  reflectionMaxBox: 34,
  reflectionLabel: 5,
  figureCaption: 4.6,
  figureMaxHeight: 78,
  /** Compact mode keeps the diagram smaller, so two activities share a page. */
  figureMaxHeightCompact: 58,
  figureMaxWidth: 88,
  figureMinWidth: 46,
} as const;

/**
 * Average glyph width as a share of the font size, per family, measured on running English text WITH its spaces
 * and rounded UP: an estimate that is a little long only leaves a little white space, one that is short would
 * clip. e2e/document.spec.ts checks every estimated height against the browser's real one.
 */
export const CHAR_EM: Readonly<Record<FontFamily, number>> = {
  inter: 0.56,
  "source-sans": 0.51,
  merriweather: 0.6,
  system: 0.555,
};

export interface PageGeometry {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  headerMm: number;
  footerMm: number;
  /** Width of the area inside the margins. */
  bodyWidthMm: number;
  /** Height between the running header and footer. */
  bodyHeightMm: number;
  /** A cover page has no running header or footer, so its body is taller. */
  coverHeightMm: number;
  columns: 1 | 2;
  /** Width of ONE column: the whole body for a single column, half of it (less the gutter) for two. */
  columnWidthMm: number;
  columnGapMm: number;
  /** Between pieces inside a group. */
  gapMm: number;
  /** Between groups (a section and the next). */
  groupGapMm: number;
  /** Between the lines of a small stack (a label over its text). */
  stackGapMm: number;
  lineHeight: number;
}

export function pageGeometry(design: DocumentDesign): PageGeometry {
  const paper = PAPER_MM[design.page.paper];
  const landscape = design.page.orientation === "landscape";
  const widthMm = landscape ? paper.h : paper.w;
  const heightMm = landscape ? paper.w : paper.h;
  const marginMm = MARGIN_MM[design.page.margins];
  const headerMm = design.header.style === "none" ? 0 : HEADER_MM;
  const bodyWidthMm = round(widthMm - 2 * marginMm);
  const columns = design.page.columns;
  const { gap, lineHeight } = SPACING_METRICS[design.page.spacing];
  return {
    widthMm,
    heightMm,
    marginMm,
    headerMm,
    footerMm: FOOTER_MM,
    bodyWidthMm,
    bodyHeightMm: round(heightMm - 2 * marginMm - headerMm - FOOTER_MM),
    coverHeightMm: round(heightMm - 2 * marginMm),
    columns,
    columnWidthMm: round(columns === 1 ? bodyWidthMm : (bodyWidthMm - COLUMN_GAP_MM) / 2),
    columnGapMm: COLUMN_GAP_MM,
    gapMm: gap,
    groupGapMm: round(gap * 1.6),
    stackGapMm: round(gap * 0.7),
    lineHeight,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const FONT_STACKS: Readonly<Record<FontFamily, string>> = {
  inter: 'var(--font-doc-inter), "Segoe UI", system-ui, sans-serif',
  "source-sans": 'var(--font-doc-source), "Segoe UI", system-ui, sans-serif',
  merriweather: 'var(--font-doc-serif), Georgia, "Times New Roman", serif',
  system: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const mm = (n: number) => `${round(n)}mm`;
const pt = (n: number) => `${n}pt`;

/** Every value the stylesheet needs, as CSS custom properties: colours, fonts, page geometry and part sizes. */
export function designCssVars(
  design: DocumentDesign,
  geometry: PageGeometry = pageGeometry(design),
): Record<string, string> {
  const t = deriveTokens(design.colors);
  return {
    "--d-bg": t.background,
    "--d-text": t.text,
    "--d-primary": t.primary,
    "--d-secondary": t.secondary,
    "--d-accent": t.accent,
    "--d-primary-ink": t.primaryInk,
    "--d-secondary-ink": t.secondaryInk,
    "--d-accent-ink": t.accentInk,
    "--d-muted": t.muted,
    "--d-line": t.line,
    "--d-tint": t.tint,
    "--d-tint-strong": t.tintStrong,
    "--d-on-primary": t.onPrimary,
    "--d-on-secondary": t.onSecondary,
    "--d-on-accent": t.onAccent,
    "--d-font": FONT_STACKS[design.typography.family],
    "--d-page-w": mm(geometry.widthMm),
    "--d-page-h": mm(geometry.heightMm),
    "--d-margin": mm(geometry.marginMm),
    "--d-header-h": mm(geometry.headerMm),
    "--d-footer-h": mm(geometry.footerMm),
    "--d-body-w": mm(geometry.bodyWidthMm),
    "--d-body-h": mm(geometry.bodyHeightMm),
    "--d-cover-h": mm(geometry.coverHeightMm),
    "--d-col-w": mm(geometry.columnWidthMm),
    "--d-col-gap": mm(geometry.columnGapMm),
    "--d-gap": mm(geometry.gapMm),
    "--d-group-gap": mm(geometry.groupGapMm),
    "--d-stack-gap": mm(geometry.stackGapMm),
    "--d-lh": String(geometry.lineHeight),
    "--d-fs-body": pt(TYPE_PT.body),
    "--d-fs-small": pt(TYPE_PT.small),
    "--d-fs-label": pt(TYPE_PT.label),
    "--d-fs-section": pt(TYPE_PT.section),
    "--d-fs-activity": pt(TYPE_PT.activity),
    "--d-fs-fact": pt(TYPE_PT.fact),
    "--d-fs-cover-title": pt(TYPE_PT.coverTitle),
    "--d-fs-cover-sub": pt(TYPE_PT.coverSub),
    "--d-section-h": mm(METRICS.sectionHead),
    "--d-act-head-pad": mm(METRICS.actHeadPad),
    "--d-act-body-pad": mm(METRICS.actBodyPad),
    "--d-act-border": mm(METRICS.actBorder),
    "--d-cell-label-h": mm(METRICS.cellLabel),
    "--d-item-gap": mm(METRICS.itemGap),
    "--d-list-indent": mm(METRICS.listIndent),
    "--d-table-head-h": mm(METRICS.tableHead),
    "--d-table-row-pad": mm(METRICS.tableRowPad),
    "--d-table-time-w": mm(METRICS.tableTimeCol),
    "--d-table-phase-w": mm(METRICS.tablePhaseCol),
    "--d-table-dur-w": mm(METRICS.tableDurationCol),
    "--d-break-h": mm(METRICS.breakStrip),
    "--d-fact-label-h": mm(METRICS.factLabel),
    "--d-reflection-label-h": mm(METRICS.reflectionLabel),
    "--d-figure-caption-h": mm(METRICS.figureCaption),
  };
}
