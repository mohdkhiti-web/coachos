import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { TemplateStatus, TemplateVisibility } from "@/db/enums";
import { documentTemplates } from "@/db/schema";
import { can, type Actor } from "@/lib/authz/can";
import type { Tx } from "@/lib/db/client";
import { inTx } from "@/lib/db/in-tx";
import { isUuid, newId } from "@/lib/ids";
import { fail, ok, type Result } from "@/lib/result";
import { recordAuditInTx } from "@/modules/audit";
import { logoIsUsable } from "@/modules/media";
import { checkDesign, hasBlockingIssue } from "@/modules/documents";
import { getOrganizationById } from "@/modules/organizations";
import { getSport } from "@/modules/sports";
import { readConfig, resourceOf } from "./queries";
import { buildTemplateConfig, canonicalJson, type TemplateInput } from "./validators";

/**
 * WRITE side of the templates module. Each command: authorize (`can`) → validate → ONE transaction (row + audit
 * event) → Result. The database enforces the same rules itself (row-level security and the guard trigger in
 * drizzle/0010_*.sql), so a bug here cannot leak or corrupt another workspace's templates.
 *
 * Concurrency: every write presents the version it read and bumps it. The DESIGN has its own `revision`, bumped only
 * when the design really changed: that is what sessions record they were based on, so renaming, describing,
 * archiving or restoring a template never tells its sessions that a newer design exists.
 *
 * A template is never removed for good: "delete" hides it (and it can be restored), so every session that was based
 * on it keeps a name to show.
 */

type Row = typeof documentTemplates.$inferSelect;
type Done = Result<{ id: string; version: number }>;

/** RLS hides templates the actor cannot read, so a missing row is "not found" — never a hint that it exists. */
async function loadRow(tx: Tx, sportId: string, id: string): Promise<Row | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select()
    .from(documentTemplates)
    .where(and(eq(documentTemplates.id, id), eq(documentTemplates.sportId, sportId)))
    .limit(1);
  return row ?? null;
}

/** A personal workspace has nobody to share with: everything there is private, whatever was asked. */
async function effectiveVisibility(
  actor: Actor,
  requested: TemplateVisibility,
): Promise<TemplateVisibility> {
  const org = await getOrganizationById(actor.organizationId);
  return org?.type === "personal" ? "private" : requested;
}

const unreadable = () =>
  fail("VALIDATION", { fields: { "design.colors.text": ["text_unreadable"] } });

export async function createTemplate(
  actor: Actor,
  sportKey: string,
  input: TemplateInput,
): Promise<Done> {
  if (!can(actor, "template:create", { organizationId: actor.organizationId }))
    return fail("FORBIDDEN");
  if (hasBlockingIssue(checkDesign(input.design))) return unreadable();
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  const config = buildTemplateConfig(input.preset, input.design);
  const visibility = await effectiveVisibility(actor, input.visibility);
  const id = newId();

  return inTx(actor, async (tx) => {
    if (input.design.logo && !(await logoIsUsable(tx, input.design.logo.assetId)))
      return fail("VALIDATION", { fields: { "design.logo": ["logo_unknown"] } });
    await tx.insert(documentTemplates).values({
      id,
      organizationId: actor.organizationId,
      sportId: sport.id,
      createdBy: actor.userId,
      name: input.name,
      description: input.description,
      category: input.category,
      visibility,
      config,
    });
    await recordAuditInTx(tx, actor, {
      action: "template.created",
      entityType: "template",
      entityId: id,
      metadata: { sport: sport.key, category: input.category, visibility },
    });
    return ok({ id, version: 1 });
  });
}

/**
 * Edit a template: its details and its design. Sessions already based on it are NOT touched (they hold their own
 * frozen copy); a design change bumps `revision`, which is how they learn an update exists.
 */
