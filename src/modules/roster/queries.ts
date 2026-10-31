import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { RosterStatus } from "@/db/enums";
import { players, sports, teams } from "@/db/schema";
import { can, type Actor } from "@/lib/authz/can";
import { tenantTx } from "@/lib/db/tx";
import { isUuid } from "@/lib/ids";
import type { PlayerDto, TeamDto } from "./dto";

/**
 * READ side of the roster module. Every function runs inside `tenantTx`, so PostgreSQL row-level security
 * decides what exists for this actor: another workspace's roster is simply not there (ARCHITECTURE.md §6.3).
 */

const permissions = (actor: Actor) => ({
  canEdit: can(actor, "roster:update", { organizationId: actor.organizationId }),
  canDelete: can(actor, "roster:delete", { organizationId: actor.organizationId }),
});

export type ListTeamsOptions = { sportKey?: string; status?: RosterStatus };

export async function listTeams(actor: Actor, opts: ListTeamsOptions = {}): Promise<TeamDto[]> {
  const conds = [isNull(teams.deletedAt)];
  if (opts.sportKey) conds.push(eq(sports.key, opts.sportKey));
  if (opts.status) conds.push(eq(teams.status, opts.status));

  return tenantTx(actor, async (tx) => {
    const rows = await tx
      .select({
        t: teams,
        sportKey: sports.key,
        sportName: sports.name,
        playerCount: sql<number>`count(${players.id}) filter (where ${players.deletedAt} is null)::int`,
      })
      .from(teams)
      .innerJoin(sports, eq(sports.id, teams.sportId))
      .leftJoin(players, eq(players.teamId, teams.id))
      .where(and(...conds))
      .groupBy(teams.id, sports.key, sports.name)
      .orderBy(desc(teams.updatedAt), teams.id);
    const perms = permissions(actor);
    return rows.map((r) => ({
      id: r.t.id,
      sportKey: r.sportKey,
      sportName: r.sportName,
      name: r.t.name,
      notes: r.t.notes,
      status: r.t.status as RosterStatus,
      version: r.t.version,
      playerCount: r.playerCount,
      createdAt: r.t.createdAt,
      updatedAt: r.t.updatedAt,
      permissions: perms,
    }));
  });
}

export async function getTeam(actor: Actor, id: string): Promise<TeamDto | null> {
  if (!isUuid(id)) return null;
  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .select({
        t: teams,
        sportKey: sports.key,
        sportName: sports.name,
        playerCount: sql<number>`count(${players.id}) filter (where ${players.deletedAt} is null)::int`,
      })
      .from(teams)
      .innerJoin(sports, eq(sports.id, teams.sportId))
      .leftJoin(players, eq(players.teamId, teams.id))
      .where(eq(teams.id, id))
      .groupBy(teams.id, sports.key, sports.name)
      .limit(1);
    if (!row || row.t.deletedAt) return null;
    return {
      id: row.t.id,
      sportKey: row.sportKey,
      sportName: row.sportName,
      name: row.t.name,
      notes: row.t.notes,
      status: row.t.status as RosterStatus,
      version: row.t.version,
      playerCount: row.playerCount,
      createdAt: row.t.createdAt,
      updatedAt: row.t.updatedAt,
      permissions: permissions(actor),
    };
  });
}

export type ListPlayersOptions = {
  /** Omitted = every player in the workspace. `null` = unassigned players only. */
  teamId?: string | null;
  status?: RosterStatus;
};

function toPlayerDto(
  actor: Actor,
  row: { p: typeof players.$inferSelect; teamName: string | null },
): PlayerDto {
  return {
    id: row.p.id,
    teamId: row.p.teamId,
    teamName: row.teamName,
    name: row.p.name,
    dateOfBirth: row.p.dateOfBirth,
    classification: row.p.classification,
    notes: row.p.notes,
    status: row.p.status as RosterStatus,
    version: row.p.version,
    createdAt: row.p.createdAt,
    updatedAt: row.p.updatedAt,
    permissions: permissions(actor),
  };
}

export async function listPlayers(
  actor: Actor,
  opts: ListPlayersOptions = {},
): Promise<PlayerDto[]> {
  const conds = [isNull(players.deletedAt)];
  if (opts.teamId === null) conds.push(isNull(players.teamId));
  else if (opts.teamId) conds.push(eq(players.teamId, opts.teamId));
  if (opts.status) conds.push(eq(players.status, opts.status));

  return tenantTx(actor, async (tx) => {
    const rows = await tx
      .select({ p: players, teamName: teams.name })
      .from(players)
      .leftJoin(teams, eq(teams.id, players.teamId))
      .where(and(...conds))
      .orderBy(sql`lower(${players.name})`, players.id);
    return rows.map((r) => toPlayerDto(actor, r));
  });
}

export async function getPlayer(actor: Actor, id: string): Promise<PlayerDto | null> {
  if (!isUuid(id)) return null;
  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .select({ p: players, teamName: teams.name })
      .from(players)
      .leftJoin(teams, eq(teams.id, players.teamId))
      .where(eq(players.id, id))
      .limit(1);
    if (!row || row.p.deletedAt) return null;
    return toPlayerDto(actor, row);
  });
}
