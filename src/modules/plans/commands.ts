import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { PLAN_LIMITS, type ActivityKind, type PlanStatus, type PlanVisibility } from "@/db/enums";
import {
  documentTemplates,
  drills,
  planActivities,
  planObjectives,
  plans,
  profiles,
} from "@/db/schema";
import { can, type Actor, type PlanResource } from "@/lib/authz/can";
import type { Tx } from "@/lib/db/client";
import { inTx } from "@/lib/db/in-tx";
import { tenantTx } from "@/lib/db/tx";
import { isUuid, newId } from "@/lib/ids";
import { fail, ok, type FieldErrors, type Result } from "@/lib/result";
import { recordAuditInTx } from "@/modules/audit";
import { drillContentSchema, getDrill } from "@/modules/drills";
import {
  checkDesign,
  documentSettingsSchema,
  diffDesign,
  emptyReflection,
  resolveSessionDesign,
  defaultDocumentSettings,
  hasBlockingIssue,
  migrateDocumentSettings,
  presetDesign,
  type SessionTemplate,
} from "@/modules/documents";
import { getOrganizationById } from "@/modules/organizations";
import { getAgeGroups, getObjectives, getSport, type SportDto } from "@/modules/sports";
import {
  readConfig as readTemplateConfig,
  resourceOf as templateResourceOf,
} from "@/modules/templates";
import { getSportModule } from "@/sports/registry";
import { migratePlanDetails } from "./details";
import { totalMinutes } from "./schedule";
import {
  buildDrillSnapshot,
  customSnapshotSchema,
  parseSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
} from "./snapshot";
import type {
  AddBreakInput,
  AddCustomActivityInput,
  AddDrillActivityInput,
  ApplyTemplateInput,
  PlanDocumentInput,
  PlanInput,
  ReorderActivitiesInput,
  UpdateActivityInput,
} from "./validators";

/**
 * WRITE side of the plans module. Each command: authorize (`can`) → resolve the sport's own catalog →
 * validate → ONE transaction (rows + audit event where one is due) → Result.
 *
 * The database enforces the same rules on its own (row-level security, composite foreign keys, CHECKs and
 * triggers in drizzle/0005_*.sql), so a bug here cannot leak or corrupt another workspace's data.
 *
 * Concurrency: every change to a session OR its timeline presents the version it read; the first statement
 * of the transaction bumps it (`WHERE version = <read>`), which both detects a stale editor (CONFLICT) and
 * locks the session row so concurrent edits queue up. A command that fails after that point rolls the whole
 * transaction back, the bump included (`inTx`).
 *
 * NOTHING DERIVED IS WRITTEN: no total, no end time, no timeline offsets — see schedule.ts.
 */

// ---------------------------------------------------------------------------------------------------
// plumbing
// ---------------------------------------------------------------------------------------------------

type PlanRow = {
  id: string;
  organizationId: string;
  createdBy: string | null;
  visibility: string;
  status: string;
  deletedAt: Date | null;
  version: number;
  targetMinutes: number;
  timezone: string | null;
  ageGroupId: string | null;
  ageMin: number | null;
  ageMax: number | null;
  documentSettings: unknown;
};

const resourceOf = (row: PlanRow): PlanResource => ({
  organizationId: row.organizationId,
  createdBy: row.createdBy,
  visibility: row.visibility as PlanVisibility,
  status: row.status,
});

/** RLS hides sessions the actor cannot read, so a missing row is "not found" — never a hint that it exists. */
async function loadPlanRow(tx: Tx, sportId: string, id: string): Promise<PlanRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select({
      id: plans.id,
      organizationId: plans.organizationId,
      createdBy: plans.createdBy,
      visibility: plans.visibility,
      status: plans.status,
      deletedAt: plans.deletedAt,
      version: plans.version,
      targetMinutes: plans.targetMinutes,
      timezone: plans.timezone,
      ageGroupId: plans.ageGroupId,
      ageMin: plans.ageMin,
      ageMax: plans.ageMax,
      documentSettings: plans.documentSettings,
    })
    .from(plans)
    .where(and(eq(plans.id, id), eq(plans.sportId, sportId)))
    .limit(1);
  return row ?? null;
}

/**
 * Open a session for editing: it exists (for this actor), is not deleted, the actor may change it, it is not
 * archived — and the version the caller read is still current. On success the version has been bumped.
 */
async function openForEdit(
  tx: Tx,
  actor: Actor,
  sportId: string,
  id: string,
  expectedVersion: number,
): Promise<Result<{ row: PlanRow; version: number }>> {
  const row = await loadPlanRow(tx, sportId, id);
  if (!row || row.deletedAt) return fail("NOT_FOUND");
  if (!can(actor, "plan:update", resourceOf(row)) || row.status === "archived")
    return fail("FORBIDDEN");
  const [bumped] = await tx
    .update(plans)
    .set({ version: sql`${plans.version} + 1`, updatedAt: new Date() })
    .where(and(eq(plans.id, id), eq(plans.version, expectedVersion)))
    .returning({ version: plans.version });
  if (!bumped) return fail("CONFLICT");
  return ok({ row, version: bumped.version });
}

