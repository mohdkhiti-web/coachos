import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { players, teams } from "@/db/schema";
import { can, type Actor } from "@/lib/authz/can";
import type { Tx } from "@/lib/db/client";
import { inTx } from "@/lib/db/in-tx";
import { isUuid, newId } from "@/lib/ids";
import { fail, ok, type Result } from "@/lib/result";
import { recordAuditInTx } from "@/modules/audit";
import { getSport } from "@/modules/sports";
import type { PlayerInput, TeamInput } from "./validators";

/**
 * WRITE side of the roster module. Each command: authorize (`can`) → validate → ONE transaction (row + audit
 * event) → Result, exactly as drills/plans/templates do. The database enforces the same tenancy and ownership
 * rules itself (row-level security and the guard triggers in drizzle/0015_*.sql).
 *
 * Neither a team nor a player is ever removed for good from here: "delete" hides it (and it can be restored).
 */

type TeamRow = typeof teams.$inferSelect;
type PlayerRow = typeof players.$inferSelect;
type Done = Result<{ id: string; version: number }>;

async function loadTeam(tx: Tx, orgId: string, id: string): Promise<TeamRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select()
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

async function loadPlayer(tx: Tx, orgId: string, id: string): Promise<PlayerRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select()
    .from(players)
    .where(and(eq(players.id, id), eq(players.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------------------------------------------

export async function createTeam(actor: Actor, sportKey: string, input: TeamInput): Promise<Done> {
  if (!can(actor, "roster:create", { organizationId: actor.organizationId }))
    return fail("FORBIDDEN");
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  const id = newId();

  return inTx(actor, async (tx) => {
    await tx.insert(teams).values({
      id,
      organizationId: actor.organizationId,
      sportId: sport.id,
      createdBy: actor.userId,
      name: input.name,
      notes: input.notes,
      status: input.status,
    });
    await recordAuditInTx(tx, actor, {
      action: "team.created",
      entityType: "team",
      entityId: id,
      metadata: { sport: sport.key },
    });
    return ok({ id, version: 1 });
  });
}

export async function updateTeam(actor: Actor, id: string, input: TeamInput): Promise<Done> {
  if (input.version === undefined) return fail("VALIDATION", { fields: { version: ["required"] } });
  return inTx(actor, async (tx) => {
    const row = await loadTeam(tx, actor.organizationId, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "roster:update", { organizationId: row.organizationId }))
      return fail("FORBIDDEN");
    const [updated] = await tx
      .update(teams)
      .set({
        name: input.name,
        notes: input.notes,
        status: input.status,
        version: sql`${teams.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(teams.id, id), eq(teams.version, input.version!)))
      .returning({ version: teams.version });
    if (!updated) return fail("CONFLICT");
    await recordAuditInTx(tx, actor, { action: "team.updated", entityType: "team", entityId: id });
    return ok({ id, version: updated.version });
  });
}

/** Soft delete: the team stays (restorable); its players are NOT deleted, they become unassigned. */
export async function deleteTeam(actor: Actor, id: string): Promise<Done> {
  return inTx(actor, async (tx) => {
    const row = await loadTeam(tx, actor.organizationId, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "roster:delete", { organizationId: row.organizationId }))
      return fail("FORBIDDEN");
    const [updated] = await tx
      .update(teams)
      .set({ deletedAt: new Date(), version: sql`${teams.version} + 1`, updatedAt: new Date() })
      .where(eq(teams.id, id))
      .returning({ version: teams.version });
    await tx.update(players).set({ teamId: null }).where(eq(players.teamId, id));
    await recordAuditInTx(tx, actor, { action: "team.deleted", entityType: "team", entityId: id });
    return ok({ id, version: updated!.version });
  });
}

export async function restoreTeam(actor: Actor, id: string): Promise<Done> {
  return inTx(actor, async (tx) => {
    const row = await loadTeam(tx, actor.organizationId, id);
    if (!row || !row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "roster:delete", { organizationId: row.organizationId }))
      return fail("FORBIDDEN");
    const [updated] = await tx
      .update(teams)
      .set({ deletedAt: null, version: sql`${teams.version} + 1`, updatedAt: new Date() })
      .where(eq(teams.id, id))
      .returning({ version: teams.version });
    await recordAuditInTx(tx, actor, { action: "team.restored", entityType: "team", entityId: id });
    return ok({ id, version: updated!.version });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------------------------------------------

async function resolveTeamId(
  tx: Tx,
  orgId: string,
  teamId: string,
): Promise<string | null | "invalid"> {
  if (teamId === "") return null;
  const row = await loadTeam(tx, orgId, teamId);
  return row && !row.deletedAt ? row.id : "invalid";
}

export async function createPlayer(actor: Actor, input: PlayerInput): Promise<Done> {
  if (!can(actor, "roster:create", { organizationId: actor.organizationId }))
    return fail("FORBIDDEN");
  const id = newId();

  return inTx(actor, async (tx) => {
    const teamId = await resolveTeamId(tx, actor.organizationId, input.teamId);
    if (teamId === "invalid") return fail("VALIDATION", { fields: { teamId: ["invalid"] } });
    await tx.insert(players).values({
      id,
      organizationId: actor.organizationId,
      teamId,
      createdBy: actor.userId,
      name: input.name,
      dateOfBirth: input.dateOfBirth === "" ? null : input.dateOfBirth,
      classification: input.classification === "" ? null : input.classification,
      notes: input.notes,
      status: input.status,
    });
    await recordAuditInTx(tx, actor, {
      action: "player.created",
      entityType: "player",
      entityId: id,
    });
    return ok({ id, version: 1 });
  });
}

export async function updatePlayer(actor: Actor, id: string, input: PlayerInput): Promise<Done> {
  if (input.version === undefined) return fail("VALIDATION", { fields: { version: ["required"] } });
  return inTx(actor, async (tx) => {
    const row = await loadPlayer(tx, actor.organizationId, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "roster:update", { organizationId: row.organizationId }))
      return fail("FORBIDDEN");
    const teamId = await resolveTeamId(tx, actor.organizationId, input.teamId);
    if (teamId === "invalid") return fail("VALIDATION", { fields: { teamId: ["invalid"] } });
    const [updated] = await tx
      .update(players)
      .set({
        teamId,
        name: input.name,
        dateOfBirth: input.dateOfBirth === "" ? null : input.dateOfBirth,
        classification: input.classification === "" ? null : input.classification,
        notes: input.notes,
        status: input.status,
        version: sql`${players.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(players.id, id), eq(players.version, input.version!)))
      .returning({ version: players.version });
    if (!updated) return fail("CONFLICT");
    await recordAuditInTx(tx, actor, {
      action: "player.updated",
      entityType: "player",
      entityId: id,
    });
    return ok({ id, version: updated.version });
  });
}

export async function deletePlayer(actor: Actor, id: string): Promise<Done> {
  return inTx(actor, async (tx) => {
    const row = await loadPlayer(tx, actor.organizationId, id);
    if (!row || row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "roster:delete", { organizationId: row.organizationId }))
      return fail("FORBIDDEN");
    const [updated] = await tx
      .update(players)
      .set({ deletedAt: new Date(), version: sql`${players.version} + 1`, updatedAt: new Date() })
      .where(eq(players.id, id))
      .returning({ version: players.version });
    await recordAuditInTx(tx, actor, {
      action: "player.deleted",
      entityType: "player",
      entityId: id,
    });
    return ok({ id, version: updated!.version });
  });
}

export async function restorePlayer(actor: Actor, id: string): Promise<Done> {
  return inTx(actor, async (tx) => {
    const row = await loadPlayer(tx, actor.organizationId, id);
    if (!row || !row.deletedAt) return fail("NOT_FOUND");
    if (!can(actor, "roster:delete", { organizationId: row.organizationId }))
      return fail("FORBIDDEN");
    const [updated] = await tx
      .update(players)
      .set({ deletedAt: null, version: sql`${players.version} + 1`, updatedAt: new Date() })
      .where(eq(players.id, id))
      .returning({ version: players.version });
    await recordAuditInTx(tx, actor, {
      action: "player.restored",
      entityType: "player",
      entityId: id,
    });
    return ok({ id, version: updated!.version });
  });
}
