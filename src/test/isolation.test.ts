import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditEvents, profiles } from "@/db/schema";
import { db, pool } from "@/lib/db/client";
import { tenantTx, userTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import type { Actor } from "@/lib/authz/can";
import { listOwnActivity, recordAudit } from "@/modules/audit";
import { updateProfile } from "@/modules/identity/commands";
import { renameWorkspace } from "@/modules/organizations";
import { createTestActor } from "@/test/factories";

/**
 * CROSS-TENANT ISOLATION (ARCHITECTURE.md §19.1, §19.2): as user A, every attempt to read or
 * change user B's data — through the real modules AND through raw SQL as the runtime role — must
 * fail. No mocks: real Postgres, real coachos_app role, real RLS policies.
 */

let A: Actor;
let B: Actor;

/** Drizzle wraps driver errors ("Failed query: …"); the real Postgres message is on `cause`. */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as { message: string; cause?: { message?: string } },
  );
  expect(err, "expected the database to reject this statement").not.toBeNull();
  expect(`${err?.cause?.message ?? ""} ${err?.message ?? ""}`).toMatch(pattern);
}

beforeAll(async () => {
  A = await createTestActor("Alice Coach");
  B = await createTestActor("Bob Teacher");
  await recordAudit(A, { action: "auth.sign_in" });
  await recordAudit(B, { action: "auth.sign_in" });
  await recordAudit(B, { action: "auth.password_changed" });
});

afterAll(async () => {
  await pool.end();
});

describe("reads", () => {
  it("audit trail: A sees only A's events, B only B's", async () => {
    const a = await listOwnActivity(A);
    const b = await listOwnActivity(B);
    expect(a.map((e) => e.action)).toEqual(["auth.sign_in"]);
    expect(b.map((e) => e.action).sort()).toEqual(["auth.password_changed", "auth.sign_in"]);
  });

  it("raw SQL as A asking for B's rows by id returns nothing (RLS, not just app filtering)", async () => {
    const rows = await tenantTx(A, (tx) =>
      tx.select().from(profiles).where(eq(profiles.userId, B.userId)),
    );
    expect(rows).toEqual([]);
    const audit = await tenantTx(A, (tx) =>
      tx.select().from(auditEvents).where(eq(auditEvents.userId, B.userId)),
    );
    expect(audit).toEqual([]);
  });

  it("a query with no tenant context sees nothing (fails closed)", async () => {
    expect(await db.select().from(profiles)).toEqual([]);
    expect(await db.select().from(auditEvents)).toEqual([]);
  });

  it("the tenant context does not leak to later queries on a pooled connection", async () => {
    await tenantTx(A, (tx) => tx.select().from(profiles));
    // same pool, very likely the same physical connection:
    expect(await db.select().from(profiles)).toEqual([]);
    const [{ v }] = (
      await pool.query<{ v: string | null }>("select current_setting('app.user_id', true) as v")
    ).rows as [{ v: string | null }];
    expect(v === null || v === "").toBe(true);
  });
});

describe("writes", () => {
  it("A cannot update B's profile (0 rows affected)", async () => {
    const res = await tenantTx(A, (tx) =>
      tx
        .update(profiles)
        .set({ profession: "coach" })
        .where(eq(profiles.userId, B.userId))
        .returning(),
    );
    expect(res).toEqual([]);
    const [bProfile] = await userTx(B.userId, (tx) =>
      tx.select().from(profiles).where(eq(profiles.userId, B.userId)),
    );
    expect(bProfile?.profession).toBeNull();
  });

  it("A cannot delete B's profile", async () => {
    const res = await tenantTx(A, (tx) =>
      tx.delete(profiles).where(eq(profiles.userId, B.userId)).returning(),
    );
    expect(res).toEqual([]);
    const still = await userTx(B.userId, (tx) =>
      tx.select().from(profiles).where(eq(profiles.userId, B.userId)),
    );
    expect(still).toHaveLength(1);
  });

  it("A cannot insert a profile for another user (WITH CHECK)", async () => {
    const stranger = newId();
    await expectDbError(
      tenantTx(A, (tx) => tx.insert(profiles).values({ userId: stranger })),
      /row-level security/,
    );
  });

  it("A cannot write audit events into B's trail or B's organization", async () => {
    await expectDbError(
      tenantTx(A, (tx) =>
        tx.insert(auditEvents).values({
          id: newId(),
          userId: B.userId,
          organizationId: A.organizationId,
          action: "forged",
        }),
      ),
      /row-level security/,
    );
    await expectDbError(
      tenantTx(A, (tx) =>
        tx.insert(auditEvents).values({
          id: newId(),
          userId: A.userId,
          organizationId: B.organizationId,
          action: "forged",
        }),
      ),
      /row-level security/,
    );
  });

  it("audit events cannot be rewritten or erased, even by their owner", async () => {
    await expectDbError(
      tenantTx(A, (tx) => tx.execute(sql`update audit_events set action = 'tampered'`)),
      /permission denied/,
    );
    await expectDbError(
      tenantTx(A, (tx) => tx.execute(sql`delete from audit_events`)),
      /permission denied/,
    );
    await expectDbError(
      tenantTx(A, (tx) => tx.execute(sql`truncate audit_events`)),
      /permission denied/,
    );
    expect((await listOwnActivity(A)).map((e) => e.action)).toEqual(["auth.sign_in"]);
  });

  it("tenant context must be well-formed (no SQL smuggling through ids)", async () => {
    await expect(
      tenantTx(
        { userId: "x'; drop table profiles;--", organizationId: A.organizationId },
        async () => 1,
      ),
    ).rejects.toThrow(/UUID/);
  });
});

describe("through the domain modules (authorization + tenancy)", () => {
  it("renameWorkspace enforces the role policy", async () => {
    await expect(renameWorkspace({ ...A, role: "assistant" }, "Hacked")).rejects.toThrow(
      "FORBIDDEN",
    );
    await renameWorkspace(A, "Alice's Club");
  });

  it("an actor pointing at another org cannot rename it: the update is scoped to the actor's own org", async () => {
    // Even a forged actor claiming B's org id only ever touches rows inside app.org_id context.
    await renameWorkspace(B, "Bob's Class");
    const [org] = (
      await pool.query<{ name: string }>("select name from organization where id = $1", [
        A.organizationId,
      ])
    ).rows;
    expect(org?.name).toBe("Alice's Club"); // untouched by B's rename
  });

  it("updateProfile writes only the acting user's profile and audits it in the same transaction", async () => {
    await updateProfile(A, { name: "Alice C.", profession: "coach", timezone: "Europe/Paris" });
    const a = await userTx(A.userId, (tx) =>
      tx.select().from(profiles).where(eq(profiles.userId, A.userId)),
    );
    const b = await userTx(B.userId, (tx) =>
      tx.select().from(profiles).where(eq(profiles.userId, B.userId)),
    );
    expect(a[0]?.timezone).toBe("Europe/Paris");
    expect(a[0]?.version).toBe(2);
    expect(b[0]?.timezone).toBeNull();
    expect((await listOwnActivity(A)).map((e) => e.action)).toContain("account.profile_updated");
    expect((await listOwnActivity(B)).map((e) => e.action)).not.toContain(
      "account.profile_updated",
    );
  });
});
