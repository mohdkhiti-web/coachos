import {
  DESIGN_VERSION,
  type BorderStyle,
  type DesignColors,
  type DesignOverride,
  type DividerStyle,
  type DocumentDesign,
  type FontFamily,
  type HeaderStyle,
  type PresetId,
  type Spacing,
} from "./design";

/**
 * Built-in presets. A preset controls how the document LOOKS — colours, typeface, header, border, divider and
 * the density of the spacing — and nothing about WHAT it contains: sections, compact/detailed, paper and margins
 * stay exactly as the coach set them. Every preset keeps body text at (or near) 7:1 contrast on its page, which
 * the tests assert. Serious, not decorative: even "Youth" is clean, only warmer and roomier.
 */

export interface PresetStyle {
  colors: DesignColors;
  family: FontFamily;
  header: HeaderStyle;
  border: BorderStyle;
  divider: DividerStyle;
  spacing: Spacing;
}

export const PRESETS: Readonly<Record<PresetId, PresetStyle>> = {
  classic: {
    colors: {
      primary: "#1f3a5f",
      secondary: "#5b6b7c",
      accent: "#c2410c",
      text: "#1a1a1a",
      background: "#ffffff",
    },
    family: "source-sans",
    header: "line",
    border: "none",
    divider: "thin",
    spacing: "normal",
  },
  modern: {
    colors: {
      primary: "#ea580c",
      secondary: "#1f2937",
      accent: "#2563eb",
      text: "#111827",
      background: "#ffffff",
    },
    family: "inter",
    header: "band",
    border: "none",
    divider: "accent",
    spacing: "normal",
  },
  minimal: {
    colors: {
      primary: "#262626",
      secondary: "#6b7280",
      accent: "#262626",
      text: "#1f1f1f",
      background: "#ffffff",
    },
    family: "inter",
    header: "minimal",
    border: "none",
    divider: "thin",
    spacing: "spacious",
  },
  professional: {
    colors: {
      primary: "#0f766e",
      secondary: "#334155",
      accent: "#b45309",
      text: "#0f172a",
      background: "#ffffff",
    },
    family: "source-sans",
    header: "line",
    border: "thin",
    divider: "thin",
    spacing: "normal",
  },
  dark: {
    colors: {
      primary: "#f59e0b",
      secondary: "#94a3b8",
      accent: "#38bdf8",
      text: "#e5e7eb",
      background: "#0f172a",
    },
    family: "inter",
    header: "band",
    border: "none",
    divider: "thin",
    spacing: "normal",
  },
  school: {
    colors: {
      primary: "#7f1d1d",
      secondary: "#92400e",
      accent: "#b45309",
      text: "#1f2937",
      background: "#fffdf5",
    },
    family: "merriweather",
    header: "line",
    border: "thin",
    divider: "dotted",
    spacing: "normal",
  },
  academy: {
    colors: {
      primary: "#0b3d91",
      secondary: "#8a6d0b",
      accent: "#a16207",
      text: "#0b1f3a",
      background: "#ffffff",
    },
    family: "merriweather",
    header: "band",
    border: "frame",
    divider: "accent",
    spacing: "normal",
  },
  youth: {
    colors: {
      primary: "#0077b6",
      secondary: "#2a7f76",
      accent: "#c2570a",
      text: "#14213d",
      background: "#ffffff",
    },
    family: "inter",
    header: "band",
    border: "none",
    divider: "accent",
    spacing: "spacious",
  },
};

/** What a brand-new document looks like apart from the preset: A4 portrait, one column, full detail. */
const BASE: Omit<DocumentDesign, "colors" | "typography" | "header" | "frame"> = {
  schemaVersion: DESIGN_VERSION,
  page: {
    paper: "a4",
    orientation: "portrait",
    margins: "normal",
    columns: 1,
    spacing: "normal",
  },
  mode: "detailed",
  sections: {
    cover: false,
    overview: true,
    objectives: true,
    equipment: true,
    timeline: true,
    diagrams: true,
    instructions: true,
    coachingPoints: true,
    commonMistakes: true,
    safety: true,
    progressions: true,
    regressions: true,
    variations: true,
    coachNotes: true,
    reflection: false,
  },
  footer: { text: "" },
  logo: null,
};

export const DEFAULT_PRESET: PresetId = "classic";

/** The complete design a preset gives on its own. */
export function presetDesign(id: PresetId): DocumentDesign {
  const p = PRESETS[id];
  return {
    ...BASE,
    page: { ...BASE.page, spacing: p.spacing },
    colors: { ...p.colors },
    typography: { family: p.family },
    header: { style: p.header },
    frame: { border: p.border, divider: p.divider },
  };
}

/** Assign only the values an override actually carries (a `partial()` may hold explicit `undefined`s). */
function defined<T extends object>(o: T | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function applyOverride(base: DocumentDesign, o: DesignOverride | null | undefined): DocumentDesign {
  if (!o) return base;
  return {
    ...base,
    colors: { ...base.colors, ...defined(o.colors) },
    typography: { ...base.typography, ...defined(o.typography) },
    page: { ...base.page, ...defined(o.page) },
    mode: o.mode ?? base.mode,
    sections: { ...base.sections, ...defined(o.sections) },
    header: { ...base.header, ...defined(o.header) },
    frame: { ...base.frame, ...defined(o.frame) },
    footer: { ...base.footer, ...defined(o.footer) },
    logo: o.logo === undefined ? base.logo : o.logo,
  };
}

/**
 * Precedence: Preset → Template → Session override; each layer changes only what it names. `template` has no
 * source yet (saved templates are a later step) but the order is fixed now so nothing changes when it appears.
 */
export function resolveDesign(layers: {
  preset: PresetId;
  template?: DesignOverride | null;
  override?: DesignOverride | null;
}): DocumentDesign {
  return applyOverride(
    applyOverride(presetDesign(layers.preset), layers.template),
    layers.override,
  );
}

/** Switch look: the preset's style replaces colours, type, header, frame and spacing; content and page choices stay. */
export function applyPreset(design: DocumentDesign, id: PresetId): DocumentDesign {
  const p = presetDesign(id);
  return {
    ...design,
    colors: p.colors,
    typography: p.typography,
    header: p.header,
    frame: p.frame,
    page: { ...design.page, spacing: p.page.spacing },
  };
}

const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

function diffGroup<T extends object>(base: T, next: T): Partial<T> | undefined {
  const out: Partial<T> = {};
  for (const k of Object.keys(next) as Array<keyof T>) {
    if (differs(base[k], next[k])) out[k] = next[k];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The smallest override that turns `base` into `design`. What is stored with a session is this, not the whole
 * design, so "the coach changed the accent colour and switched to Letter" stays exactly that.
 */
export function diffDesign(base: DocumentDesign, design: DocumentDesign): DesignOverride {
  const out: DesignOverride = {};
  const colors = diffGroup(base.colors, design.colors);
  if (colors) out.colors = colors;
  const typography = diffGroup(base.typography, design.typography);
  if (typography) out.typography = typography;
  const page = diffGroup(base.page, design.page);
  if (page) out.page = page;
  if (base.mode !== design.mode) out.mode = design.mode;
  const sections = diffGroup(base.sections, design.sections);
  if (sections) out.sections = sections;
  const header = diffGroup(base.header, design.header);
  if (header) out.header = header;
  const frame = diffGroup(base.frame, design.frame);
  if (frame) out.frame = frame;
  const footer = diffGroup(base.footer, design.footer);
  if (footer) out.footer = footer;
  if (differs(base.logo, design.logo)) out.logo = design.logo;
  return out;
}
