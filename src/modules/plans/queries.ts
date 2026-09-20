import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { ActivityKind, DrillPhase, Level, PlanStatus, PlanVisibility } from "@/db/enums";
import {
  ageGroups,
  drills,
  objectives,
  planActivities,
  planObjectives,
  plans,
  planTotals,
} from "@/db/schema";
import { can, type Actor, type PlanResource } from "@/lib/authz/can";
import { tenantTx } from "@/lib/db/tx";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { getSport } from "@/modules/sports";
import type { SportKey } from "@/sports/registry";
import { migratePlanDetails } from "./details";
import type {
  PlanActivityDto,
  PlanDetailDto,
  PlanListItemDto,
  PlanObjectivesDto,
  PlanPage,
  SourceStatus,
} from "./dto";
import { buildTimeline, computeSchedule, remainingMinutes, totalMinutes } from "./schedule";
import { parseSnapshot } from "./snapshot";

/**
 * READ side of the plans module. Every function takes the Actor and runs inside `tenantTx`, so PostgreSQL
 * row-level security decides what exists for this actor (another workspace's sessions, and other people's
 * private ones, are simply not there → "not found", never "forbidden", ARCHITECTURE.md §6.3).
 * The session's calculated numbers (total, timeline offsets, end time) are computed here from stored
 * durations; nothing derived is read from a column.
 */

const resourceOf = (row: {
  organizationId: string;
  createdBy: string | null;
  visibility: string;
  status: string;
}): PlanResource => ({
  organizationId: row.organizationId,
  createdBy: row.createdBy,
  visibility: row.visibility as PlanVisibility,
  status: row.status,
});

/** One session with its objectives, timeline, totals and end time. Soft-deleted sessions only when asked for (a trash view). */
export async function getPlan(
  actor: Actor,
  sportKey: string,
  id: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<PlanDetailDto | null> {
  if (!isUuid(id)) return null;
  const sport = await getSport(sportKey);
  if (!sport) return null;

  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .select({
        plan: plans,
        ageGroupKey: ageGroups.key,
        ageGroupName: ageGroups.name,
      })
      .from(plans)
      .leftJoin(ageGroups, eq(ageGroups.id, plans.ageGroupId))
      .where(and(eq(plans.id, id), eq(plans.sportId, sport.id)))
      .limit(1);
    if (!row) return null;
    const p = row.plan;
    if (p.deletedAt && !opts.includeDeleted) return null;

    const details = migratePlanDetails(p.details);
    if (!details) {
      logger.error({ planId: id }, "plans.stored_details_invalid");
      return null;
    }

    // sequential on purpose: a transaction is a single connection (concurrent queries on it queue anyway)
    const objectiveRows = await tx
      .select({ key: objectives.key, name: objectives.name, role: planObjectives.role })
      .from(planObjectives)
      .innerJoin(objectives, eq(objectives.id, planObjectives.objectiveId))
      .where(eq(planObjectives.planId, id))
      .orderBy(asc(planObjectives.role), asc(objectives.sortOrder));
    const activityRows = await tx
      .select()
      .from(planActivities)
      .where(eq(planActivities.planId, id))
      .orderBy(asc(planActivities.position));

    // How do the copied drills compare with their sources? Read through the drills policies: a source the
    // viewer cannot read (or that no longer exists) simply is not returned → "unavailable".
    const sourceIds = [
      ...new Set(activityRows.flatMap((a) => (a.sourceDrillId ? [a.sourceDrillId] : []))),
    ];
    const sources = sourceIds.length
      ? await tx
          .select({ id: drills.id, version: drills.version, status: drills.status })
          .from(drills)
          .where(inArray(drills.id, sourceIds))
      : [];

    const activities: PlanActivityDto[] = buildTimeline(
      activityRows.map((a) => {
        const kind = a.kind as ActivityKind;
        const snap = parseSnapshot(kind, a.snapshot);
        if (!snap.ok)
          logger.error({ planId: id, activityId: a.id }, "plans.stored_snapshot_invalid");
        const source = a.sourceDrillId ? sources.find((s) => s.id === a.sourceDrillId) : undefined;
        const status: SourceStatus =
          kind !== "drill"
            ? "none"
            : !source || source.status !== "published"
              ? "unavailable"
              : source.version > (a.sourceDrillVersion ?? 0)
                ? "update_available"
                : "current";
        return {
          id: a.id,
          position: a.position,
          kind,
          phase: a.phase as DrillPhase | null,
          title: a.title,
          durationMin: a.durationMin,
          repetitions: a.repetitions,
          players: a.players,
          notes: a.notes,
          customized: a.customized,
          changeReason: a.changeReason,
          source: { drillId: a.sourceDrillId, drillVersion: a.sourceDrillVersion, status },
          snapshot: snap.ok ? snap.data : null,
          snapshotValid: snap.ok,
          updatedAt: a.updatedAt,
        };
      }),
    );

    const total = totalMinutes(activities);
    const primaryRow = objectiveRows.find((o) => o.role === "primary");
    const planObjectiveSummary: PlanObjectivesDto = {
      primary: primaryRow ? { key: primaryRow.key, name: primaryRow.name } : null,
      secondary: objectiveRows
        .filter((o) => o.role === "secondary")
        .map((o) => ({ key: o.key, name: o.name })),
    };

    const resource = resourceOf(p);
    const editable = !p.deletedAt && p.status !== "archived";
    return {
      id: p.id,
      sportKey: sport.key as SportKey,
      type: "training_session",
      title: p.title,
      status: p.status as PlanStatus,
      visibility: p.visibility as PlanVisibility,
      teamName: p.teamName,
      ageGroup: row.ageGroupKey ? { key: row.ageGroupKey, name: row.ageGroupName! } : null,
      ageMin: p.ageMin,
      ageMax: p.ageMax,
      level: p.level as Level | null,
      players: p.players,
      objective: p.objective,
      scheduledDate: p.scheduledDate,
      startTime: p.startTime,
      timezone: p.timezone,
      details,
      objectives: planObjectiveSummary,
      activities,
      totals: {
        totalMinutes: total,
        activityCount: activities.length,
        targetMinutes: p.targetMinutes,
        remainingMinutes: remainingMinutes(p.targetMinutes, total),
      },
      schedule: computeSchedule({
        scheduledDate: p.scheduledDate,
        startTime: p.startTime,
        timezone: p.timezone,
        totalMinutes: total,
      }),
      version: p.version,
      forkedFromId: p.forkedFromId,
      isMine: p.createdBy === actor.userId,
      deletedAt: p.deletedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      permissions: {
        canEdit: editable && can(actor, "plan:update", resource),
        canDelete: can(actor, "plan:delete", resource),
      },
    };
  });
}

