import { z } from "zod";
import { contrastRatio, mix, normalizeHex, onColor, readableOn } from "./color";

/**
 * The look of a printed session, as data: colours, type, page, which sections appear and how much of each.
 * A DESIGN is parametrised configuration — never user HTML/CSS (ARCHITECTURE.md §13.3) — validated here and
 * versioned so a stored design keeps meaning what it meant when it was saved.
 *
 * Three layers, later ones win (`resolveDesign` in presets.ts):  Preset → Template → Session override.
 * Only the session override is stored today (`plans.document_settings`); templates arrive in a later step.
 *
 * Pure: shared by the server (which validates every save), the design form and the document model.
 * Error messages are i18n keys under `validation.*`.
 */

export const DESIGN_VERSION = 1 as const;

export const PAPERS = ["a4", "letter"] as const;
export const ORIENTATIONS = ["portrait", "landscape"] as const;
export const MARGINS = ["narrow", "normal", "wide"] as const;
export const SPACINGS = ["compact", "normal", "spacious"] as const;
export const MODES = ["compact", "detailed"] as const;
/** A small, self-hosted set (loaded by the document route's layout). "system" needs no font file at all. */
export const FONT_FAMILIES = ["inter", "source-sans", "merriweather", "system"] as const;
export const HEADER_STYLES = ["none", "minimal", "line", "band"] as const;
export const BORDER_STYLES = ["none", "thin", "frame"] as const;
export const DIVIDER_STYLES = ["none", "thin", "accent", "dotted"] as const;
export const PRESET_IDS = [
  "classic",
  "modern",
  "minimal",
  "professional",
  "dark",
  "school",
  "academy",
  "youth",
] as const;

/** The sections a coach can switch on and off, in the order they appear on the page. */
export const SECTION_IDS = [
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
] as const;

export type Paper = (typeof PAPERS)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type MarginSize = (typeof MARGINS)[number];
export type Spacing = (typeof SPACINGS)[number];
export type DocumentMode = (typeof MODES)[number];
export type FontFamily = (typeof FONT_FAMILIES)[number];
export type HeaderStyle = (typeof HEADER_STYLES)[number];
export type BorderStyle = (typeof BORDER_STYLES)[number];
export type DividerStyle = (typeof DIVIDER_STYLES)[number];
export type PresetId = (typeof PRESET_IDS)[number];
export type SectionId = (typeof SECTION_IDS)[number];

/** In Compact mode an activity leaves these out (the drill's full write-up is a Detailed-mode thing). */
export const DETAILED_ONLY_SECTIONS: readonly SectionId[] = [
  "instructions",
  "commonMistakes",
  "safety",
  "progressions",
  "regressions",
  "variations",
];

const hex = z
  .string()
  .refine((v) => normalizeHex(v) !== null, { error: "hex_invalid" })
  .transform((v) => normalizeHex(v)!);

const colorsSchema = z.strictObject({
  primary: hex,
  secondary: hex,
  accent: hex,
  text: hex,
  background: hex,
});

const pageSchema = z.strictObject({
  paper: z.enum(PAPERS),
  orientation: z.enum(ORIENTATIONS),
  margins: z.enum(MARGINS),
  columns: z.union([z.literal(1), z.literal(2)]),
  spacing: z.enum(SPACINGS),
});

const bool = z.boolean();
const sectionsSchema = z.strictObject({
  cover: bool,
  overview: bool,
  objectives: bool,
  equipment: bool,
  timeline: bool,
  diagrams: bool,
  instructions: bool,
  coachingPoints: bool,
  commonMistakes: bool,
  safety: bool,
  progressions: bool,
  regressions: bool,
  variations: bool,
  coachNotes: bool,
  reflection: bool,
});

export const FOOTER_TEXT_MAX = 120;
export const PROMPT_MAX = 60;

/**
 * Reusable branding: the club / school / academy and the coach a document falls back to when the SESSION does not
 * name its own. A template can carry these; applying it never writes into the session (session values always win).
 */
const brandingSchema = z.strictObject({
  clubName: z.string().trim().max(120, { error: "too_long" }),
  coachName: z.string().trim().max(80, { error: "too_long" }),
});

/** The wording of the four reflection prompts ("" = the built-in wording). Wording is structure; answers are not. */
const promptsSchema = z.strictObject({
  wentWell: z.string().trim().max(PROMPT_MAX, { error: "too_long" }),
  needsImprovement: z.string().trim().max(PROMPT_MAX, { error: "too_long" }),
  nextFocus: z.string().trim().max(PROMPT_MAX, { error: "too_long" }),
  notes: z.string().trim().max(PROMPT_MAX, { error: "too_long" }),
});

