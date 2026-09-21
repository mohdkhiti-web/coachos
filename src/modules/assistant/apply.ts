import "server-only";
import type { Actor } from "@/lib/authz/can";
import { fail, ok, type Result } from "@/lib/result";
import { recordAudit } from "@/modules/audit";
import { createGeneratedSession, type GenerationLabels } from "@/modules/generator";
import {
  addBreak,
  addBreakSchema,
  addCustomActivity,
  addCustomActivitySchema,
  addDrillActivity,
  addDrillActivitySchema,
  getPlan,
  removeActivity,
  reorderActivities,
  replaceActivityDrill,
  setActivityDurations,
  updateActivity,
  updateActivitySchema,
  updatePlan,
  planInputSchema,
  type PlanDetailDto,
} from "@/modules/plans";
import { isDestructive, type Proposal } from "./proposals";

/**
 * Applying a proposal (Step 8): the ONLY place the assistant's work becomes a change, and only when the coach clicks. It
 * reads the session as it is NOW, refuses if the proposal no longer fits (an activity that has gone, one the coach has
 * locked since), and then calls the same commands the Session Builder calls — so authorization, validation, row-level
 * security, versions and audit are exactly the ordinary ones. A destructive proposal needs `confirmed`.
 */

export interface ApplyResult {
  planId: string | null;
  activityId?: string;
}

/** A session as the plan-update command wants it, with the fields we may be changing. */
function planInputOf(
  plan: PlanDetailDto,
  patch: { players?: number; primary?: string; secondary?: string[] },
) {
  return planInputSchema.parse({
    title: plan.title,
    teamName: plan.teamName ?? "",
    ageGroup: plan.ageGroup?.key ?? "",
    ageMin: plan.ageMin,
    ageMax: plan.ageMax,
    level: plan.level ?? "",
    players: patch.players ?? plan.players,
    targetMinutes: plan.totals.targetMinutes,
    objective: plan.objective,
    scheduledDate: plan.scheduledDate ?? "",
    startTime: plan.startTime?.slice(0, 5) ?? "",
    timezone: plan.timezone ?? "",
    visibility: plan.visibility,
    primaryObjective: patch.primary ?? plan.objectives.primary?.key ?? "",
    secondaryObjectives: patch.secondary ?? plan.objectives.secondary.map((o) => o.key),
    details: plan.details,
    version: plan.version,
  });
}

const outdated = () => fail("CONFLICT");

