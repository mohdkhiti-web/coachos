import type {
  ActivityKind,
  DrillPhase,
  Level,
  PlanStatus,
  PlanType,
  PlanVisibility,
} from "@/db/enums";
import type { DocumentSettings } from "@/modules/documents";
import type { SportKey } from "@/sports/registry";
import type { PlanDetails } from "./details";
import type { Schedule } from "./schedule";
import type { ActivitySnapshot } from "./snapshot";

/**
 * What crosses from the data layer to the UI and, later, to the document model. Never a raw row
 * (ARCHITECTURE.md §3.2): DTOs carry what a screen needs plus already-computed permissions and the
 * CALCULATED numbers (totals, timeline offsets, end time) — which exist nowhere in storage.
 */

/**
 * How an activity's copied drill compares with its source, as seen by the viewer:
 *  none              not from a drill (custom activity, break)
 *  current           the source is unchanged since it was copied
 *  update_available  the source has a newer version — the copy is untouched; updating is the coach's call
 *  unavailable       the source is gone, archived, or not readable by this viewer — the copy stays valid
 */
export type SourceStatus = "none" | "current" | "update_available" | "unavailable";

export interface PlanActivityDto {
  id: string;
  position: number;
  kind: ActivityKind;
  phase: DrillPhase | null;
  title: string;
  durationMin: number;
  repetitions: number | null;
  players: number | null;
  notes: string;
  /** Minutes from the start of the session (calculated). */
  startMin: number;
  endMin: number;
  customized: boolean;
  changeReason: string | null;
  source: {
    drillId: string | null;
    /** The library drill's version when it was copied. */
    drillVersion: number | null;
    status: SourceStatus;
  };
  /** The frozen content. Null for a break, or when the stored JSON could not be understood (see `snapshotValid`). */
  snapshot: ActivitySnapshot | null;
  /** False when a stored snapshot failed validation: the UI must say so instead of showing nothing silently. */
  snapshotValid: boolean;
  updatedAt: Date;
}

export interface PlanTotalsDto {
  /** SUM of the activities' durations. Calculated, never stored. */
  totalMinutes: number;
  activityCount: number;
  targetMinutes: number;
  /** target − total; negative means the timeline is longer than the target. */
  remainingMinutes: number;
}

export interface PlanObjectivesDto {
  primary: { key: string; name: string } | null;
  secondary: Array<{ key: string; name: string }>;
}

export interface PlanDetailDto {
  id: string;
  sportKey: SportKey;
  type: PlanType;
  title: string;
  status: PlanStatus;
  visibility: PlanVisibility;
  teamName: string | null;
  ageGroup: { key: string; name: string } | null;
  ageMin: number | null;
  ageMax: number | null;
  level: Level | null;
  players: number | null;
  objective: string;
  /** Local date, start time and zone as stored. The END time is in `schedule` (calculated). */
  scheduledDate: string | null;
  startTime: string | null;
  timezone: string | null;
  details: PlanDetails;
  /** How the printed session looks (preset + the coach's changes) and the reflection text. Never customised = defaults. */
  documentSettings: DocumentSettings;
  objectives: PlanObjectivesDto;
  activities: PlanActivityDto[];
  totals: PlanTotalsDto;
  /** Start and end as instants and local times; null until the session has a date and a start time. */
  schedule: Schedule | null;
  version: number;
  forkedFromId: string | null;
  isMine: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: { canEdit: boolean; canDelete: boolean };
}

/** One row of a list of sessions ("My Sessions"): totals come from the database view, in the same query. */
export interface PlanListItemDto {
  id: string;
  title: string;
  status: PlanStatus;
  visibility: PlanVisibility;
  teamName: string | null;
  ageGroup: { key: string; name: string } | null;
  level: Level | null;
  scheduledDate: string | null;
  startTime: string | null;
  timezone: string | null;
  totalMinutes: number;
  activityCount: number;
  targetMinutes: number;
  /** Instants from the `plan_totals` view; null when there is no start time. */
  startsAt: Date | null;
  endsAt: Date | null;
  primaryObjective: { key: string; name: string } | null;
  /** The session's version, needed to archive it without opening it (optimistic concurrency). */
  version: number;
  isMine: boolean;
  deletedAt: Date | null;
  updatedAt: Date;
  /** manage = archive, restore, delete; duplicate = copy into the viewer's own workspace. */
  permissions: { canManage: boolean; canDuplicate: boolean };
}

export interface PlanPage {
  items: PlanListItemDto[];
  total: number;
}
