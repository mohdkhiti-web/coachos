import fs from "node:fs";
import path from "node:path";
import type { DocumentActivityContent, DocumentActivityInput, SessionDocumentInput } from "./types";

/**
 * Test fixtures built from the REAL drill library (content/basketball/drills/*.json), so the document model is
 * exercised with the shapes and lengths of actual coaching content — never with hand-made lorem ipsum.
 * Used only by tests.
 */

const DRILLS_DIR = path.resolve(__dirname, "../../../content/basketball/drills");

interface RawDrill {
  seedKey: string;
  title: string;
  playersMin: number;
  playersMax: number;
  format: string | null;
  intensity: "low" | "medium" | "high";
  phases: string[];
  equipment: Array<{ type: string; rule: "fixed" | "per_player" | "per_pair"; quantity: number }>;
  content: {
    objective: string;
    setup: string;
    organization?: string;
    instructions: string[];
    coachingPoints: string[];
    commonMistakes?: string[];
    safety?: string;
    progressions?: string[];
    regressions?: string[];
    variations?: string[];
  };
  diagrams: Array<{
    title: string;
    diagram: DocumentActivityContent["diagrams"][number]["diagram"];
  }>;
}

export const drillKeys = (): string[] =>
  fs
    .readdirSync(DRILLS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function drillContent(seedKey: string): {
  title: string;
  phase: string | null;
  content: DocumentActivityContent;
} {
  const d = JSON.parse(
    fs.readFileSync(path.join(DRILLS_DIR, `${seedKey}.json`), "utf8"),
  ) as RawDrill;
  return {
    title: d.title,
    phase: d.phases[0] ?? null,
    content: {
      objective: d.content.objective,
      description: "",
      setup: d.content.setup,
      organization: d.content.organization ?? "",
      instructions: d.content.instructions,
      coachingPoints: d.content.coachingPoints,
      commonMistakes: d.content.commonMistakes ?? [],
      safety: d.content.safety ?? "",
      progressions: d.content.progressions ?? [],
      regressions: d.content.regressions ?? [],
      variations: d.content.variations ?? [],
      equipment: d.equipment.map((e) => ({
        key: e.type,
        name: titleCase(e.type),
        rule: e.rule,
        quantity: e.quantity,
      })),
      diagrams: d.diagrams,
      format: d.format,
      intensity: d.intensity,
      playersRange: { min: d.playersMin, max: d.playersMax },
    },
  };
}

export type ActivitySpec =
  | { drill: string; minutes?: number; notes?: string }
  | { custom: string; minutes?: number; description?: string }
  | { break: number };

/** Activities laid end to end, timed exactly as `buildTimeline` does. */
export function activities(specs: readonly ActivitySpec[]): DocumentActivityInput[] {
  let at = 0;
  return specs.map((spec, i) => {
    const base = { id: `a${i + 1}`, players: null, repetitions: null, notes: "" };
    if ("break" in spec) {
      const item: DocumentActivityInput = {
        ...base,
        kind: "break",
        title: "Water break",
        phase: "break",
        durationMin: spec.break,
        startMin: at,
        endMin: at + spec.break,
        content: null,
      };
      at += spec.break;
      return item;
    }
    if ("custom" in spec) {
      const minutes = spec.minutes ?? 10;
      const item: DocumentActivityInput = {
        ...base,
        kind: "custom",
        title: spec.custom,
        phase: "skill",
        durationMin: minutes,
        startMin: at,
        endMin: at + minutes,
        content: {
          objective: "",
          description: spec.description ?? "",
          setup: "",
          organization: "",
          instructions: [],
          coachingPoints: [],
          commonMistakes: [],
          safety: "",
          progressions: [],
          regressions: [],
          variations: [],
          equipment: [],
          diagrams: [],
          format: null,
          intensity: null,
          playersRange: null,
        },
      };
      at += minutes;
      return item;
    }
    const d = drillContent(spec.drill);
    const minutes = spec.minutes ?? 12;
    const item: DocumentActivityInput = {
      ...base,
      notes: spec.notes ?? "",
      kind: "drill",
      title: d.title,
      phase: d.phase,
      durationMin: minutes,
      startMin: at,
      endMin: at + minutes,
      content: d.content,
    };
    at += minutes;
    return item;
  });
}

export function session(
  specs: readonly ActivitySpec[],
  overrides: Partial<SessionDocumentInput> = {},
): SessionDocumentInput {
  const list = activities(specs);
  return {
    title: "Tuesday shooting and transition",
    teamName: "U14 Boys",
    ageGroup: "U14",
    ageRange: { min: 13, max: 14 },
    level: "intermediate",
    players: 12,
    goal: "Better spacing and quicker decisions in transition.",
    scheduledDate: "2026-10-06",
    startTime: "18:00:00",
    endTime: "19:30",
    endsNextDay: false,
    totalMinutes: list.reduce((s, a) => s + a.durationMin, 0),
    location: "Main gym",
    season: "2026/27",
    sessionNumber: 7,
    coachName: "Sam Rivera",
    clubName: "Riverside Basketball Club",
    coachNotes: "Keep the intensity high in the first half; check the shoulder of number 9.",
    objectives: { primary: "Shooting", secondary: ["Transition", "Passing"] },
    activities: list,
    ...overrides,
  };
}

/** A believable evening: warm-up, skill, small-sided, game, cool-down. */
export function typicalSession(overrides: Partial<SessionDocumentInput> = {}) {
  const keys = drillKeys();
  const at = (i: number) => keys[i % keys.length]!;
  return session(
    [
      { drill: at(0), minutes: 10 },
      { drill: at(1), minutes: 12 },
      { break: 3 },
      { drill: at(2), minutes: 15 },
      { drill: at(3), minutes: 15 },
      { custom: "Free throws", minutes: 10, description: "Pairs shoot ten each, then rotate." },
      { drill: at(4), minutes: 15 },
      { drill: at(5), minutes: 10 },
    ],
    overrides,
  );
}