export const documentDesignSchema = z.strictObject({
  schemaVersion: z.literal(DESIGN_VERSION),
  colors: colorsSchema,
  typography: z.strictObject({ family: z.enum(FONT_FAMILIES) }),
  page: pageSchema,
  mode: z.enum(MODES),
  sections: sectionsSchema,
  header: z.strictObject({ style: z.enum(HEADER_STYLES) }),
  frame: z.strictObject({ border: z.enum(BORDER_STYLES), divider: z.enum(DIVIDER_STYLES) }),
  footer: z.strictObject({ text: z.string().trim().max(FOOTER_TEXT_MAX, { error: "too_long" }) }),
  branding: brandingSchema,
  prompts: promptsSchema,
  /**
   * A reference to a stored club/school logo. Uploading and storing one is a later step (small, validated
   * images in Postgres); the design and the document model already know how to carry the reference.
   */
  logo: z.strictObject({ assetId: z.uuid() }).nullable(),
});

export type DocumentDesign = z.output<typeof documentDesignSchema>;
export type DesignColors = DocumentDesign["colors"];

/** What a preset, a template or a session may override: any subset of the design, group by group. */
export const designOverrideSchema = z.strictObject({
  colors: colorsSchema.partial().optional(),
  typography: z
    .strictObject({ family: z.enum(FONT_FAMILIES) })
    .partial()
    .optional(),
  page: pageSchema.partial().optional(),
  mode: z.enum(MODES).optional(),
  sections: sectionsSchema.partial().optional(),
  header: z
    .strictObject({ style: z.enum(HEADER_STYLES) })
    .partial()
    .optional(),
  frame: z
    .strictObject({ border: z.enum(BORDER_STYLES), divider: z.enum(DIVIDER_STYLES) })
    .partial()
    .optional(),
  footer: z
    .strictObject({ text: z.string().trim().max(FOOTER_TEXT_MAX, { error: "too_long" }) })
    .partial()
    .optional(),
  branding: brandingSchema.partial().optional(),
  prompts: promptsSchema.partial().optional(),
  logo: z.strictObject({ assetId: z.uuid() }).nullable().optional(),
});

export type DesignOverride = z.output<typeof designOverrideSchema>;

// ---- the coach's own words on the printed reflection page ----------------------------------------

const reflectionText = z.string().trim().max(1500, { error: "too_long" }).default("");
export const reflectionSchema = z.strictObject({
  wentWell: reflectionText,
  needsImprovement: reflectionText,
  nextFocus: reflectionText,
  notes: reflectionText,
});
export type Reflection = z.output<typeof reflectionSchema>;
export const emptyReflection = (): Reflection => ({
  wentWell: "",
  needsImprovement: "",
  nextFocus: "",
  notes: "",
});

// ---- what is stored with a session (`plans.document_settings`) -----------------------------------

/**
 * The template a session was based on, FROZEN as it was when it was applied: its id and design revision (so the session can
 * say "based on X, revision 3" and notice that revision 4 exists), its name, and the layer itself. Editing the saved template later
 * changes nothing here until the coach chooses to update. Deleting it changes nothing either.
 */
export const sessionTemplateSchema = z.strictObject({
  id: z.uuid(),
  /** The template's design revision (see `document_templates.revision`), not its concurrency version. */
  revision: z.int().min(1),
  name: z.string().trim().min(1).max(80),
  /** The preset the template's layer was written against. */
  preset: z.enum(PRESET_IDS),
  design: designOverrideSchema,
});
export type SessionTemplate = z.output<typeof sessionTemplateSchema>;

/**
 * The session-level layer: which preset it started from, only what the coach changed on top of it, and the
 * reflection text. Session CONTENT (the reflection) sits beside the design, never inside it, so a preset or a
 * future template can never carry one session's notes.
 */
export const documentSettingsSchema = z.strictObject({
  schemaVersion: z.literal(DESIGN_VERSION).default(DESIGN_VERSION),
  preset: z.enum(PRESET_IDS).default("classic"),
  /** Preset → TEMPLATE → session override. Null = no template. */
  template: sessionTemplateSchema.nullable().default(null),
  overrides: designOverrideSchema.default({}),
  reflection: reflectionSchema.default(emptyReflection),
});

export type DocumentSettings = z.output<typeof documentSettingsSchema>;

export const defaultDocumentSettings = (): DocumentSettings => documentSettingsSchema.parse({});

/**
 * Every read passes through this. A session that was never customised stores `{}` (the column's default) and
 * reads as the default preset. Returns null for a version this code does not know or a shape it cannot
 * validate; the caller falls back to the default rather than printing half-understood data.
 */
