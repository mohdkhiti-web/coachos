"use server";

import { revalidatePath } from "next/cache";
import { PLAN_STATUSES, type PlanStatus } from "@/db/enums";
import { AppError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { fail, type Result } from "@/lib/result";
import { requireViewer } from "@/modules/identity";
import { isSportKey } from "@/sports/registry";
import type { Actor } from "@/lib/authz/can";
import type { ZodType } from "zod";
import {
  addBreak,
  addCustomActivity,
  addDrillActivity,
  createPlan,
  deletePlan,
  duplicateActivity,
  duplicatePlan,
  removeActivity,
  reorderActivities,
  replaceActivityDrill,
  restorePlan,
  setPlanStatus,
  updateActivity,
  updatePlan,
} from "./commands";
import {
  addBreakSchema,
  addCustomActivitySchema,
  addDrillActivitySchema,
  planInputSchema,
  reorderActivitiesSchema,
  updateActivitySchema,
} from "./validators";

/**
 * Server Actions for sessions (ARCHITECTURE.md §18.2): authenticate → parse (Zod) → command (authorize,
 * validate against the sport, transaction + audit) → revalidate → Result. Each re-authenticates: hiding a button
 * is UX, not security. The browser NEVER decides anything that matters — the client validates for speed, and
 * this is where every rule is enforced again, exactly once, in one place.
 */

type Created = Result<{ id: string; version: number }>;
type Versioned = Result<{ version: number }>;

function refresh(sport: string) {
  revalidatePath(`/sessions/${sport}`, "layout"); // drops the client router cache for the sessions area
}

/** flatten Zod issues to { "field.path": [message keys] } — nested paths keep their dots */
function parse<T>(
  schema: ZodType<T>,
  raw: unknown,
): { ok: true; data: T } | { ok: false; error: Result<never> } {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "form";
    (fields[path] ??= []).push(issue.message);
  }
  return { ok: false, error: fail("VALIDATION", { fields }) };
}

/** Common wrapper: authenticate, validate the ids, run the command, refresh on success, never throw at the client. */
async function run<T>(
  scope: string,
  sportKey: string,
  ids: string[],
  command: (actor: Actor) => Promise<Result<T>>,
): Promise<Result<T>> {
  const { actor } = await requireViewer();
  if (!isSportKey(sportKey) || !ids.every(isUuid)) return fail("NOT_FOUND");
  try {
    const result = await command(actor);
    if (result.ok) refresh(sportKey);
    return result;
  } catch (err) {
    if (err instanceof AppError) return fail(err.code);
    logger.error({ err: err instanceof Error ? err.message : String(err), scope }, "action.failed");
    return fail("INTERNAL");
  }
}

// ---- the session -------------------------------------------------------------------------------

export async function createPlanAction(sportKey: string, raw: unknown): Promise<Created> {
  const input = parse(planInputSchema, raw);
  if (!input.ok) return input.error;
  return run("plan.create", sportKey, [], (a) => createPlan(a, sportKey, input.data));
}

export async function updatePlanAction(
  sportKey: string,
  id: string,
  raw: unknown,
): Promise<Created> {
  const input = parse(planInputSchema, raw);
  if (!input.ok) return input.error;
  return run("plan.update", sportKey, [id], (a) => updatePlan(a, sportKey, id, input.data));
}

export async function setPlanStatusAction(
  sportKey: string,
  id: string,
  status: PlanStatus,
  version: number,
): Promise<Created> {
  if (!(PLAN_STATUSES as readonly string[]).includes(status) || !Number.isInteger(version))
    return fail("VALIDATION");
  return run("plan.status", sportKey, [id], (a) => setPlanStatus(a, sportKey, id, status, version));
}

export async function deletePlanAction(
  sportKey: string,
  id: string,
): Promise<Result<{ id: string }>> {
  return run("plan.delete", sportKey, [id], (a) => deletePlan(a, sportKey, id));
}

export async function restorePlanAction(
  sportKey: string,
  id: string,
): Promise<Result<{ id: string }>> {
  return run("plan.restore", sportKey, [id], (a) => restorePlan(a, sportKey, id));
}

export async function duplicatePlanAction(sportKey: string, id: string): Promise<Created> {
  return run("plan.duplicate", sportKey, [id], (a) => duplicatePlan(a, sportKey, id));
}

// ---- the timeline ------------------------------------------------------------------------------

export async function addDrillActivityAction(
  sportKey: string,
  planId: string,
  raw: unknown,
): Promise<Created> {
  const input = parse(addDrillActivitySchema, raw);
  if (!input.ok) return input.error;
  return run("activity.add_drill", sportKey, [planId], (a) =>
    addDrillActivity(a, sportKey, planId, input.data),
  );
}

export async function addCustomActivityAction(
  sportKey: string,
  planId: string,
  raw: unknown,
): Promise<Created> {
  const input = parse(addCustomActivitySchema, raw);
  if (!input.ok) return input.error;
  return run("activity.add_custom", sportKey, [planId], (a) =>
    addCustomActivity(a, sportKey, planId, input.data),
  );
}

export async function addBreakAction(
  sportKey: string,
  planId: string,
  raw: unknown,
): Promise<Created> {
  const input = parse(addBreakSchema, raw);
  if (!input.ok) return input.error;
  return run("activity.add_break", sportKey, [planId], (a) =>
    addBreak(a, sportKey, planId, input.data),
  );
}

export async function updateActivityAction(
  sportKey: string,
  planId: string,
  activityId: string,
  raw: unknown,
): Promise<Created> {
  const input = parse(updateActivitySchema, raw);
  if (!input.ok) return input.error;
  return run("activity.update", sportKey, [planId, activityId], (a) =>
    updateActivity(a, sportKey, planId, activityId, input.data),
  );
}

export async function reorderActivitiesAction(
  sportKey: string,
  planId: string,
  raw: unknown,
): Promise<Versioned> {
  const input = parse(reorderActivitiesSchema, raw);
  if (!input.ok) return input.error;
  return run("activity.reorder", sportKey, [planId], (a) =>
    reorderActivities(a, sportKey, planId, input.data),
  );
}

export async function removeActivityAction(
  sportKey: string,
  planId: string,
  activityId: string,
  version: number,
): Promise<Versioned> {
  if (!Number.isInteger(version)) return fail("VALIDATION");
  return run("activity.remove", sportKey, [planId, activityId], (a) =>
    removeActivity(a, sportKey, planId, activityId, version),
  );
}

export async function duplicateActivityAction(
  sportKey: string,
  planId: string,
  activityId: string,
  version: number,
): Promise<Created> {
  if (!Number.isInteger(version)) return fail("VALIDATION");
  return run("activity.duplicate", sportKey, [planId, activityId], (a) =>
    duplicateActivity(a, sportKey, planId, activityId, version),
  );
}

/** The coach's deliberate choice: swap in another drill, or refresh from the source (no `drillId`). */
export async function replaceActivityDrillAction(
  sportKey: string,
  planId: string,
  activityId: string,
  input: { drillId?: string; changeReason?: string; version: number },
): Promise<Created> {
  if (
    !Number.isInteger(input?.version) ||
    (input.drillId !== undefined && !isUuid(input.drillId)) ||
    (input.changeReason !== undefined &&
      (typeof input.changeReason !== "string" || input.changeReason.length > 300))
  )
    return fail("VALIDATION");
  return run("activity.replace", sportKey, [planId, activityId], (a) =>
    replaceActivityDrill(a, sportKey, planId, activityId, input),
  );
}