/** A personal workspace has one member: "shared with the workspace" would be meaningless, so it stays private. */
async function effectiveVisibility(
  actor: Actor,
  requested: PlanVisibility,
): Promise<PlanVisibility> {
  const org = await getOrganizationById(actor.organizationId);
  return org?.type === "personal" ? "private" : requested;
}

/**
 * The session's zone: what the coach chose, else the one it already has, else the coach's own profile zone,
 * else UTC — but only a scheduled session NEEDS one.
 */
async function resolveTimezone(
  tx: Tx,
  actor: Actor,
  requested: string,
  existing: string | null,
  scheduled: boolean,
): Promise<string | null> {
  if (requested) return requested;
  if (existing) return existing;
  const [profile] = await tx
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.userId, actor.userId))
    .limit(1);
  return profile?.timezone ?? (scheduled ? "UTC" : null);
}

// ---------------------------------------------------------------------------------------------------
// the session itself
// ---------------------------------------------------------------------------------------------------

type Resolved = {
  ageGroupId: string | null;
  ageMin: number | null;
  ageMax: number | null;
  primaryObjectiveId: string | null;
  secondaryObjectiveIds: string[];
};

/** Everything that depends on WHICH sport this is: its age groups and its objectives. */
async function checkAgainstCatalog(
  sport: SportDto,
  input: PlanInput,
  /** On an update: the ages the session already has, kept when the age group is unchanged and no ages are sent. */
  existing?: { ageGroupId: string | null; ageMin: number | null; ageMax: number | null },
): Promise<Result<Resolved>> {
  const [groups, catalog] = await Promise.all([getAgeGroups(sport.id), getObjectives(sport.id)]);
  const errors: FieldErrors = {};

  const group = input.ageGroup ? groups.find((g) => g.key === input.ageGroup) : undefined;
  if (input.ageGroup && !group) errors.ageGroup = ["age_group_unknown"];

  const objective = (key: string) => catalog.find((o) => o.key === key);
  if (input.primaryObjective && !objective(input.primaryObjective))
    errors.primaryObjective = ["objective_unknown"];
  if (!input.secondaryObjectives.every((k) => objective(k)))
    errors.secondaryObjectives = ["objective_unknown"];

  if (Object.keys(errors).length > 0) return fail("VALIDATION", { fields: errors });
  return ok({
    ageGroupId: group?.id ?? null,
    // explicit ages always win; else the session keeps the exact ages it has while its age group is unchanged;
    // else choosing an age group fills in that group's typical ages
    ageMin:
      input.ageMin ??
      (existing && group && existing.ageGroupId === group.id ? existing.ageMin : null) ??
      group?.ageMin ??
      null,
    ageMax:
      input.ageMax ??
      (existing && group && existing.ageGroupId === group.id ? existing.ageMax : null) ??
      group?.ageMax ??
      null,
    primaryObjectiveId: input.primaryObjective ? objective(input.primaryObjective)!.id : null,
    secondaryObjectiveIds: input.secondaryObjectives.map((k) => objective(k)!.id),
  });
}

async function writeObjectives(tx: Tx, planId: string, sportId: string, r: Resolved) {
  const rows = [
    ...(r.primaryObjectiveId ? [{ objectiveId: r.primaryObjectiveId, role: "primary" }] : []),
    ...r.secondaryObjectiveIds.map((objectiveId) => ({ objectiveId, role: "secondary" })),
  ];
  if (rows.length)
    await tx.insert(planObjectives).values(rows.map((o) => ({ planId, sportId, ...o })));
}

const scheduleColumns = (input: PlanInput, timezone: string | null) => ({
  scheduledDate: input.scheduledDate || null,
  startTime: input.startTime || null,
  timezone,
});

export async function createPlan(
  actor: Actor,
  sportKey: string,
  input: PlanInput,
): Promise<Result<{ id: string; version: number }>> {
  if (!can(actor, "plan:create", { organizationId: actor.organizationId }))
    return fail("FORBIDDEN");
  const sport = await getSport(sportKey);
  const mod = getSportModule(sportKey);
  if (!sport || !mod) return fail("NOT_FOUND");
  const checked = await checkAgainstCatalog(sport, input);
  if (!checked.ok) return checked;
  const r = checked.data;
  const visibility = await effectiveVisibility(actor, input.visibility);
  const id = newId();

  return inTx(actor, async (tx) => {
    const timezone = await resolveTimezone(
      tx,
      actor,
      input.timezone,
      null,
      Boolean(input.scheduledDate),
    );
    let template: LoadedTemplate | null = null;
    if (input.templateId) {
      const loaded = await loadUsableTemplate(tx, actor, sport.id, input.templateId);
      if (!loaded.ok) return loaded;
      template = loaded.data;
    }
    await tx.insert(plans).values({
      id,
      organizationId: actor.organizationId,
      sportId: sport.id,
      createdBy: actor.userId,
      type: "training_session",
      title: input.title,
      status: "draft",
      visibility,
      teamName: input.teamName || null,
      ageGroupId: r.ageGroupId,
      ageMin: r.ageMin,
      ageMax: r.ageMax,
      level: input.level || null,
      players: input.players,
      targetMinutes: input.targetMinutes ?? mod.defaults.sessionMinutes,
      objective: input.objective,
      details: input.details,
      ...(template
        ? {
            documentSettings: settingsWithTemplate(defaultDocumentSettings(), template, "replace"),
            templateId: template.snapshot.id,
            templateRevision: template.snapshot.revision,
          }
        : {}),
      ...scheduleColumns(input, timezone),
    });
    await writeObjectives(tx, id, sport.id, r);
    await recordAuditInTx(tx, actor, {
      action: "plan.created",
      entityType: "plan",
      entityId: id,
      metadata: { sport: sport.key, ...(template ? { template: template.snapshot.id } : {}) },
    });
    return ok({ id, version: 1 });
  });
}

