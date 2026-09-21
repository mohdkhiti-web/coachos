import type { DrillPhase, Intensity } from "@/db/enums";
import type { Diagram } from "@/engines/diagram";
import type { PlanActivityDto, PlanDetailDto, SourceStatus } from "@/modules/plans/dto";
import {
  buildTimeline,
  computeSchedule,
  remainingMinutes,
  totalMinutes,
} from "@/modules/plans/schedule";

/**
 * The builder's client model. The server sends a LIGHT copy of each activity (a full drill snapshot is tens of
 * kilobytes; a card needs a title, a few facts and a diagram), and the pure functions here apply an edit to that
 * list the moment the coach makes it — so the timeline answers instantly — while the Server Action does the
 * real work and the server's answer replaces the guess.
 *
 * NOTHING here calculates its own timing: offsets, totals, remaining time and the end time all come from the
 * SAME pure functions the server uses (`@/modules/plans/schedule`), so the screen and the database agree.
 */

export interface BuilderActivity {
  id: string;
  position: number;
  kind: "drill" | "custom" | "break";
  phase: DrillPhase | null;
  title: string;
  durationMin: number;
  repetitions: number | null;
  players: number | null;
  notes: string;
  customized: boolean;
  /** The generator and the AI assistant leave a locked activity alone. */
  locked: boolean;
  changeReason: string | null;
  source: { drillId: string | null; status: SourceStatus };
  /** From the drill copy (null for custom activities and breaks). */
  format: string | null;
  intensity: Intensity | null;
  category: string | null;
  diagram: Diagram | null;
  /** All the activity's diagrams (title + drawing), for the diagram editor. */
  diagrams: Array<{ title: string; diagram: Diagram }>;
  /** A coach-written activity's own text, for editing. */
  custom: { description: string; instructions: string[]; coachingPoints: string[] } | null;
}

/** Patch of the fields a coach can change on an activity. */
export type ActivityPatch = Partial<
  Pick<
    BuilderActivity,
    "title" | "phase" | "durationMin" | "repetitions" | "players" | "notes" | "changeReason"
  >
> & { custom?: BuilderActivity["custom"] };

export type Edit =
  | { type: "move"; id: string; delta: -1 | 1 }
  | { type: "reorder"; orderedIds: string[] }
  | { type: "remove"; id: string }
  | { type: "update"; id: string; patch: ActivityPatch };

export function toBuilderActivity(a: PlanActivityDto): BuilderActivity {
  const snap = a.snapshot;
  const drill = snap && "provenance" in snap ? snap : null;
  const custom = snap && !("provenance" in snap) ? snap : null;
  return {
    id: a.id,
    position: a.position,
    kind: a.kind,
    phase: a.phase,
    title: a.title,
    durationMin: a.durationMin,
    repetitions: a.repetitions,
    players: a.players,
    notes: a.notes,
    customized: a.customized,
    locked: a.locked,
    changeReason: a.changeReason,
    source: { drillId: a.source.drillId, status: a.source.status },
    format: drill?.format ?? null,
    intensity: drill?.intensity ?? null,
    category: drill?.category.name ?? null,
    diagram: (drill ?? custom)?.diagrams[0]?.diagram ?? null,
    diagrams: (drill ?? custom)?.diagrams ?? [],
    custom: custom
      ? {
          description: custom.description,
          instructions: custom.instructions,
          coachingPoints: custom.coachingPoints,
        }
      : null,
  };
}

const renumber = (list: BuilderActivity[]): BuilderActivity[] =>
  list.map((a, position) => ({ ...a, position }));

/** The index `id` would move to, or null when it is already at that end of the list (or unknown). */
export function moveTarget(
  list: readonly { id: string }[],
  id: string,
  delta: -1 | 1,
): number | null {
  const from = list.findIndex((a) => a.id === id);
  const to = from + delta;
  return from < 0 || to < 0 || to >= list.length ? null : to;
}

/** The order after an edit is applied — pure, never mutating its input. Unknown ids leave the list as it was. */
export function applyEdit(list: readonly BuilderActivity[], edit: Edit): BuilderActivity[] {
  switch (edit.type) {
    case "move": {
      const to = moveTarget(list, edit.id, edit.delta);
      if (to === null) return [...list];
      const next = [...list];
      const from = next.findIndex((a) => a.id === edit.id);
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return renumber(next);
    }
    case "reorder": {
      const byId = new Map(list.map((a) => [a.id, a]));
      const ordered = edit.orderedIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
      // an order that is not exactly the current activities is ignored (the server would refuse it too)
      return ordered.length === list.length ? renumber(ordered) : [...list];
    }
    case "remove":
      return renumber(list.filter((a) => a.id !== edit.id));
    case "update":
      return list.map((a) =>
        a.id === edit.id
          ? {
              ...a,
              ...edit.patch,
              custom: edit.patch.custom === undefined ? a.custom : edit.patch.custom,
              // renaming or editing a copied drill does not detach it; only the server marks content edits
            }
          : a,
      );
  }
}

/** Everything the timeline and the totals bar show, derived from the activities — with the shared calculations. */
export function summarize(
  activities: readonly BuilderActivity[],
  plan: {
    targetMinutes: number;
    scheduledDate: string | null;
    startTime: string | null;
    timezone: string | null;
  },
) {
  const timeline = buildTimeline(activities);
  const total = totalMinutes(activities);
  return {
    timeline,
    totalMinutes: total,
    activityCount: activities.length,
    remainingMinutes: remainingMinutes(plan.targetMinutes, total),
    schedule: computeSchedule({
      scheduledDate: plan.scheduledDate,
      startTime: plan.startTime,
      timezone: plan.timezone,
      totalMinutes: total,
    }),
  };
}

/** What the server page hands the client: everything serialisable, nothing heavy. */
export interface BuilderPlan {
  id: string;
  version: number;
  status: PlanDetailDto["status"];
  deletedAt: Date | null;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  activities: BuilderActivity[];
}

export function toBuilderPlan(plan: PlanDetailDto): BuilderPlan {
  return {
    id: plan.id,
    version: plan.version,
    status: plan.status,
    deletedAt: plan.deletedAt,
    isMine: plan.isMine,
    canEdit: plan.permissions.canEdit,
    canDelete: plan.permissions.canDelete,
    activities: plan.activities.map(toBuilderActivity),
  };
}
