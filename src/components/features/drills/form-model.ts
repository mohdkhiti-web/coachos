import type { DrillPhase, EquipmentRule, Intensity, Level, SourceKind } from "@/db/enums";
import type { DiagramInput } from "@/engines/diagram";
import type { DrillDetailDto } from "@/modules/drills/dto";
import type { DrillInputRaw } from "@/modules/drills/validators";

/**
 * Client-side form state for creating/editing a drill, and the two pure conversions around it:
 * server DTO → form values (editing) and form values → Server Action payload (saving).
 * Numbers are strings while editing (so a field can be empty mid-typing); lists are one item per line.
 */

export interface EquipmentValue {
  on: boolean;
  rule: EquipmentRule;
  quantity: string;
}

export interface ResourceValue {
  kind: "video" | "article";
  title: string;
  url: string;
}

export interface DrillFormValues {
  title: string;
  description: string;
  category: string;
  level: Level | "";
  space: string;
  intensity: Intensity;
  /** "" = not specified. */
  format: string;
  phases: DrillPhase[];
  ageMin: string;
  ageMax: string;
  playersMin: string;
  playersMax: string;
  durationMin: string;
  durationMax: string;
  primarySkill: string;
  secondarySkills: string[];
  /** Focus areas within the main/secondary skills. */
  subSkills: string[];
  tags: string;
  objective: string;
  setup: string;
  organization: string;
  instructions: string;
  coachingPoints: string;
  commonMistakes: string;
  safety: string;
  progressions: string;
  regressions: string;
  variations: string;
  equipment: Record<string, EquipmentValue>;
  resources: ResourceValue[];
  diagrams: Array<{ title: string; diagram: DiagramInput }>;
  visibility: "private" | "organization";
  sourceKind: SourceKind;
  sourceName: string;
  sourceUrl: string;
}

/** One item per non-empty line. */
export const toLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
export const fromLines = (items: readonly string[]): string => items.join("\n");

const num = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));

export function emptyValues(o: { space: string; equipmentKeys: string[] }): DrillFormValues {
  return {
    title: "",
    description: "",
    category: "",
    level: "",
    space: o.space,
    intensity: "medium",
    format: "",
    phases: [],
    ageMin: "",
    ageMax: "",
    playersMin: "",
    playersMax: "",
    durationMin: "",
    durationMax: "",
    primarySkill: "",
    secondarySkills: [],
    subSkills: [],
    tags: "",
    objective: "",
    setup: "",
    organization: "",
    instructions: "",
    coachingPoints: "",
    commonMistakes: "",
    safety: "",
    progressions: "",
    regressions: "",
    variations: "",
    equipment: Object.fromEntries(
      o.equipmentKeys.map((k) => [k, { on: false, rule: "fixed" as const, quantity: "1" }]),
    ),
    resources: [],
    diagrams: [],
    visibility: "private",
    sourceKind: "original",
    sourceName: "",
    sourceUrl: "",
  };
}

export function valuesFromDrill(d: DrillDetailDto, equipmentKeys: string[]): DrillFormValues {
  const base = emptyValues({ space: d.space, equipmentKeys });
  for (const e of d.equipment)
    base.equipment[e.key] = { on: true, rule: e.rule, quantity: String(e.quantity) };
  return {
    ...base,
    title: d.title,
    description: d.description,
    category: d.category.key,
    level: d.level,
    intensity: d.intensity,
    format: d.format ?? "",
    phases: d.phases,
    ageMin: String(d.ageMin),
    ageMax: String(d.ageMax),
    playersMin: String(d.playersMin),
    playersMax: String(d.playersMax),
    durationMin: String(d.durationMin),
    durationMax: String(d.durationMax),
    primarySkill: d.skills.find((s) => s.role === "primary")?.key ?? "",
    secondarySkills: d.skills.filter((s) => s.role === "secondary").map((s) => s.key),
    subSkills: d.skills.filter((s) => s.role === "sub").map((s) => s.key),
    tags: d.tags.join(", "),
    objective: d.content.objective,
    setup: d.content.setup,
    organization: d.content.organization,
    instructions: fromLines(d.content.instructions),
    coachingPoints: fromLines(d.content.coachingPoints),
    commonMistakes: fromLines(d.content.commonMistakes),
    safety: d.content.safety,
    progressions: fromLines(d.content.progressions),
    regressions: fromLines(d.content.regressions),
    variations: fromLines(d.content.variations),
    resources: d.content.resources.map((r) => ({ kind: r.kind, title: r.title, url: r.url })),
    diagrams: d.diagrams.map((g) => ({ title: g.title, diagram: g.diagram })),
    visibility: d.visibility === "organization" ? "organization" : "private",
    sourceKind: d.source.kind,
    sourceName: d.source.name ?? "",
    sourceUrl: d.source.url ?? "",
  };
}

/** What the Server Action receives. It is validated again on the server — this is only a shape conversion. */
export function toPayload(v: DrillFormValues, version?: number): DrillInputRaw {
  return {
    title: v.title,
    description: v.description,
    category: v.category,
    primarySkill: v.primarySkill,
    secondarySkills: v.secondarySkills,
    subSkills: v.subSkills,
    level: v.level as Level,
    intensity: v.intensity,
    format: v.format,
    phases: v.phases,
    ageMin: num(v.ageMin) as number,
    ageMax: num(v.ageMax) as number,
    playersMin: num(v.playersMin) as number,
    playersMax: num(v.playersMax) as number,
    durationMin: num(v.durationMin) as number,
    durationMax: num(v.durationMax) as number,
    space: v.space,
    tags: v.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    equipment: Object.entries(v.equipment)
      .filter(([, e]) => e.on)
      .map(([type, e]) => ({ type, rule: e.rule, quantity: num(e.quantity) as number })),
    content: {
      objective: v.objective,
      setup: v.setup,
      organization: v.organization,
      instructions: toLines(v.instructions),
      coachingPoints: toLines(v.coachingPoints),
      commonMistakes: toLines(v.commonMistakes),
      safety: v.safety,
      progressions: toLines(v.progressions),
      regressions: toLines(v.regressions),
      variations: toLines(v.variations),
      resources: v.resources
        .filter((r) => r.title.trim() || r.url.trim())
        .map((r) => ({ kind: r.kind, title: r.title, url: r.url })),
    },
    diagrams: v.diagrams.map((g) => ({ title: g.title, diagram: g.diagram })),
    visibility: v.visibility,
    sourceKind: v.sourceKind,
    sourceName: v.sourceName,
    sourceUrl: v.sourceUrl,
    ...(version !== undefined ? { version } : {}),
  };
}

/** All messages recorded for a field or anything beneath it ("content.instructions" covers "content.instructions.2"). */
export function errorsFor(fields: Record<string, string[]> | undefined, path: string): string[] {
  if (!fields) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(fields))
    if (k === path || k.startsWith(`${path}.`)) out.push(...v);
  return [...new Set(out)];
}