export function migrateDocumentSettings(raw: unknown): DocumentSettings | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  if (Object.keys(raw).length === 0) return defaultDocumentSettings();
  if ((raw as { schemaVersion?: unknown }).schemaVersion !== DESIGN_VERSION) return null;
  const parsed = documentSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---- a saved template's configuration (`document_templates.config`) -----------------------------

/**
 * WHAT A TEMPLATE IS: a preset plus a design layer on top of it — nothing else. The schema is strict, so a session's
 * date, start time, number, timeline, attendance, notes or reflection ANSWERS cannot be stored in one, not even by
 * a forged request. (Reflection prompt WORDING and default branding are part of the design, by intent.)
 */
export const templateConfigSchema = z.strictObject({
  schemaVersion: z.literal(DESIGN_VERSION).default(DESIGN_VERSION),
  preset: z.enum(PRESET_IDS).default("classic"),
  design: designOverrideSchema.default({}),
});
export type TemplateConfig = z.output<typeof templateConfigSchema>;

/** Every read of a stored template passes through this; null = a version or shape this code cannot read. */
export function migrateTemplateConfig(raw: unknown): TemplateConfig | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  if ((raw as { schemaVersion?: unknown }).schemaVersion !== DESIGN_VERSION) return null;
  const parsed = templateConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---- readability -------------------------------------------------------------------------------

/** Below this, body text is refused outright: a page nobody can read is never what a coach wants to print. */
export const MIN_TEXT_CONTRAST = 3;
/** WCAG AA for body text; below it the form warns. */
export const GOOD_TEXT_CONTRAST = 4.5;
/** Fills and rules (WCAG non-text contrast). */
export const GOOD_GRAPHIC_CONTRAST = 3;

export interface DesignIssue {
  code: "text_unreadable" | "text_low" | "primary_low" | "accent_low";
  severity: "error" | "warning";
  ratio: number;
}

/** The readability check the design form shows and the server enforces (errors block saving; warnings do not). */
export function checkDesign(design: Pick<DocumentDesign, "colors">): DesignIssue[] {
  const { text, background, primary, accent } = design.colors;
  const issues: DesignIssue[] = [];
  const textRatio = contrastRatio(text, background);
  if (textRatio < MIN_TEXT_CONTRAST)
    issues.push({ code: "text_unreadable", severity: "error", ratio: textRatio });
  else if (textRatio < GOOD_TEXT_CONTRAST)
    issues.push({ code: "text_low", severity: "warning", ratio: textRatio });
  const primaryRatio = contrastRatio(primary, background);
  if (primaryRatio < GOOD_GRAPHIC_CONTRAST)
    issues.push({ code: "primary_low", severity: "warning", ratio: primaryRatio });
  const accentRatio = contrastRatio(accent, background);
  if (accentRatio < GOOD_GRAPHIC_CONTRAST)
    issues.push({ code: "accent_low", severity: "warning", ratio: accentRatio });
  return issues;
}

export const hasBlockingIssue = (issues: readonly DesignIssue[]) =>
  issues.some((i) => i.severity === "error");

// ---- derived colours -----------------------------------------------------------------------------

export interface DesignTokens {
  background: string;
  text: string;
  /** Coach's exact colours, for fills, bars and rules. */
  primary: string;
  secondary: string;
  accent: string;
  /** The same colours pulled towards readable, for coloured TEXT. */
  primaryInk: string;
  secondaryInk: string;
  accentInk: string;
  muted: string;
  line: string;
  tint: string;
  tintStrong: string;
  onPrimary: string;
  onSecondary: string;
  onAccent: string;
}

export function deriveTokens(colors: DesignColors): DesignTokens {
  const { background, text, primary, secondary, accent } = colors;
  const tint = mix(background, primary, 0.07);
  const tintStrong = mix(background, primary, 0.15);
  return {
    background,
    text,
    primary,
    secondary,
    accent,
    // measured against the strongest tint the text can sit on, so it is readable everywhere
    primaryInk: readableOn(primary, tintStrong),
    secondaryInk: readableOn(secondary, tintStrong),
    accentInk: readableOn(accent, tintStrong),
    muted: readableOn(mix(text, background, 0.34), tintStrong),
    line: mix(background, text, 0.18),
    tint,
    tintStrong,
    onPrimary: onColor(primary),
    onSecondary: onColor(secondary),
    onAccent: onColor(accent),
  };
}

// ---- which parts of an activity a design shows ------------------------------------------------

/** Is this activity-level section shown? Detailed-only sections are always off in Compact mode. */
export function activitySectionShown(design: DocumentDesign, id: SectionId): boolean {
  if (!design.sections[id]) return false;
  return !(design.mode === "compact" && DETAILED_ONLY_SECTIONS.includes(id));
}