export async function updateTemplate(
  actor: Actor,
  sportKey: string,
  id: string,
  input: TemplateInput,
): Promise<Done> {
  if (input.version === undefined) return fail("VALIDATION", { fields: { version: ["required"] } });
  if (hasBlockingIssue(checkDesign(input.design))) return unreadable();
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  const visibility = await effectiveVisibility(actor, input.visibility);
  const config = buildTemplateConfig(input.preset, input.design);

  return inTx(actor, async (tx) => {
    const row = await loadRow(tx, sport.id, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "template:update", resourceOf(row)) || row.status === "archived")
      return fail("FORBIDDEN");
    if (input.design.logo && !(await logoIsUsable(tx, input.design.logo.assetId)))
      return fail("VALIDATION", { fields: { "design.logo": ["logo_unknown"] } });
    const designChanged = canonicalJson(config) !== canonicalJson(readConfig(row.id, row.config));

    const [updated] = await tx
      .update(documentTemplates)
      .set({
        name: input.name,
        description: input.description,
        category: input.category,
        visibility,
        config,
        revision: designChanged ? sql`${documentTemplates.revision} + 1` : row.revision,
        version: sql`${documentTemplates.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(documentTemplates.id, id), eq(documentTemplates.version, input.version!)))
      .returning({ version: documentTemplates.version });
    if (!updated) return fail("CONFLICT");
    await recordAuditInTx(tx, actor, {
      action: "template.updated",
      entityType: "template",
      entityId: id,
      metadata: { sport: sport.key, designChanged },
    });
    return ok({ id, version: updated.version });
  });
}

/** Copy a template you can read into your own workspace, as a private one. */
export async function duplicateTemplate(actor: Actor, sportKey: string, id: string): Promise<Done> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  const copyId = newId();

  return inTx(actor, async (tx) => {
    const source = await loadRow(tx, sport.id, id);
    if (!source || source.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "template:duplicate", resourceOf(source))) return fail("FORBIDDEN");
    await tx.insert(documentTemplates).values({
      id: copyId,
      organizationId: actor.organizationId,
      sportId: sport.id,
      createdBy: actor.userId,
      name: `Copy of ${source.name}`.slice(0, 80),
      description: source.description,
      category: source.category,
      visibility: "private",
      config: readConfig(source.id, source.config),
      forkedFromId: source.id,
    });
    await recordAuditInTx(tx, actor, {
      action: "template.duplicated",
      entityType: "template",
      entityId: copyId,
      metadata: { sport: sport.key, from: source.id },
    });
    return ok({ id: copyId, version: 1 });
  });
}

/** active ⇄ archived. An archived template cannot be applied or edited until it is restored. */
export async function setTemplateStatus(
  actor: Actor,
  sportKey: string,
  id: string,
  status: TemplateStatus,
  version: number,
): Promise<Done> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const row = await loadRow(tx, sport.id, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "template:update", resourceOf(row))) return fail("FORBIDDEN");
    if (row.version !== version) return fail("CONFLICT");
    if (row.status === status) return ok({ id, version: row.version });
    const [updated] = await tx
      .update(documentTemplates)
      .set({ status, version: sql`${documentTemplates.version} + 1`, updatedAt: new Date() })
      .where(and(eq(documentTemplates.id, id), eq(documentTemplates.version, version)))
      .returning({ version: documentTemplates.version });
    if (!updated) return fail("CONFLICT");
    await recordAuditInTx(tx, actor, {
      action: "template.status_changed",
      entityType: "template",
      entityId: id,
      metadata: { sport: sport.key, from: row.status, to: status },
    });
    return ok({ id, version: updated.version });
  });
}

/** Soft delete: the row stays (restorable, and every session that used it keeps its record); lists stop showing it. */
export async function deleteTemplate(actor: Actor, sportKey: string, id: string): Promise<Done> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const row = await loadRow(tx, sport.id, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "template:delete", resourceOf(row))) return fail("FORBIDDEN");
    const [updated] = await tx
      .update(documentTemplates)
      .set({
        deletedAt: new Date(),
        version: sql`${documentTemplates.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(documentTemplates.id, id))
      .returning({ version: documentTemplates.version });
    await recordAuditInTx(tx, actor, {
      action: "template.deleted",
      entityType: "template",
      entityId: id,
      metadata: { sport: sport.key },
    });
    return ok({ id, version: updated!.version });
  });
}

export async function restoreTemplate(actor: Actor, sportKey: string, id: string): Promise<Done> {
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  return inTx(actor, async (tx) => {
    const row = await loadRow(tx, sport.id, id);
    if (!row || !row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "template:delete", resourceOf(row))) return fail("FORBIDDEN");
    const [updated] = await tx
      .update(documentTemplates)
      .set({
        deletedAt: null,
        version: sql`${documentTemplates.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(documentTemplates.id, id))
      .returning({ version: documentTemplates.version });
    await recordAuditInTx(tx, actor, {
      action: "template.restored",
      entityType: "template",
      entityId: id,
      metadata: { sport: sport.key },
    });
    return ok({ id, version: updated!.version });
  });
}
