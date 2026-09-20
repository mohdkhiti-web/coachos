import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { member, organization, profiles, user } from "@/db/schema";
import { db, pool } from "@/lib/db/client";
import { userTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import {
  deletePersonalWorkspacesOf,
  ensureAccountFoundation,
  findMembership,
  getOrganizationById,
} from "@/modules/organizations";

afterAll(async () => {
  await pool.end();
});

async function newUser(name: string) {
  const id = newId();
  await db.insert(user).values({ id, name, email: `${id}@example.test`, emailVerified: true });
  return id;
}

describe("ensureAccountFoundation (personal org + owner membership + profile)", () => {
  it("creates all three, atomically, for a new user", async () => {
    const id = await newUser("Ana Diaz");
    const ws = await ensureAccountFoundation(id);

    expect(ws.role).toBe("owner");
    const org = await getOrganizationById(ws.organizationId);
    expect(org).toMatchObject({ type: "personal", name: "Ana's workspace" });
    expect(await findMembership(id, ws.organizationId)).toEqual({
      organizationId: ws.organizationId,
      role: "owner",
    });
    const profile = await userTx(id, (tx) =>
      tx.select().from(profiles).where(eq(profiles.userId, id)),
    );
    expect(profile).toHaveLength(1);
    expect(profile[0]?.onboardingCompletedAt).toBeNull();
    expect(profile[0]?.units).toBe("metric");
  });

  it("is idempotent — safe to call at every sign-in (self-heals a half-finished sign-up)", async () => {
    const id = await newUser("Ben Kim");
    const first = await ensureAccountFoundation(id);
    const second = await ensureAccountFoundation(id);
    expect(second).toEqual(first);

    const members = await db.select().from(member).where(eq(member.userId, id));
    expect(members).toHaveLength(1);
    const orgs = await db
      .select()
      .from(organization)
      .where(eq(organization.slug, `personal-${id}`));
    expect(orgs).toHaveLength(1);
  });

  it("heals a missing profile without creating a second organization", async () => {
    const id = await newUser("Cy Lee");
    const first = await ensureAccountFoundation(id);
    await userTx(id, (tx) => tx.delete(profiles).where(eq(profiles.userId, id)));
    const healed = await ensureAccountFoundation(id);
    expect(healed.organizationId).toBe(first.organizationId);
    expect(
      await userTx(id, (tx) => tx.select().from(profiles).where(eq(profiles.userId, id))),
    ).toHaveLength(1);
  });

  it("does not trust membership claims: a user is not a member of someone else's org", async () => {
    const a = await newUser("Dee One");
    const b = await newUser("Eli Two");
    const wsA = await ensureAccountFoundation(a);
    await ensureAccountFoundation(b);
    expect(await findMembership(b, wsA.organizationId)).toBeNull();
  });

  it("falls back to a generic workspace name when the user has no usable name", async () => {
    const id = await newUser("   ");
    const ws = await ensureAccountFoundation(id);
    expect((await getOrganizationById(ws.organizationId))?.name).toBe("My workspace");
  });
});

describe("account erasure", () => {
  it("removes the personal workspace and everything that hangs off it", async () => {
    const id = await newUser("Fay Zed");
    const ws = await ensureAccountFoundation(id);
    await deletePersonalWorkspacesOf(id);
    expect(await getOrganizationById(ws.organizationId)).toBeNull();
    expect(
      await db
        .select()
        .from(member)
        .where(and(eq(member.userId, id), eq(member.organizationId, ws.organizationId))),
    ).toEqual([]);
  });

  it("deleting the user cascades to the profile and keeps audit rows anonymised (user_id -> NULL)", async () => {
    const id = await newUser("Gus Hall");
    const ws = await ensureAccountFoundation(id);
    const { recordAudit } = await import("@/modules/audit");
    await recordAudit(
      { userId: id, organizationId: ws.organizationId },
      { action: "auth.sign_in" },
    );
    await deletePersonalWorkspacesOf(id);
    await db.delete(user).where(eq(user.id, id));

    expect(
      await userTx(id, (tx) => tx.select().from(profiles).where(eq(profiles.userId, id))),
    ).toEqual([]);
    // the audit row survives without a user reference (owner-run FK action bypasses RLS/append-only grants)
    const { rows } = await pool.query(
      "select count(*)::int as n from audit_events where user_id = $1",
      [id],
    );
    expect(rows[0].n).toBe(0);
  });
});
