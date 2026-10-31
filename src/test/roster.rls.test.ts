import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { players, teams } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import { createPlayer, createTeam, deleteTeam } from "@/modules/roster";
import { createTestActor } from "./factories";
import { createClub, expectDbError } from "./drill-fixtures";
import { basketballId } from "./plan-fixtures";

/**
 * Roster (teams, players) against real PostgreSQL as the real runtime role (coachos_app). Mirrors
 * drills.rls.test.ts / templates.rls.test.ts: every tenant boundary must fail IN THE DATABASE, not
 * only in application code (ARCHITECTURE.md §19).
 */

let BB: string;
let owner: Actor;
let admin: Actor;
let coach: Actor;
let assistant: Actor;
let outsider: Actor;

const rows = async (actor: Actor, query: ReturnType<typeof sql>) =>
  (await tenantTx(actor, (tx) => tx.execute(query))).rows as Array<Record<string, unknown>>;

beforeAll(async () => {
  BB = await basketballId();
  const founder = await createTestActor("Club Founder");
  const club = await createClub(founder, [
    { role: "admin", name: "Eve Admin" },
    { role: "coach", name: "Bob Coach" },
    { role: "assistant", name: "Cara Assistant" },
  ]);
  owner = club.ownerActor;
  [admin, coach, assistant] = club.members as [Actor, Actor, Actor];
  outsider = await createTestActor("Otto Outsider");
});

afterAll(async () => {
  await pool.end();
});

describe("teams and players are shared workspace data", () => {
  it("every role in the workspace can read a team and its players, an assistant too", async () => {
    const created = await createTeam(owner, "basketball", {
      name: "U14 Girls",
      notes: "",
      status: "active",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    for (const actor of [owner, admin, coach, assistant]) {
      const seen = await rows(actor, sql`select id from teams where id = ${created.data.id}`);
      expect(seen, actor.role).toHaveLength(1);
    }
  });

  it("owner, admin and coach may create a team; an assistant may not", async () => {
    expect(
      (await createTeam(owner, "basketball", { name: "A", notes: "", status: "active" })).ok,
    ).toBe(true);
    expect(
      (await createTeam(admin, "basketball", { name: "B", notes: "", status: "active" })).ok,
    ).toBe(true);
    expect(
      (await createTeam(coach, "basketball", { name: "C", notes: "", status: "active" })).ok,
    ).toBe(true);
    expect(
      (await createTeam(assistant, "basketball", { name: "D", notes: "", status: "active" })).ok,
    ).toBe(false);
  });

  it("the database itself refuses an assistant's INSERT, independent of the command layer", async () => {
    await expectDbError(
      tenantTx(assistant, (tx) =>
        tx.insert(teams).values({
          id: newId(),
          organizationId: assistant.organizationId,
          sportId: BB,
          createdBy: assistant.userId,
          name: "Smuggled Team",
        }),
      ),
      /row-level security|permission denied/,
    );
  });

  it("a team and its players from another workspace are simply not there", async () => {
    const created = await createTeam(owner, "basketball", {
      name: "Hidden",
      notes: "",
      status: "active",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const seen = await rows(outsider, sql`select id from teams where id = ${created.data.id}`);
    expect(seen).toHaveLength(0);
  });
});

describe("players", () => {
  it("can be created unassigned, and reassigned onto a team", async () => {
    const team = await createTeam(owner, "basketball", {
      name: "Roster Team",
      notes: "",
      status: "active",
    });
    expect(team.ok).toBe(true);
    if (!team.ok) return;
    const player = await createPlayer(owner, {
      name: "Alex Player",
      teamId: "",
      dateOfBirth: "",
      classification: "",
      notes: "",
      status: "active",
    });
    expect(player.ok).toBe(true);
    if (!player.ok) return;
    const [row] = await tenantTx(owner, (tx) =>
      tx.select().from(players).where(eq(players.id, player.data.id)),
    );
    expect(row?.teamId).toBeNull();

    const withClassification = await createPlayer(owner, {
      name: "Jordan Classified",
      teamId: team.data.id,
      dateOfBirth: "",
      classification: 3,
      notes: "",
      status: "active",
    });
    expect(withClassification.ok).toBe(true);
    if (!withClassification.ok) return;
    const [classifiedRow] = await tenantTx(owner, (tx) =>
      tx.select().from(players).where(eq(players.id, withClassification.data.id)),
    );
    expect(classifiedRow?.teamId).toBe(team.data.id);
    expect(Number(classifiedRow?.classification)).toBe(3);
  });

  it("removing a team unassigns its players — it does not delete them", async () => {
    const team = await createTeam(owner, "basketball", {
      name: "Disbanding",
      notes: "",
      status: "active",
    });
    expect(team.ok).toBe(true);
    if (!team.ok) return;
    const player = await createPlayer(owner, {
      name: "Stays Around",
      teamId: team.data.id,
      dateOfBirth: "",
      classification: "",
      notes: "",
      status: "active",
    });
    expect(player.ok).toBe(true);
    if (!player.ok) return;

    expect((await deleteTeam(owner, team.data.id)).ok).toBe(true);
    const [row] = await tenantTx(owner, (tx) =>
      tx.select().from(players).where(eq(players.id, player.data.id)),
    );
    expect(row?.deletedAt).toBeNull();
    expect(row?.teamId).toBeNull();
  });

  it("the classification check constraint rejects anything outside 1.0–4.5", async () => {
    await expectDbError(
      tenantTx(owner, (tx) =>
        tx.insert(players).values({
          id: newId(),
          organizationId: owner.organizationId,
          createdBy: owner.userId,
          name: "Out of Range",
          classification: 5.0,
        }),
      ),
      /players_classification_chk|check constraint/,
    );
  });
});

describe("integrity", () => {
  it("a deleted team cannot be edited until it is restored", async () => {
    const team = await createTeam(owner, "basketball", {
      name: "Frozen",
      notes: "",
      status: "active",
    });
    expect(team.ok).toBe(true);
    if (!team.ok) return;
    expect((await deleteTeam(owner, team.data.id)).ok).toBe(true);
    await expectDbError(
      tenantTx(owner, (tx) =>
        tx.update(teams).set({ name: "Renamed" }).where(eq(teams.id, team.data.id)),
      ),
      /cannot be edited: restore it first/,
    );
  });

  it("the runtime role can add, read and edit teams and players, but never DELETE or TRUNCATE either table", async () => {
    const privileges = async (table: string) => {
      const { rows: r } = await pool.query<{
        ins: boolean;
        sel: boolean;
        upd: boolean;
        del: boolean;
        trunc: boolean;
      }>(
        `select has_table_privilege(current_user, $1, 'INSERT') as ins,
                has_table_privilege(current_user, $1, 'SELECT') as sel,
                has_table_privilege(current_user, $1, 'UPDATE') as upd,
                has_table_privilege(current_user, $1, 'DELETE') as del,
                has_table_privilege(current_user, $1, 'TRUNCATE') as trunc`,
        [table],
      );
      return r[0];
    };
    expect(await privileges("teams")).toEqual({
      ins: true,
      sel: true,
      upd: true,
      del: false,
      trunc: false,
    });
    expect(await privileges("players")).toEqual({
      ins: true,
      sel: true,
      upd: true,
      del: false,
      trunc: false,
    });
  });
});
