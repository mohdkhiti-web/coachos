import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { drillDiagrams, drillEquipment, drills, drillSkills } from "@/db/schema";
import { DIAGRAM_SCHEMA_VERSION, validateDiagram } from "@/engines/diagram";
import { can, type Actor, type DrillResource } from "@/lib/authz/can";
import type { Tx } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import { fail, ok, type FieldErrors, type Result } from "@/lib/result";
import { recordAuditInTx } from "@/modules/audit";
import { getOrganizationById } from "@/modules/organizations";
import { getSport, getTaxonomy, type SportDto, type Taxonomy } from "@/modules/sports";
import { getCourtPack, getSportModule } from "@/sports/registry";
import { getDrill } from "./queries";
import type { DrillInput } from "./validators";

/**
 * WRITE side of the drill module. Each command: authorize (`can`) → resolve the sport's own catalog →
 * validate everything sport-specific → one transaction (rows + audit event) → Result.
 * The database enforces the same ownership rules independently (row-level security, composite FKs),
 * so a bug here cannot leak or corrupt another tenant's data.
 */

type Resolved = {
  categoryId: string;
  primarySkillId: string;
  secondarySkillIds: string[];
  equipment: Array<{ id: string; rule: "fixed" | "per_player" | "per_pair"; quantity: number }>;
};

/** Everything that depends on WHICH sport this is: catalog keys, allowed spaces, diagram courts and vocabulary. */
function checkSport(sport: SportDto, taxonomy: Taxonomy, input: DrillInput): Result<Resolved> {
  const errors: FieldErrors = {};
  const mod = getSportModule(sport.key);
  if (!mod) return fail("NOT_FOUND");

  const category = taxonomy.categories.find((c) => c.key === input.category);
  if (!category) errors.category = ["invalid"];
  const primary = taxonomy.skills.find((s) => s.key === input.primarySkill);
  if (!primary) errors.primarySkill = ["invalid"];
  const secondary = input.secondarySkills.map((k) => taxonomy.skills.find((s) => s.key === k));
  if (secondary.some((s) => !s)) errors.secondarySkills = ["invalid"];
  const equipment = input.equipment.map((e) => ({
    item: taxonomy.equipment.find((t) => t.key === e.type),
    e,
  }));
  if (equipment.some((x) => !x.item)) errors.equipment = ["invalid"];
  if (!mod.spaces.includes(input.space)) errors.space = ["invalid"];

  input.diagrams.forEach((g, i) => {
    const d = g.diagram;
    const pack = d.sport === sport.key ? getCourtPack(d.sport, d.court) : undefined;
    if (!pack) {
      errors[`diagrams.${i}`] = ["diagram_court_unknown"];
      return;
    }
    const codes = [...new Set(validateDiagram(d, pack).map((issue) => `diagram_${issue.code}`))];
    if (codes.length) errors[`diagrams.${i}`] = codes;
  });

  if (Object.keys(errors).length > 0) return fail("VALIDATION", { fields: errors });
  return ok({
    categoryId: category!.id,
    primarySkillId: primary!.id,
    secondarySkillIds: secondary.map((s) => s!.id),
    equipment: equipment.map(({ item, e }) => ({
      id: item!.id,
      rule: e.rule,
      quantity: e.quantity,
    })),
  });
}

async function writeChildren(
  tx: Tx,
  drillId: string,
  sportId: string,
  input: DrillInput,
  r: Resolved,
) {
  await tx
    .insert(drillSkills)
    .values([
      { drillId, skillId: r.primarySkillId, sportId, role: "primary" },
      ...r.secondarySkillIds.map((skillId) => ({ drillId, skillId, sportId, role: "secondary" })),
    ]);
  if (r.equipment.length) {
    await tx.insert(drillEquipment).values(
      r.equipment.map((e) => ({
        drillId,
        equipmentTypeId: e.id,
        rule: e.rule,
        quantity: e.quantity,
      })),
    );
  }
  if (input.diagrams.length) {
    await tx.insert(drillDiagrams).values(
      input.diagrams.map((g, position) => ({
        id: newId(),
        drillId,
        position,
        title: g.title,
        schemaVersion: DIAGRAM_SCHEMA_VERSION,
        data: g.diagram,
      })),
    );
  }
}