export type ListPlansOptions = {
  status?: PlanStatus;
  /** Only soft-deleted sessions (a trash view). Default: only live ones. */
  trash?: boolean;
  /** Only the actor's own sessions. */
  mineOnly?: boolean;
  limit?: number;
  offset?: number;
};

/**
 * Sessions the actor may read, newest change first, with total length and start/end instants taken from the
 * `plan_totals` view in the same query (no per-row work in the application).
 */
export async function listPlans(
  actor: Actor,
  sportKey: string,
  opts: ListPlansOptions = {},
): Promise<PlanPage | null> {
  const sport = await getSport(sportKey);
  if (!sport) return null;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conds: SQL[] = [
    eq(plans.sportId, sport.id),
    opts.trash ? isNotNull(plans.deletedAt) : isNull(plans.deletedAt),
  ];
  if (opts.status) conds.push(eq(plans.status, opts.status));
  if (opts.mineOnly) conds.push(eq(plans.createdBy, actor.userId));
  const where = and(...conds);

  return tenantTx(actor, async (tx) => {
    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(plans)
      .where(where);
    const rows = await tx
      .select({
        plan: plans,
        totalMinutes: planTotals.totalMinutes,
        activityCount: planTotals.activityCount,
        startsAt: planTotals.startsAt,
        endsAt: planTotals.endsAt,
        ageGroupKey: ageGroups.key,
        ageGroupName: ageGroups.name,
      })
      .from(plans)
      .innerJoin(planTotals, eq(planTotals.planId, plans.id))
      .leftJoin(ageGroups, eq(ageGroups.id, plans.ageGroupId))
      .where(where)
      .orderBy(desc(plans.updatedAt), desc(plans.id))
      .limit(limit)
      .offset(offset);

    const items: PlanListItemDto[] = rows.map((r) => ({
      id: r.plan.id,
      title: r.plan.title,
      status: r.plan.status as PlanStatus,
      visibility: r.plan.visibility as PlanVisibility,
      teamName: r.plan.teamName,
      ageGroup: r.ageGroupKey ? { key: r.ageGroupKey, name: r.ageGroupName! } : null,
      level: r.plan.level as Level | null,
      scheduledDate: r.plan.scheduledDate,
      startTime: r.plan.startTime,
      timezone: r.plan.timezone,
      totalMinutes: r.totalMinutes,
      activityCount: r.activityCount,
      targetMinutes: r.plan.targetMinutes,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      isMine: r.plan.createdBy === actor.userId,
      deletedAt: r.plan.deletedAt,
      updatedAt: r.plan.updatedAt,
    }));
    return { items, total: Number(n) };
  });
}
