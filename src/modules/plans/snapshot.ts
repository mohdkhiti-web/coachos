import { z } from "zod";
import {
  DRILL_PHASES,
  EQUIPMENT_RULES,
  INTENSITIES,
  LEVELS,
  SOURCE_KINDS,
  type ActivityKind,
} from "@/db/enums";
import { diagramSchema } from "@/engines/diagram";
import { drillContentSchema, type DrillDetailDto } from "@/modules/drills";

/**
 * The frozen copy of a drill that lives inside a session activity (`plan_activities.snapshot`).
 *
 * WHY A COPY: a session is a document a coach prints and hands out. If the library drill it came from is
 * edited, made private or archived next month, that session must still say what it said when the coach
 * planned it. So everything a document needs is copied in at the moment of adding — nothing is looked up
 * live — and the copy is only ever replaced by a deliberate action of the coach.
 *
 * WHY VERSIONED + VALIDATED: the JSON is written once and read for years, by code that will have changed.
 * `schemaVersion` says which shape it has; `parseSnapshot` is the single way in and out, so a new version is
 * one added schema plus one migration step (see `migrateSnapshot`), and a shape this code does not know is
 * rejected instead of half-rendered.
 *
 * Pure (no I/O): the same schema validates what the commands write and what the document model will read.
 */

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

const line = (max: number) => z.string().trim().min(1).max(max);
const named = z.strictObject({ key: line(60), name: line(80) });
const range = z.strictObject({ min: z.int().min(1).max(240), max: z.int().min(1).max(240) });

/** Where a drill came from, so a printed session can always say — and a later update can check. */
export const provenanceSchema = z.strictObject({
  /** The library/workspace drill this was copied from. Lineage only: the content is below. */
  drillId: z.uuid(),
  /** The drill's `version` at the moment of copying (`plan_activities.source_drill_version` mirrors it). */
  drillVersion: z.int().min(1),
  /** ISO 8601, UTC. */
  capturedAt: z.iso.datetime(),
  /** library = CoachOS curated · workspace = shared inside the coach's workspace · mine = the coach's own private drill. */
  scope: z.enum(["library", "workspace", "mine"]),
  /** Credit for adapted/external material travels with the copy. */
  sourceKind: z.enum(SOURCE_KINDS),
  sourceName: z.string().max(120).nullable(),
  sourceUrl: z.string().max(500).nullable(),
});

export const drillSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  title: line(120),
  description: line(300),
  category: named,
  /** Sub-skills are the focus areas within the main/secondary skills (Crossover under Dribbling). */
  skills: z.strictObject({
    primary: named.nullable(),
    secondary: z.array(named).max(6),
    sub: z.array(named).max(12),
  }),
  level: z.enum(LEVELS),
  age: range.extend({ min: z.int().min(3).max(99), max: z.int().min(3).max(99) }),
  players: range.extend({ min: z.int().min(1).max(60), max: z.int().min(1).max(60) }),
  /** The drill's suggested duration range. The minutes actually planned are the activity's own `duration_min`. */
  duration: range,
  space: line(32),
  intensity: z.enum(INTENSITIES),
  format: z.string().max(16).nullable(),
  phases: z.array(z.enum(DRILL_PHASES)).max(DRILL_PHASES.length),
  tags: z.array(z.string().max(30)).max(8),
  equipment: z
    .array(
      z.strictObject({
        key: line(60),
        name: line(80),
        rule: z.enum(EQUIPMENT_RULES),
        quantity: z.int().min(1).max(60),
      }),
    )
    .max(30),
  /** Objective, setup, organization, instructions, coaching points, common mistakes, safety, progressions,
   *  regressions, variations and resource links — the drill's own validated, versioned content. */
  content: drillContentSchema,
  diagrams: z.array(z.strictObject({ title: z.string().max(60), diagram: diagramSchema })).max(5),
  provenance: provenanceSchema,
});

export type DrillSnapshot = z.output<typeof drillSnapshotSchema>;

const items = (max: number) => z.array(line(500)).max(max);

/** What a coach-written activity carries. A subset of a drill: text the coach typed, no library provenance. */
export const customSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  description: z.string().trim().max(2000).default(""),
  instructions: items(20).default([]),
  coachingPoints: items(20).default([]),
});

export type CustomSnapshot = z.output<typeof customSnapshotSchema>;
export type CustomSnapshotInput = z.input<typeof customSnapshotSchema>;

export type ActivitySnapshot = DrillSnapshot | CustomSnapshot;

/**
 * Bring a stored snapshot up to the current shape. Only v1 exists; when v2 arrives, add the v1→v2 step here
 * and bump SNAPSHOT_SCHEMA_VERSION. Must stay total for every older version. Unknown versions fall through
 * to the schema, which rejects them.
 */
export function migrateSnapshot(raw: unknown): unknown {
  return raw;
}

/**
 * The one way to read a stored snapshot. `null` = a break (which has none) or something this code cannot
 * understand (`ok: false`): the caller degrades visibly (and logs) instead of rendering guesses.
 */
export function parseSnapshot(
  kind: ActivityKind,
  raw: unknown,
): { ok: true; data: ActivitySnapshot | null } | { ok: false } {
  if (kind === "break") return raw == null ? { ok: true, data: null } : { ok: false };
  const migrated = migrateSnapshot(raw);
  const parsed = (kind === "drill" ? drillSnapshotSchema : customSnapshotSchema).safeParse(
    migrated,
  );
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false };
}

/**
 * Copy a drill, as the actor sees it right now, into a snapshot. `now` is a parameter so the moment of
 * copying is explicit (and testable). The result is validated against the schema before it is returned, so
 * a snapshot that would not read back can never be written.
 */
export function buildDrillSnapshot(drill: DrillDetailDto, now: Date): DrillSnapshot {
  const pick = (role: "primary" | "secondary" | "sub") =>
    drill.skills.filter((s) => s.role === role).map((s) => ({ key: s.key, name: s.name }));

  return drillSnapshotSchema.parse({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    title: drill.title,
    description: drill.description,
    category: { key: drill.category.key, name: drill.category.name },
    skills: {
      primary: pick("primary")[0] ?? null,
      secondary: pick("secondary"),
      sub: pick("sub"),
    },
    level: drill.level,
    age: { min: drill.ageMin, max: drill.ageMax },
    players: { min: drill.playersMin, max: drill.playersMax },
    duration: { min: drill.durationMin, max: drill.durationMax },
    space: drill.space,
    intensity: drill.intensity,
    format: drill.format,
    phases: drill.phases,
    tags: drill.tags,
    equipment: drill.equipment.map((e) => ({
      key: e.key,
      name: e.name,
      rule: e.rule,
      quantity: e.quantity,
    })),
    content: drill.content,
    diagrams: drill.diagrams.map((g) => ({ title: g.title, diagram: g.diagram })),
    provenance: {
      drillId: drill.id,
      drillVersion: drill.version,
      capturedAt: now.toISOString(),
      scope: drill.scope,
      sourceKind: drill.source.kind,
      sourceName: drill.source.name,
      sourceUrl: drill.source.url,
    },
  });
}