/** Replace the session's information, details and objectives. The timeline is untouched. */
export async function updatePlan(
  actor: Actor,
  sportKey: string,
  id: string,
  input: PlanInput,
): Promise<Result<{ id: string; version: number }>> {
  if (input.version === undefined) return fail("VALIDATION", { fields: { version: ["required"] } });
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  const visibility = await effectiveVisibility(actor, input.visibility);

  return inTx(actor, async (tx) => {
    const row = await loadPlanRow(tx, sport.id, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "plan:update", resourceOf(row)) || row.status === "archived")
      return fail("FORBIDDEN");
    // (needs the session's current ages, so it runs once the session is loaded; a failure rolls everything back)
    const checked = await checkAgainstCatalog(sport, input, row);
    if (!checked.ok) return checked;
    const r = checked.data;

    const timezone = await resolveTimezone(
      tx,
      actor,
      input.timezone,
      row.timezone,
      Boolean(input.scheduledDate),
    );
    const [updated] = await tx
      .update(plans)
      .set({
        title: input.title,
        visibility,
        teamName: input.teamName || null,
        ageGroupId: r.ageGroupId,
        ageMin: r.ageMin,
        ageMax: r.ageMax,
        level: input.level || null,
        players: input.players,
        targetMinutes: input.targetMinutes ?? row.targetMinutes,
        objective: input.objective,
        details: input.details,
        ...scheduleColumns(input, timezone),
        version: sql`${plans.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(plans.id, id), eq(plans.version, input.version!)))
      .returning({ version: plans.version });
    if (!updated) return fail("CONFLICT");

    await tx.delete(planObjectives).where(eq(planObjectives.planId, id));
    await writeObjectives(tx, id, sport.id, r);
    await recordAuditInTx(tx, actor, {
      action: "plan.updated",
      entityType: "plan",
      entityId: id,
      metadata: { sport: sport.key },
    });
    return ok({ id, version: updated.version });
  });
}

// ---- saved templates ------------------------------------------------------------------------------

type LoadedTemplate = { snapshot: SessionTemplate };

/** A template this actor can read, in this sport, that is live and not archived: the only kind that can be applied. */
async function loadUsableTemplate(
  tx: Tx,
  actor: Actor,
  sportId: string,
  templateId: string,
): Promise<Result<LoadedTemplate>> {
  if (!isUuid(templateId)) return fail("NOT_FOUND");
  const [row] = await tx
    .select()
    .from(documentTemplates)
    .where(and(eq(documentTemplates.id, templateId), eq(documentTemplates.sportId, sportId)))
    .limit(1);
  if (!row || row.deletedAt) return fail("NOT_FOUND");
  if (!can(actor, "template:read", templateResourceOf(row))) return fail("NOT_FOUND");
  if (row.status !== "active")
    return fail("VALIDATION", { fields: { templateId: ["template_archived"] } });
  const config = readTemplateConfig(row.id, row.config);
  return ok({
    snapshot: {
      id: row.id,
      revision: row.revision,
      name: row.name,
      preset: config.preset,
      design: config.design,
    },
  });
}

/**
 * The session's settings after a template is applied: the template's preset becomes the base, its layer is frozen in,
 * and the session's own changes are either cleared ("replace") or kept on top ("keep" — they win, as overrides do).
 * The reflection text, which is session content, is never touched.
 */
function settingsWithTemplate(
  current: ReturnType<typeof defaultDocumentSettings>,
  template: LoadedTemplate,
  mode: "replace" | "keep",
) {
  return documentSettingsSchema.parse({
    preset: template.snapshot.preset,
    template: template.snapshot,
    overrides: mode === "keep" ? current.overrides : {},
    reflection: current.reflection,
  });
}

/** Does the session already have a design of its own that applying a template could replace? */
const hasOwnDesign = (s: ReturnType<typeof defaultDocumentSettings>) =>
  s.template !== null || Object.keys(s.overrides).length > 0 || s.preset !== "classic";

/**
 * Apply a saved template to a session: its design becomes the session's (frozen, with the template's id and revision
 * recorded), and NOTHING else changes — not the activities, date, times, number, notes or the reflection text. When
 * the session already has a design of its own the command insists on confirmation (`confirmed`); "keep" mode
 * applies the template but keeps the session's own changes on top.
 */
export async function applyTemplateToPlan(
  actor: Actor,
  sportKey: string,
  id: string,
  input: ApplyTemplateInput,
): Promise<Result<{ id: string; version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const row = await loadPlanRow(tx, sport.id, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "plan:update", resourceOf(row)) || row.status === "archived")
      return fail("FORBIDDEN");
    if (row.version !== input.version) return fail("CONFLICT");
    const template = await loadUsableTemplate(tx, actor, sport.id, input.templateId);
    if (!template.ok) return template;

    const current = migrateDocumentSettings(row.documentSettings) ?? defaultDocumentSettings();
    if (hasOwnDesign(current) && !input.confirmed)
      return fail("VALIDATION", { fields: { confirmed: ["confirmation_required"] } });

    const [updated] = await tx
      .update(plans)
      .set({
        documentSettings: settingsWithTemplate(current, template.data, input.mode),
        templateId: template.data.snapshot.id,
        templateRevision: template.data.snapshot.revision,
        version: sql`${plans.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(plans.id, id), eq(plans.version, input.version)))
      .returning({ version: plans.version });
    if (!updated) return fail("CONFLICT");
    await recordAuditInTx(tx, actor, {
      action: "plan.template_applied",
      entityType: "plan",
      entityId: id,
      metadata: {
        sport: sport.key,
        template: template.data.snapshot.id,
        revision: template.data.snapshot.revision,
        mode: input.mode,
      },
    });
    return ok({ id, version: updated.version });
  });
}