export async function applyProposal(
  actor: Actor,
  sportKey: string,
  proposal: Proposal,
  opts: { confirmed: boolean; labels: GenerationLabels },
): Promise<Result<ApplyResult>> {
  if (proposal.status !== "pending") return fail("CONFLICT");
  if (isDestructive(proposal) && !opts.confirmed)
    return fail("VALIDATION", { fields: { confirmed: ["required"] } });

  const done = async (r: Result<unknown>, result: ApplyResult): Promise<Result<ApplyResult>> => {
    if (!r.ok) return r;
    await recordAudit(
      { userId: actor.userId, organizationId: actor.organizationId },
      {
        action: "assistant.proposal_applied",
        entityType: "plan",
        entityId: result.planId ?? undefined,
        metadata: { kind: proposal.kind, sport: sportKey },
      },
    );
    return ok(result);
  };

  if (proposal.kind === "create_session") {
    const created = await createGeneratedSession(
      actor,
      sportKey,
      proposal.requirements,
      proposal.items.map((i) => ({
        kind: i.kind,
        drillId: i.drillId,
        phase: i.phase,
        durationMin: i.durationMin,
        locked: i.locked,
      })),
      proposal.extras,
      opts.labels,
    );
    if (!created.ok) return created;
    return done(created, { planId: created.data.id });
  }

  // everything else changes a session that exists: read it as it is now
  const plan = await getPlan(actor, sportKey, proposal.planId);
  if (!plan) return outdated();
  if (!plan.permissions.canEdit) return fail("FORBIDDEN");
  const activity =
    "activityId" in proposal
      ? plan.activities.find((a) => a.id === proposal.activityId)
      : undefined;
  if ("activityId" in proposal) {
    if (!activity) return outdated(); // it has gone since the proposal was made
    if (activity.locked) return fail("FORBIDDEN"); // locked since (or before): never touched
  }
  const at = { planId: plan.id };

  switch (proposal.kind) {
    case "add_drill":
      return done(
        await addDrillActivity(
          actor,
          sportKey,
          plan.id,
          addDrillActivitySchema.parse({
            drillId: proposal.drillId,
            phase: proposal.phase,
            durationMin: proposal.durationMin,
            ...(proposal.position !== null ? { position: proposal.position } : {}),
            version: plan.version,
          }),
        ),
        at,
      );
    case "replace_drill":
      return done(
        await replaceActivityDrill(actor, sportKey, plan.id, proposal.activityId, {
          drillId: proposal.drillId,
          changeReason: "Replaced on the suggestion of the AI assistant",
          version: plan.version,
        }),
        { ...at, activityId: proposal.activityId },
      );
    case "remove_activity":
      return done(
        await removeActivity(actor, sportKey, plan.id, proposal.activityId, plan.version),
        at,
      );
    case "update_activity":
      return done(
        await updateActivity(
          actor,
          sportKey,
          plan.id,
          proposal.activityId,
          updateActivitySchema.parse({ ...proposal.patch, version: plan.version }),
        ),
        { ...at, activityId: proposal.activityId },
      );
    case "reorder_activity": {
      const order = plan.activities.map((a) => a.id).filter((id) => id !== proposal.activityId);
      order.splice(Math.min(proposal.toPosition, order.length), 0, proposal.activityId);
      return done(
        await reorderActivities(actor, sportKey, plan.id, {
          orderedIds: order,
          version: plan.version,
        }),
        at,
      );
    }
    case "set_durations": {
      for (const c of proposal.changes) {
        const a = plan.activities.find((x) => x.id === c.activityId);
        if (!a) return outdated();
        if (a.locked) return fail("FORBIDDEN");
      }
      return done(
        await setActivityDurations(
          actor,
          sportKey,
          plan.id,
          proposal.changes.map((c) => ({ activityId: c.activityId, durationMin: c.to })),
          plan.version,
        ),
        at,
      );
    }
    case "update_plan":
      return done(
        await updatePlan(
          actor,
          sportKey,
          plan.id,
          planInputOf(plan, {
            players: proposal.players,
            primary: proposal.primaryObjective,
            secondary: proposal.secondaryObjectives,
          }),
        ),
        at,
      );
    case "add_custom":
      return done(
        await addCustomActivity(
          actor,
          sportKey,
          plan.id,
          addCustomActivitySchema.parse({
            title: proposal.title,
            phase: proposal.phase,
            durationMin: proposal.durationMin,
            // clearly labelled: the coach sees this on the card and must review the activity before running it
            notes: "AI-generated custom activity. Review it before you use it.",
            content: {
              description: proposal.description,
              instructions: proposal.instructions,
              coachingPoints: proposal.coachingPoints,
            },
            ...(proposal.position !== null ? { position: proposal.position } : {}),
            version: plan.version,
          }),
        ),
        at,
      );
    case "add_break":
      return done(
        await addBreak(
          actor,
          sportKey,
          plan.id,
          addBreakSchema.parse({
            title: proposal.title,
            durationMin: proposal.durationMin,
            ...(proposal.position !== null ? { position: proposal.position } : {}),
            version: plan.version,
          }),
        ),
        at,
      );
    case "set_diagram": {
      const list =
        activity?.snapshot && "diagrams" in activity.snapshot
          ? activity.snapshot.diagrams.map((d) => ({ title: d.title, diagram: d.diagram }))
          : [];
      const next = [...list];
      const entry = { title: proposal.diagramTitle, diagram: proposal.diagram };
      if (proposal.index < next.length) next[proposal.index] = entry;
      else next.push(entry);
      return done(
        await updateActivity(
          actor,
          sportKey,
          plan.id,
          proposal.activityId,
          updateActivitySchema.parse({ diagrams: next, version: plan.version }),
        ),
        { ...at, activityId: proposal.activityId },
      );
    }
  }
}
