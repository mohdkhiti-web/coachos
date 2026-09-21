import "server-only";
import type { Actor } from "@/lib/authz/can";
import { getDrill, parseFilters, searchDrills } from "@/modules/drills";
import type { DocumentActivityInput, SessionDocumentInput } from "@/modules/documents";
import { snapshotContent } from "./document-input";
import { computeSchedule } from "./schedule";
import { buildDrillSnapshot } from "./snapshot";

/**
 * A SAMPLE session for previewing a template: a few real library drills (with their diagrams), a break and a
 * coach-written activity, under invented details. It exists only so a template's look can be judged on a realistic
 * document; it is built fresh each time, stored nowhere, and labelled as a sample wherever it is shown. It uses none
 * of the viewer's own sessions.
 */
export interface SampleLabels {
  title: string;
  teamName: string;
  goal: string;
  location: string;
  season: string;
  coachName: string;
  clubName: string;
  objective: { primary: string; secondary: string[] };
  breakTitle: string;
  customTitle: string;
  customDescription: string;
}

const DRILLS = 3;
const MINUTES = [12, 15, 15];

export async function buildSampleDocumentInput(
  actor: Actor,
  sportKey: string,
  labels: SampleLabels,
): Promise<SessionDocumentInput> {
  const page = await searchDrills(
    actor,
    sportKey,
    parseFilters({ scope: "library", sort: "title" }),
    { pageSize: DRILLS },
  );
  const now = new Date();
  const drills = (
    await Promise.all(
      (page?.items ?? []).slice(0, DRILLS).map((d) => getDrill(actor, sportKey, d.id)),
    )
  ).flatMap((d) => (d ? [d] : []));

  const specs: Array<Omit<DocumentActivityInput, "startMin" | "endMin" | "id">> = [
    ...drills.map((d, i) => {
      const snapshot = buildDrillSnapshot(d, now);
      return {
        kind: "drill" as const,
        title: snapshot.title,
        phase: snapshot.phases[0] ?? null,
        durationMin: MINUTES[i] ?? 12,
        players: null,
        repetitions: null,
        notes: "",
        content: snapshotContent(snapshot),
      };
    }),
    {
      kind: "break" as const,
      title: labels.breakTitle,
      phase: "break",
      durationMin: 3,
      players: null,
      repetitions: null,
      notes: "",
      content: null,
    },
    {
      kind: "custom" as const,
      title: labels.customTitle,
      phase: "skill",
      durationMin: 8,
      players: null,
      repetitions: null,
      notes: "",
      content: snapshotContent({
        schemaVersion: 1,
        description: labels.customDescription,
        instructions: [],
        coachingPoints: [],
        diagrams: [],
      }),
    },
  ];

  let at = 0;
  const activities: DocumentActivityInput[] = specs.map((spec, i) => {
    const item = { ...spec, id: `sample-${i + 1}`, startMin: at, endMin: at + spec.durationMin };
    at = item.endMin;
    return item;
  });
  const scheduledDate = "2030-01-15";
  const startTime = "18:30";
  const schedule = computeSchedule({ scheduledDate, startTime, timezone: "UTC", totalMinutes: at });

  return {
    title: labels.title,
    teamName: labels.teamName,
    ageGroup: null,
    ageRange: { min: 13, max: 14 },
    level: "intermediate",
    players: 14,
    goal: labels.goal,
    scheduledDate,
    startTime,
    endTime: schedule?.endTime ?? null,
    endsNextDay: schedule?.endsNextDay ?? false,
    totalMinutes: at,
    location: labels.location,
    season: labels.season,
    sessionNumber: 12,
    coachName: labels.coachName,
    clubName: labels.clubName,
    coachNotes: "",
    objectives: labels.objective,
    activities,
  };
}