/**
 * Stop basing a session on its template. The session looks exactly as it did: the template's layer is folded into the
 * session's own changes, and only the link (and the "update available" nudge) goes away.
 */
export async function detachTemplateFromPlan(
  actor: Actor,
  sportKey: string,
  id: string,
  version: number,
): Promise<Result<{ id: string; version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const row = await loadPlanRow(tx, sport.id, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "plan:update", resourceOf(row)) || row.status === "archived")
      return fail("FORBIDDEN");
    if (row.version !== version) return fail("CONFLICT");
    const current = migrateDocumentSettings(row.documentSettings) ?? defaultDocumentSettings();
    if (!current.template) return ok({ id, version: row.version });

    const settings = documentSettingsSchema.parse({
      ...current,
      template: null,
      overrides: diffDesign(presetDesign(current.preset), resolveSessionDesign(current)),
    });
    const [updated] = await tx
      .update(plans)
      .set({
        documentSettings: settings,
        templateId: null,
        templateRevision: null,
        version: sql`${plans.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(plans.id, id), eq(plans.version, version)))
      .returning({ version: plans.version });
    if (!updated) return fail("CONFLICT");
    await recordAuditInTx(tx, actor, {
      action: "plan.template_detached",
      entityType: "plan",
      entityId: id,
      metadata: { sport: sport.key, template: current.template.id },
    });
    return ok({ id, version: updated.version });
  });
}

/**
 * Save how the session prints. What is stored is the preset and only what the coach changed on top of it (never
 * the whole design), plus the reflection text. A design whose text cannot be read on its background is refused —
 * the design form says so first, this is the rule itself. Not audited: it is a cosmetic edit of the same
 * session, like moving an activity (which is not audited either).
 */
export async function savePlanDocument(
  actor: Actor,
  sportKey: string,
  id: string,
  input: PlanDocumentInput,
): Promise<Result<{ id: string; version: number }>> {
  const issues = checkDesign(input.design);
  if (hasBlockingIssue(issues)) {
    return fail("VALIDATION", { fields: { "design.colors.text": ["text_unreadable"] } });
  }
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");

  return inTx(actor, async (tx) => {
    const row = await loadPlanRow(tx, sport.id, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "plan:update", resourceOf(row)) || row.status === "archived")
      return fail("FORBIDDEN");
    // The template layer is the one the session ALREADY holds (frozen when it was applied) — never something the
    // browser sends. What is stored on top of Preset → Template is only what this design changes.
    const current = migrateDocumentSettings(row.documentSettings) ?? defaultDocumentSettings();
    const settings = documentSettingsSchema.parse({
      preset: input.preset,
      template: current.template,
      overrides: diffDesign(
        resolveSessionDesign({
          preset: input.preset,
          template: current.template,
          overrides: {},
        }),
        input.design,
      ),
      reflection: input.reflection,
    });
    const [updated] = await tx
      .update(plans)
      .set({
        documentSettings: settings,
        version: sql`${plans.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(plans.id, id), eq(plans.version, input.version)))
      .returning({ version: plans.version });
    if (!updated) return fail("CONFLICT");
    return ok({ id, version: updated.version });
  });
}

/** draft ⇄ published ⇄ archived. Archiving freezes the session (the database refuses edits) until it is moved out again. */
export async function setPlanStatus(
  actor: Actor,
  sportKey: string,
  id: string,
  status: PlanStatus,
  version: number,
): Promise<Result<{ id: string; version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const row = await loadPlanRow(tx, sport.id, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "plan:update", resourceOf(row))) return fail("FORBIDDEN");
    if (row.version !== version) return fail("CONFLICT");
    if (row.status === status) return ok({ id, version: row.version });

    const [updated] = await tx
      .update(plans)
      .set({ status, version: sql`${plans.version} + 1`, updatedAt: new Date() })
      .where(and(eq(plans.id, id), eq(plans.version, version)))
      .returning({ version: plans.version });
    if (!updated) return fail("CONFLICT");
    await recordAuditInTx(tx, actor, {
      action: "plan.status_changed",
      entityType: "plan",
      entityId: id,
      metadata: { sport: sport.key, from: row.status, to: status },
    });
    return ok({ id, version: updated.version });
  });
}

