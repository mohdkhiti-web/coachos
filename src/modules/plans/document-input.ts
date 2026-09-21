import type {
  DocumentActivityContent,
  DocumentActivityInput,
  SessionDocumentInput,
} from "@/modules/documents";
import type { PlanDetailDto } from "./dto";
import { buildTimeline } from "./schedule";
import type { ActivitySnapshot, DrillSnapshot } from "./snapshot";

/**
 * A session → the documents module's input. Pure: it decides nothing about layout, only which of the session's
 * values are what the document is told. Timing comes from the SAME `buildTimeline` the builder uses, so the
 * times on paper are the times on the screen the coach built the session on.
 */

const isDrillSnapshot = (s: ActivitySnapshot): s is DrillSnapshot => "content" in s;

/** What an activity's frozen snapshot says, in the shape the document model reads. */
export function snapshotContent(s: ActivitySnapshot | null): DocumentActivityContent | null {
  if (!s) return null;
  if (isDrillSnapshot(s)) {
    const c = s.content;
    return {
      objective: c.objective,
      description: "",
      setup: c.setup,
      organization: c.organization,
      instructions: c.instructions,
      coachingPoints: c.coachingPoints,
      commonMistakes: c.commonMistakes,
      safety: c.safety,
      progressions: c.progressions,
      regressions: c.regressions,
      variations: c.variations,
      equipment: s.equipment.map((e) => ({
        key: e.key,
        name: e.name,
        rule: e.rule,
        quantity: e.quantity,
      })),
      diagrams: s.diagrams.map((d) => ({ title: d.title, diagram: d.diagram })),
      format: s.format,
      intensity: s.intensity,
      playersRange: { min: s.players.min, max: s.players.max },
    };
  }
  return {
    objective: "",
    description: s.description,
    setup: "",
    organization: "",
    instructions: s.instructions,
    coachingPoints: s.coachingPoints,
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
  };
}

export function toDocumentInput(plan: PlanDetailDto): SessionDocumentInput {
  const timed = buildTimeline(plan.activities.map((a) => ({ ...a, durationMin: a.durationMin })));
  const activities: DocumentActivityInput[] = timed.map((a) => ({
    id: a.id,
    kind: a.kind,
    title: a.title,
    phase: a.phase,
    durationMin: a.durationMin,
    startMin: a.startMin,
    endMin: a.endMin,
    players: a.players,
    repetitions: a.repetitions,
    notes: a.notes,
    content: snapshotContent(a.snapshot),
  }));
  return {
    title: plan.title,
    teamName: plan.teamName,
    ageGroup: plan.ageGroup?.name ?? null,
    ageRange:
      plan.ageMin !== null && plan.ageMax !== null ? { min: plan.ageMin, max: plan.ageMax } : null,
    level: plan.level,
    players: plan.players,
    goal: plan.objective,
    scheduledDate: plan.scheduledDate,
    startTime: plan.startTime,
    endTime: plan.schedule?.endTime ?? null,
    endsNextDay: plan.schedule?.endsNextDay ?? false,
    totalMinutes: plan.totals.totalMinutes,
    location: plan.details.location,
    season: plan.details.season,
    sessionNumber: plan.details.sessionNumber,
    coachName: plan.details.coachName,
    clubName: plan.details.clubName,
    coachNotes: plan.details.coachNotes,
    objectives: {
      primary: plan.objectives.primary?.name ?? null,
      secondary: plan.objectives.secondary.map((o) => o.name),
    },
    activities,
  };
}