const rowValues = (input: DrillInput, r: Resolved, visibility: "private" | "organization") => ({
  categoryId: r.categoryId,
  title: input.title,
  description: input.description,
  visibility,
  level: input.level,
  ageMin: input.ageMin,
  ageMax: input.ageMax,
  playersMin: input.playersMin,
  playersMax: input.playersMax,
  durationMin: input.durationMin,
  durationMax: input.durationMax,
  space: input.space,
  tags: input.tags,
  content: input.content,
  sourceKind: input.sourceKind,
  sourceName: input.sourceName || null,
  sourceUrl: input.sourceUrl || null,
});

/** A personal workspace has one member: "shared with the workspace" would be meaningless, so it stays private. */
async function effectiveVisibility(
  actor: Actor,
  requested: "private" | "organization",
): Promise<"private" | "organization"> {
  const org = await getOrganizationById(actor.organizationId);
  return org?.type === "personal" ? "private" : requested;
}

async function insertDrill(
  actor: Actor,
  sport: SportDto,
  input: DrillInput,
  r: Resolved,
  extra: { forkedFromId?: string; auditAction: "drill.created" | "drill.duplicated" },
): Promise<{ id: string }> {
  const visibility = await effectiveVisibility(actor, input.visibility);
  const id = newId();
  await tenantTx(actor, async (tx) => {
    await tx.insert(drills).values({
      id,
      organizationId: actor.organizationId,
      sportId: sport.id,
      createdBy: actor.userId,
      forkedFromId: extra.forkedFromId ?? null,
      ...rowValues(input, r, visibility),
    });
    await writeChildren(tx, id, sport.id, input, r);
    await recordAuditInTx(tx, actor, {
      action: extra.auditAction,
      entityType: "drill",
      entityId: id,
      metadata: {
        sport: sport.key,
        ...(extra.forkedFromId ? { forkedFrom: extra.forkedFromId } : {}),
      },
    });
  });
  return { id };
}

export async function createDrill(
  actor: Actor,
  sportKey: string,
  input: DrillInput,
): Promise<Result<{ id: string }>> {
  if (!can(actor, "drill:create", { organizationId: actor.organizationId }))
    return fail("FORBIDDEN");
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  const checked = checkSport(sport, await getTaxonomy(sport.id), input);
  if (!checked.ok) return checked;
  return ok(await insertDrill(actor, sport, input, checked.data, { auditAction: "drill.created" }));
}