/** Soft delete: the row stays (restorable, and history stays intact); every normal list and lookup stops showing it. */
export async function deletePlan(
  actor: Actor,
  sportKey: string,
  id: string,
): Promise<Result<{ id: string }>> {
  return setDeleted(actor, sportKey, id, true);
}

export async function restorePlan(
  actor: Actor,
  sportKey: string,
  id: string,
): Promise<Result<{ id: string }>> {
  return setDeleted(actor, sportKey, id, false);
}

async function setDeleted(
  actor: Actor,
  sportKey: string,
  id: string,
  deleted: boolean,
): Promise<Result<{ id: string }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const row = await loadPlanRow(tx, sport.id, id);
    if (!row) return fail("NOT_FOUND");
    if (!can(actor, "plan:delete", resourceOf(row))) return fail("FORBIDDEN");
    if ((row.deletedAt !== null) === deleted) return ok({ id }); // already in the wanted state
    await tx
      .update(plans)
      .set({
        deletedAt: deleted ? new Date() : null,
        version: sql`${plans.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, id));
    await recordAuditInTx(tx, actor, {
      action: deleted ? "plan.deleted" : "plan.restored",
      entityType: "plan",
      entityId: id,
      metadata: { sport: sport.key },
    });
    return ok({ id });
  });
}

// ---------------------------------------------------------------------------------------------------
// the timeline
// ---------------------------------------------------------------------------------------------------

type TimelineRow = { id: string; durationMin: number };

const timelineOf = (tx: Tx, planId: string): Promise<TimelineRow[]> =>
  tx
    .select({ id: planActivities.id, durationMin: planActivities.durationMin })
    .from(planActivities)
    .where(eq(planActivities.planId, planId))
    .orderBy(asc(planActivities.position));

/**
 * Give the activities the positions 0…n−1 in the order given. ONE statement: the unique (plan, position)
 * constraint is deferrable and checked when the statement ends, so any permutation — a swap included — is fine.
 */
async function writePositions(tx: Tx, orderedIds: string[]) {
  if (orderedIds.length === 0) return;
  const values = sql.join(
    orderedIds.map((id, i) => sql`(${id}::uuid, ${i}::smallint)`),
    sql`, `,
  );
  await tx.execute(
    sql`UPDATE plan_activities AS a SET position = v.pos FROM (VALUES ${values}) AS v(id, pos) WHERE a.id = v.id`,
  );
}

const tooLong = (): Result<never> =>
  fail("VALIDATION", { fields: { durationMin: ["session_too_long"] } });

type NewActivity = {
  kind: ActivityKind;
  phase: string | null;
  title: string;
  durationMin: number;
  repetitions: number | null;
  players: number | null;
  notes: string;
  sourceDrillId?: string | null;
  sourceDrillVersion?: number | null;
  snapshot?: unknown;
  changeReason?: string | null;
};

/** Append (or insert at `position`) one activity, keeping the timeline within its limits and positions gap-free. */
async function insertActivity(
  tx: Tx,
  planId: string,
  sportId: string,
  a: NewActivity,
  position: number | undefined,
): Promise<Result<{ id: string }>> {
  const existing = await timelineOf(tx, planId);
  if (existing.length >= PLAN_LIMITS.maxActivities)
    return fail("VALIDATION", { fields: { activities: ["session_too_many"] } });
  if (totalMinutes(existing) + a.durationMin > PLAN_LIMITS.maxSessionMinutes) return tooLong();

  const id = newId();
  await tx.insert(planActivities).values({
    id,
    planId,
    sportId,
    position: existing.length, // appended first (always free), then moved into place below
    kind: a.kind,
    phase: a.phase,
    title: a.title,
    durationMin: a.durationMin,
    repetitions: a.repetitions,
    players: a.players,
    notes: a.notes,
    sourceDrillId: a.sourceDrillId ?? null,
    sourceDrillVersion: a.sourceDrillVersion ?? null,
    snapshot: a.snapshot ?? null,
    changeReason: a.changeReason ?? null,
  });
  const order = existing.map((e) => e.id);
  const at = Math.min(Math.max(position ?? order.length, 0), order.length);
  if (at < order.length) {
    order.splice(at, 0, id);
    await writePositions(tx, order);
  }
  return ok({ id });
}

/**
 * Add a drill to the timeline AS A COPY. The drill is read as the actor sees it right now (so an unreadable,
 * archived or foreign drill is simply "not found"), copied into a validated, versioned snapshot, and from then
 * on the activity never looks at the library again unless the coach asks (`replaceActivityDrill`).
 */
export async function addDrillActivity(
  actor: Actor,
  sportKey: string,
  planId: string,
  input: AddDrillActivityInput,
): Promise<Result<{ id: string; version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  const drill = await getDrill(actor, sportKey, input.drillId);
  if (!drill || drill.status !== "published") return fail("NOT_FOUND");
  const snapshot = buildDrillSnapshot(drill, new Date());

  return inTx(actor, async (tx) => {
    const opened = await openForEdit(tx, actor, sport.id, planId, input.version);
    if (!opened.ok) return opened;
    const added = await insertActivity(
      tx,
      planId,
      sport.id,
      {
        kind: "drill",
        phase: input.phase === undefined ? (drill.phases[0] ?? null) : input.phase,
        title: snapshot.title,
        durationMin: input.durationMin ?? Math.round((drill.durationMin + drill.durationMax) / 2),
        repetitions: input.repetitions,
        players: input.players,
        notes: input.notes,
        sourceDrillId: drill.id,
        sourceDrillVersion: drill.version,
        snapshot,
      },
      input.position,
    );
    if (!added.ok) return added;
    return ok({ id: added.data.id, version: opened.data.version });
  });
}

/** A coach-written activity ("Team talk", "Film") — its text lives in the same versioned snapshot column. */
export async function addCustomActivity(
  actor: Actor,
  sportKey: string,
  planId: string,
  input: AddCustomActivityInput,
): Promise<Result<{ id: string; version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const opened = await openForEdit(tx, actor, sport.id, planId, input.version);
    if (!opened.ok) return opened;
    const added = await insertActivity(
      tx,
      planId,
      sport.id,
      {
        kind: "custom",
        phase: input.phase,
        title: input.title,
        durationMin: input.durationMin,
        repetitions: input.repetitions,
        players: input.players,
        notes: input.notes,
        snapshot: customSnapshotSchema.parse({
          schemaVersion: SNAPSHOT_SCHEMA_VERSION,
          ...input.content,
        }),
      },
      input.position,
    );
    if (!added.ok) return added;
    return ok({ id: added.data.id, version: opened.data.version });
  });
}

export async function addBreak(
  actor: Actor,
  sportKey: string,
  planId: string,
  input: AddBreakInput,
): Promise<Result<{ id: string; version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const opened = await openForEdit(tx, actor, sport.id, planId, input.version);
    if (!opened.ok) return opened;
    const added = await insertActivity(
      tx,
      planId,
      sport.id,
      {
        kind: "break",
        phase: null,
        title: input.title,
        durationMin: input.durationMin,
        repetitions: null,
        players: null,
        notes: input.notes,
      },
      input.position,
    );
    if (!added.ok) return added;
    return ok({ id: added.data.id, version: opened.data.version });
  });
}

type ActivityRow = {
  id: string;
  kind: string;
  durationMin: number;
  sourceDrillId: string | null;
  snapshot: unknown;
};

async function loadActivity(tx: Tx, planId: string, id: string): Promise<ActivityRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select({
      id: planActivities.id,
      kind: planActivities.kind,
      durationMin: planActivities.durationMin,
      sourceDrillId: planActivities.sourceDrillId,
      snapshot: planActivities.snapshot,
    })
    .from(planActivities)
    .where(and(eq(planActivities.id, id), eq(planActivities.planId, planId)))
    .limit(1);
  return row ?? null;
}

/** Zod issues on an edited snapshot → field errors `content.<path>`. */
const contentErrors = (issues: Array<{ path: PropertyKey[] }>): FieldErrors => {
  const fields: FieldErrors = {};
  for (const i of issues)
    fields[["content", ...i.path.map(String)].join(".")] = ["content_invalid"];
  return Object.keys(fields).length ? fields : { content: ["content_invalid"] };
};

/**
 * Change one activity (duration, players, notes, phase, title, or a partial edit of the copied content).
 * Editing the copied content marks the activity `customized`: from then on updating it from the library is a
 * deliberate replacement, never a silent overwrite.
 */
export async function updateActivity(
  actor: Actor,
  sportKey: string,
  planId: string,
  activityId: string,
  input: UpdateActivityInput,
): Promise<Result<{ id: string; version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const opened = await openForEdit(tx, actor, sport.id, planId, input.version);
    if (!opened.ok) return opened;
    const current = await loadActivity(tx, planId, activityId);
    if (!current) return fail("NOT_FOUND");
    const kind = current.kind as ActivityKind;

    if (input.durationMin !== undefined) {
      const others = (await timelineOf(tx, planId)).filter((a) => a.id !== activityId);
      if (totalMinutes(others) + input.durationMin > PLAN_LIMITS.maxSessionMinutes)
        return tooLong();
    }

    let snapshot: unknown;
    let customized: boolean | undefined;
    if (input.content !== undefined) {
      if (kind === "break") return fail("VALIDATION", { fields: { content: ["invalid"] } });
      const stored = parseSnapshot(kind, current.snapshot);
      if (!stored.ok || !stored.data)
        return fail("VALIDATION", { fields: { content: ["invalid"] } });
      if ("provenance" in stored.data) {
        // a drill's copy: the edit is checked against the drill content rules as a whole
        const content = drillContentSchema.safeParse({ ...stored.data.content, ...input.content });
        if (!content.success)
          return fail("VALIDATION", { fields: contentErrors(content.error.issues) });
        snapshot = { ...stored.data, content: content.data };
        customized = JSON.stringify(content.data) !== JSON.stringify(stored.data.content);
      } else {
        const custom = customSnapshotSchema.safeParse({
          ...stored.data,
          ...input.content,
          schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        });
        if (!custom.success)
          return fail("VALIDATION", { fields: contentErrors(custom.error.issues) });
        snapshot = custom.data;
      }
    }

    await tx
      .update(planActivities)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.phase !== undefined && { phase: kind === "break" ? null : input.phase }),
        ...(input.durationMin !== undefined && { durationMin: input.durationMin }),
        ...(input.repetitions !== undefined && { repetitions: input.repetitions }),
        ...(input.players !== undefined && { players: input.players }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.changeReason !== undefined && { changeReason: input.changeReason || null }),
        ...(snapshot !== undefined && { snapshot }),
        ...(customized && { customized: true }),
        updatedAt: new Date(),
      })
      .where(eq(planActivities.id, activityId));
    return ok({ id: activityId, version: opened.data.version });
  });
}

/**
 * The coach's DELIBERATE choice to refresh or swap a drill: re-copy `drillId` (default: this activity's own
 * source) as it is right now. Duration, players, notes and position are kept; the copied content is replaced,
 * `customized` is cleared, and the reason is recorded. Nothing ever does this automatically.
 */
export async function replaceActivityDrill(
  actor: Actor,
  sportKey: string,
  planId: string,
  activityId: string,
  input: { drillId?: string; changeReason?: string; version: number },
): Promise<Result<{ id: string; version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");

  // read the target drill first (its own, read-only transaction) — as the actor, through the drills policies
  const peek = await tenantTx(actor, (tx) => loadActivity(tx, planId, activityId));
  if (!peek) return fail("NOT_FOUND");
  if (peek.kind !== "drill") return fail("VALIDATION", { fields: { kind: ["invalid"] } });
  const drillId = input.drillId ?? peek.sourceDrillId;
  if (!drillId) return fail("VALIDATION", { fields: { drillId: ["required"] } });
  const drill = await getDrill(actor, sportKey, drillId);
  if (!drill || drill.status !== "published") return fail("NOT_FOUND");
  const snapshot = buildDrillSnapshot(drill, new Date());

  return inTx(actor, async (tx) => {
    const opened = await openForEdit(tx, actor, sport.id, planId, input.version);
    if (!opened.ok) return opened;
    const current = await loadActivity(tx, planId, activityId);
    if (!current || current.kind !== "drill") return fail("NOT_FOUND");
    await tx
      .update(planActivities)
      .set({
        title: snapshot.title,
        sourceDrillId: drill.id,
        sourceDrillVersion: drill.version,
        snapshot,
        customized: false,
        changeReason: input.changeReason?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(planActivities.id, activityId));
    return ok({ id: activityId, version: opened.data.version });
  });
}

export async function removeActivity(
  actor: Actor,
  sportKey: string,
  planId: string,
  activityId: string,
  version: number,
): Promise<Result<{ version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const opened = await openForEdit(tx, actor, sport.id, planId, version);
    if (!opened.ok) return opened;
    const deleted = await tx
      .delete(planActivities)
      .where(and(eq(planActivities.id, activityId), eq(planActivities.planId, planId)))
      .returning({ id: planActivities.id });
    if (deleted.length === 0) return fail("NOT_FOUND");
    await writePositions(
      tx,
      (await timelineOf(tx, planId)).map((a) => a.id),
    ); // close the gap
    return ok({ version: opened.data.version });
  });
}

/** Set the whole order at once (what a drag-and-drop ends with). The ids must be exactly the current activities. */
export async function reorderActivities(
  actor: Actor,
  sportKey: string,
  planId: string,
  input: ReorderActivitiesInput,
): Promise<Result<{ version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const opened = await openForEdit(tx, actor, sport.id, planId, input.version);
    if (!opened.ok) return opened;
    const current = (await timelineOf(tx, planId)).map((a) => a.id);
    const wanted = new Set(input.orderedIds);
    if (
      wanted.size !== input.orderedIds.length ||
      wanted.size !== current.length ||
      !current.every((id) => wanted.has(id))
    )
      return fail("VALIDATION", { fields: { orderedIds: ["order_mismatch"] } });
    await writePositions(tx, input.orderedIds);
    return ok({ version: opened.data.version });
  });
}

// ---------------------------------------------------------------------------------------------------
// duplicating
// ---------------------------------------------------------------------------------------------------

/**
 * The drills, among `ids`, that the ACTOR can read right now (row-level security decides). A copied activity may
 * only keep its link to a source drill the copier can read; otherwise it keeps its snapshot and loses the link.
 */
async function readableDrillIds(tx: Tx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx.select({ id: drills.id }).from(drills).where(inArray(drills.id, ids));
  return new Set(rows.map((r) => r.id));
}

/**
 * Copy a session the actor can read into a NEW private draft of their own: new id, new objectives rows, new
 * activity rows — each with its own copy of the snapshot, so editing the copy can never touch the original.
 * The copy is "Copy of …", unscheduled (a duplicate is normally for another day: date, start time and session
 * number are cleared; the zone is kept) and remembers where it came from (`forked_from_id`).
 */
/**
 * The design a copy of a session starts with: the same look, a clean reflection. If the session was based on a saved
 * template the copy keeps the link when the copier can read that template; otherwise the template's layer is BAKED
 * INTO the copy's own overrides, so it looks the same and simply has no template.
 */
async function copiedDocumentSettings(
  tx: Tx,
  raw: unknown,
  templateId: string | null,
  templateRevision: number | null,
) {
  const none = { settings: {}, templateId: null, templateRevision: null };
  // never customised stays never customised (the column's default), not a frozen copy of today's defaults
  if (typeof raw === "object" && raw !== null && Object.keys(raw).length === 0) return none;
  const source = migrateDocumentSettings(raw);
  if (!source) return none;
  const settings = { ...source, reflection: emptyReflection() };
  if (!source.template) return { settings, templateId: null, templateRevision: null };
  if (templateId) {
    const [visible] = await tx
      .select({ id: documentTemplates.id })
      .from(documentTemplates)
      .where(eq(documentTemplates.id, templateId))
      .limit(1);
    if (visible) return { settings, templateId, templateRevision };
  }
  return {
    settings: {
      ...settings,
      template: null,
      overrides: diffDesign(presetDesign(source.preset), resolveSessionDesign(source)),
    },
    templateId: null,
    templateRevision: null,
  };
}

export async function duplicatePlan(
  actor: Actor,
  sportKey: string,
  id: string,
): Promise<Result<{ id: string; version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  const newPlanId = newId();

  return inTx(actor, async (tx) => {
    if (!isUuid(id)) return fail("NOT_FOUND");
    const [source] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.id, id), eq(plans.sportId, sport.id)))
      .limit(1);
    if (!source || source.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "plan:duplicate", resourceOf(source))) return fail("FORBIDDEN");
    const details = migratePlanDetails(source.details);
    if (!details) return fail("NOT_FOUND");

    const copy = await copiedDocumentSettings(
      tx,
      source.documentSettings,
      source.templateId,
      source.templateRevision,
    );
    await tx.insert(plans).values({
      id: newPlanId,
      organizationId: actor.organizationId,
      sportId: sport.id,
      createdBy: actor.userId,
      type: source.type,
      title: `Copy of ${source.title}`.slice(0, 120),
      status: "draft",
      visibility: "private",
      teamName: source.teamName,
      ageGroupId: source.ageGroupId,
      ageMin: source.ageMin,
      ageMax: source.ageMax,
      level: source.level,
      players: source.players,
      targetMinutes: source.targetMinutes,
      objective: source.objective,
      scheduledDate: null,
      startTime: null,
      timezone: source.timezone,
      details: { ...details, sessionNumber: null },
      // the copy prints the way the original does; the reflection belongs to the session that was run, so it starts empty
      documentSettings: copy.settings,
      templateId: copy.templateId,
      templateRevision: copy.templateRevision,
      forkedFromId: source.id,
    });

    const objectiveRows = await tx
      .select()
      .from(planObjectives)
      .where(eq(planObjectives.planId, source.id));
    if (objectiveRows.length)
      await tx.insert(planObjectives).values(
        objectiveRows.map((o) => ({
          planId: newPlanId,
          objectiveId: o.objectiveId,
          sportId: o.sportId,
          role: o.role,
        })),
      );

    const activities = await tx
      .select()
      .from(planActivities)
      .where(eq(planActivities.planId, source.id))
      .orderBy(asc(planActivities.position));
    const readable = await readableDrillIds(
      tx,
      activities.flatMap((a) => (a.sourceDrillId ? [a.sourceDrillId] : [])),
    );
    if (activities.length)
      await tx.insert(planActivities).values(
        activities.map((a) => ({
          id: newId(),
          planId: newPlanId,
          sportId: a.sportId,
          position: a.position,
          phase: a.phase,
          kind: a.kind,
          title: a.title,
          durationMin: a.durationMin,
          repetitions: a.repetitions,
          players: a.players,
          notes: a.notes,
          sourceDrillId: a.sourceDrillId && readable.has(a.sourceDrillId) ? a.sourceDrillId : null,
          sourceDrillVersion: a.sourceDrillVersion,
          snapshot: a.snapshot,
          customized: a.customized,
          changeReason: a.changeReason,
        })),
      );

    await recordAuditInTx(tx, actor, {
      action: "plan.duplicated",
      entityType: "plan",
      entityId: newPlanId,
      metadata: { sport: sport.key, from: source.id },
    });
    return ok({ id: newPlanId, version: 1 });
  });
}

/** Copy one activity right after itself (its own snapshot copy, so the two can be edited independently). */
export async function duplicateActivity(
  actor: Actor,
  sportKey: string,
  planId: string,
  activityId: string,
  version: number,
): Promise<Result<{ id: string; version: number }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const opened = await openForEdit(tx, actor, sport.id, planId, version);
    if (!opened.ok) return opened;
    if (!isUuid(activityId)) return fail("NOT_FOUND");
    const [a] = await tx
      .select()
      .from(planActivities)
      .where(and(eq(planActivities.id, activityId), eq(planActivities.planId, planId)))
      .limit(1);
    if (!a) return fail("NOT_FOUND");
    const readable = await readableDrillIds(tx, a.sourceDrillId ? [a.sourceDrillId] : []);
    const added = await insertActivity(
      tx,
      planId,
      sport.id,
      {
        kind: a.kind as ActivityKind,
        phase: a.phase,
        title: a.title,
        durationMin: a.durationMin,
        repetitions: a.repetitions,
        players: a.players,
        notes: a.notes,
        sourceDrillId: a.sourceDrillId && readable.has(a.sourceDrillId) ? a.sourceDrillId : null,
        sourceDrillVersion: a.sourceDrillVersion,
        snapshot: a.snapshot,
        changeReason: a.changeReason,
      },
      a.position + 1,
    );
    if (!added.ok) return added;
    if (a.customized)
      await tx
        .update(planActivities)
        .set({ customized: true })
        .where(eq(planActivities.id, added.data.id));
    return ok({ id: added.data.id, version: opened.data.version });
  });
}