export async function updateDrill(
  actor: Actor,
  sportKey: string,
  id: string,
  input: DrillInput,
): Promise<Result<{ id: string }>> {
  if (input.version === undefined) return fail("VALIDATION", { fields: { version: ["required"] } });
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  const checked = checkSport(sport, await getTaxonomy(sport.id), input);
  if (!checked.ok) return checked;
  const visibility = await effectiveVisibility(actor, input.visibility);

  return tenantTx(actor, async (tx): Promise<Result<{ id: string }>> => {
    // RLS hides drills the actor cannot see → "not found", never "forbidden" (no existence oracle, §6.3)
    const [row] = await tx
      .select({
        organizationId: drills.organizationId,
        createdBy: drills.createdBy,
        visibility: drills.visibility,
        status: drills.status,
      })
      .from(drills)
      .where(and(eq(drills.id, id), eq(drills.sportId, sport.id)))
      .limit(1);
    if (!row) return fail("NOT_FOUND");
    const resource: DrillResource = {
      organizationId: row.organizationId,
      createdBy: row.createdBy,
      visibility: row.visibility as DrillResource["visibility"],
      status: row.status,
    };
    if (row.status === "archived" || !can(actor, "drill:update", resource))
      return fail("FORBIDDEN");

    // optimistic concurrency: only update the version the editor actually loaded
    const updated = await tx
      .update(drills)
      .set({
        ...rowValues(input, checked.data, visibility),
        version: sql`${drills.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(drills.id, id), eq(drills.version, input.version!)))
      .returning({ id: drills.id });
    if (updated.length === 0) return fail("CONFLICT");

    await tx.delete(drillSkills).where(eq(drillSkills.drillId, id));
    await tx.delete(drillEquipment).where(eq(drillEquipment.drillId, id));
    await tx.delete(drillDiagrams).where(eq(drillDiagrams.drillId, id));
    await writeChildren(tx, id, sport.id, input, checked.data);
    await recordAuditInTx(tx, actor, {
      action: "drill.updated",
      entityType: "drill",
      entityId: id,
      metadata: { sport: sport.key },
    });
    return ok({ id });
  });
}

/** Drills are archived, never deleted: history and lineage (forks) stay intact. */
export async function archiveDrill(
  actor: Actor,
  sportKey: string,
  id: string,
): Promise<Result<{ id: string }>> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return tenantTx(actor, async (tx): Promise<Result<{ id: string }>> => {
    const [row] = await tx
      .select({
        organizationId: drills.organizationId,
        createdBy: drills.createdBy,
        visibility: drills.visibility,
        status: drills.status,
      })
      .from(drills)
      .where(and(eq(drills.id, id), eq(drills.sportId, sport.id)))
      .limit(1);
    if (!row) return fail("NOT_FOUND");
    const resource: DrillResource = {
      organizationId: row.organizationId,
      createdBy: row.createdBy,
      visibility: row.visibility as DrillResource["visibility"],
      status: row.status,
    };
    if (!can(actor, "drill:archive", resource)) return fail("FORBIDDEN");
    if (row.status === "archived") return ok({ id });

    await tx
      .update(drills)
      .set({ status: "archived", version: sql`${drills.version} + 1`, updatedAt: new Date() })
      .where(eq(drills.id, id));
    await recordAuditInTx(tx, actor, {
      action: "drill.archived",
      entityType: "drill",
      entityId: id,
      metadata: { sport: sport.key },
    });
    return ok({ id });
  });
}

/**
 * Copy ("fork") any drill the actor can read into their own workspace as a private drill — the way
 * library drills are customised (ARCHITECTURE.md §7.3: sharing across organizations is by copy).
 */
export async function duplicateDrill(
  actor: Actor,
  sportKey: string,
  id: string,
): Promise<Result<{ id: string }>> {
  const source = await getDrill(actor, sportKey, id); // RLS: only drills the actor can read exist
  if (!source) return fail("NOT_FOUND");
  if (!source.permissions.canDuplicate) return fail("FORBIDDEN");
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");

  const fromLibrary = source.scope === "library";
  const input: DrillInput = {
    title: `Copy of ${source.title}`.slice(0, 120),
    description: source.description,
    category: source.category.key,
    primarySkill: source.skills.find((s) => s.role === "primary")?.key ?? "",
    secondarySkills: source.skills.filter((s) => s.role === "secondary").map((s) => s.key),
    level: source.level,
    ageMin: source.ageMin,
    ageMax: source.ageMax,
    playersMin: source.playersMin,
    playersMax: source.playersMax,
    durationMin: source.durationMin,
    durationMax: source.durationMax,
    space: source.space,
    tags: source.tags,
    equipment: source.equipment.map((e) => ({ type: e.key, rule: e.rule, quantity: e.quantity })),
    content: source.content,
    diagrams: source.diagrams.map((g) => ({ title: g.title, diagram: g.diagram })),
    visibility: "private",
    // provenance is never lost: a copy of a library drill is credited as adapted from it
    sourceKind: fromLibrary ? "adapted" : source.source.kind,
    sourceName: fromLibrary ? "CoachOS library" : (source.source.name ?? ""),
    sourceUrl: fromLibrary ? "" : (source.source.url ?? ""),
  };

  const checked = checkSport(sport, await getTaxonomy(sport.id), input);
  if (!checked.ok) return checked;
  return ok(
    await insertDrill(actor, sport, input, checked.data, {
      forkedFromId: id,
      auditAction: "drill.duplicated",
    }),
  );
}
