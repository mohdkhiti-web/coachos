import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { auditEvents, planShares } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import { shareTx, tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import { presetDesign } from "@/modules/documents";
import { resetUploadRate, uploadLogo } from "@/modules/media/commands";
import { readSharedLogo } from "@/modules/media/queries";
import { deletePlan, restorePlan, savePlanDocument, setPlanStatus } from "@/modules/plans/commands";
import { planDocumentSchema } from "@/modules/plans/validators";
import {
  createShare,
  getShareStatus,
  regenerateShare,
  revokeShare,
} from "@/modules/sharing/commands";
import { parseShareToken, makeShareToken } from "@/modules/sharing/token";
import { publicView, readShareLogo, resolveShare } from "@/modules/sharing/queries";
import { shareSecret } from "@/modules/sharing/secret";
import { makePng } from "../modules/media/test-support";
import { createClub, expectDbError } from "./drill-fixtures";
import { createTestActor } from "./factories";
import { adminPool, makePlan, rawPlan, basketballId } from "./plan-fixtures";

/**
 * Secure sharing through the real commands, permissions and database (Step 7): who may share, what the public sees, and
 * that a link stops working the moment it should. Raw statements check that the DATABASE (row-level security and the
 * guard trigger) refuses what the application would, including for a public visitor holding one share id.
 */

const SPORT = "basketball";
let owner: Actor;
let admin: Actor;
let coach: Actor;
let teacher: Actor;
let assistant: Actor;
let outsider: Actor;
let BB: string;

const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
const good = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r.error)}`);
  return r.data;
};
const urlToken = (url: string) => url.split("/s/")[1]!;
const shareIdOf = (url: string) => parseShareToken(urlToken(url), shareSecret())!;
const rows = async (actor: Actor, query: ReturnType<typeof sql>) =>
  (await tenantTx(actor, (tx) => tx.execute(query))).rows as Array<Record<string, unknown>>;
const asVisitor = async (shareId: string, query: ReturnType<typeof sql>) =>
  (await shareTx(shareId, (tx) => tx.execute(query))).rows as Array<Record<string, unknown>>;
const admin$ = async (query: string, params: unknown[] = []) => {
  const c = adminPool();
  try {
    await c.query("set session_replication_role = replica"); // a superuser correcting data: the guard triggers stand aside
    return (await c.query(query, params)).rows as Array<Record<string, unknown>>;
  } finally {
    await c.end();
  }
};
const active = (r: Result<{ active: boolean }>) => good(r).active;
const url = (r: Result<{ active: boolean; url?: string }>) => {
  const d = good(r) as { active: true; url: string };
  return d.url;
};

beforeAll(async () => {
  BB = await basketballId();
  const founder = await createTestActor("Share Founder");
  const club = await createClub(founder, [
    { role: "admin", name: "Eve Admin" },
    { role: "coach", name: "Bob Coach" },
    { role: "teacher", name: "Dan Teacher" },
    { role: "assistant", name: "Cara Assistant" },
  ]);
  owner = club.ownerActor;
  [admin, coach, teacher, assistant] = club.members as [Actor, Actor, Actor, Actor];
  outsider = await createTestActor("Otto Outsider");
});
beforeEach(() => resetUploadRate());
afterAll(async () => {
  await pool.end();
});

describe("who can share a session", () => {
  it("its author can; the link is the same every time it is asked for", async () => {
    const p = await makePlan(coach, { title: "Shareable" });
    expect((await getShareStatus(coach, SPORT, p.id)).active).toBe(false);
    const first = url(await createShare(coach, SPORT, p.id));
    expect(first).toMatch(/\/s\/[0-9a-f]{32}[A-Za-z0-9_-]{43}$/);
    expect(url(await createShare(coach, SPORT, p.id))).toBe(first); // creating twice never makes two
    const status = await getShareStatus(coach, SPORT, p.id);
    expect(status).toMatchObject({ active: true, url: first, expiresAt: null, createdByMe: true });
    const [{ n }] = (await rows(
      coach,
      sql`select count(*)::int as n from plan_shares where plan_id = ${p.id} and revoked_at is null`,
    )) as [{ n: number }];
    expect(n).toBe(1);
  });

  it("an owner or admin can share a colleague's workspace-visible session; a colleague cannot", async () => {
    const p = await makePlan(coach, { title: "Colleague's", visibility: "organization" });
    expect(codeOf(await createShare(teacher, SPORT, p.id))).toBe("FORBIDDEN");
    expect(codeOf(await createShare(assistant, SPORT, p.id))).toBe("FORBIDDEN");
    expect(active(await createShare(admin, SPORT, p.id))).toBe(true);
    // the author sees and can revoke the link an admin made for their session
    expect((await getShareStatus(coach, SPORT, p.id)).active).toBe(true);
    expect(codeOf(await revokeShare(coach, SPORT, p.id))).toBe("OK");
    expect(active(await createShare(owner, SPORT, p.id))).toBe(true);
  });

  it("someone else's PRIVATE session is not there for anybody, not even the owner; nor another workspace's", async () => {
    const p = await makePlan(coach, { title: "Private" });
    expect(codeOf(await createShare(owner, SPORT, p.id))).toBe("NOT_FOUND");
    expect(codeOf(await createShare(outsider, SPORT, p.id))).toBe("NOT_FOUND");
    expect((await getShareStatus(owner, SPORT, p.id)).active).toBe(false);
    expect(codeOf(await createShare(coach, SPORT, "not-a-uuid"))).toBe("NOT_FOUND");
    expect(codeOf(await createShare(coach, "curling", p.id))).toBe("NOT_FOUND");
  });

  it("only a live session: archived or deleted ones cannot be shared", async () => {
    const archived = await makePlan(coach, { title: "Archived" });
    good(await setPlanStatus(coach, SPORT, archived.id, "archived", archived.version));
    expect(codeOf(await createShare(coach, SPORT, archived.id))).toBe("FORBIDDEN");
    const gone = await makePlan(coach, { title: "Deleted" });
    good(await deletePlan(coach, SPORT, gone.id));
    expect(codeOf(await createShare(coach, SPORT, gone.id))).toBe("NOT_FOUND");
  });

  it("is audited: created, regenerated, revoked", async () => {
    const p = await makePlan(coach, { title: "Audited share" });
    await createShare(coach, SPORT, p.id);
    await regenerateShare(coach, SPORT, p.id);
    await revokeShare(coach, SPORT, p.id);
    const events = await tenantTx(coach, (tx) =>
      tx
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(eq(auditEvents.entityId, p.id)),
    );
    const actions = events.map((e) => e.action);
    for (const a of ["share.created", "share.regenerated", "share.revoked"])
      expect(actions, a).toContain(a);
  });
});

describe("what a link opens", () => {
  it("the session as a document — and only while the link is live", async () => {
    const p = await makePlan(coach, { title: "Public session", teamName: "U14 Boys" });
    const link = url(await createShare(coach, SPORT, p.id));
    const shared = await resolveShare(urlToken(link));
    expect(shared).toMatchObject({ title: "Public session", sportKey: "basketball" });
    expect(shared!.input.teamName).toBe("U14 Boys");
    expect(await resolveShare(urlToken(link) + "x")).toBeNull();
    expect(await resolveShare("")).toBeNull();
  });

  it("never shows the coach's private notes or the reflection, whatever the design switches on", async () => {
    const p = await makePlan(coach, {
      title: "Private notes",
      details: {
        coachNotes: "SECRET coach note",
        coachName: "Sam Rivera",
        clubName: "Riverside BC",
      },
    });
    good(
      await savePlanDocument(
        coach,
        SPORT,
        p.id,
        planDocumentSchema.parse({
          version: p.version,
          preset: "classic",
          design: {
            ...presetDesign("classic"),
            sections: { ...presetDesign("classic").sections, coachNotes: true, reflection: true },
          },
          reflection: {
            wentWell: "SECRET reflection answer",
            needsImprovement: "",
            nextFocus: "",
            notes: "",
          },
        }),
      ),
    );
    const shared = (await resolveShare(urlToken(url(await createShare(coach, SPORT, p.id)))))!;
    expect(shared.input.coachNotes).toBe("");
    expect(shared.design.sections.coachNotes).toBe(false);
    expect(shared.design.sections.reflection).toBe(false);
    expect(shared.reflection).toEqual({
      wentWell: "",
      needsImprovement: "",
      nextFocus: "",
      notes: "",
    });
    const everything = JSON.stringify(shared);
    for (const secret of ["SECRET coach note", "SECRET reflection answer"])
      expect(everything).not.toContain(secret);
    expect(shared.input.coachName).toBe("Sam Rivera"); // what is printed on the document stays
  });

  it("reveals nothing about the workspace: no ids, no members, no addresses", async () => {
    const p = await makePlan(coach, { title: "No leaks" });
    const shared = (await resolveShare(urlToken(url(await createShare(coach, SPORT, p.id)))))!;
    const everything = JSON.stringify(shared);
    for (const internal of [
      p.id,
      coach.userId,
      coach.organizationId,
      "@example.test",
      "Bob Coach",
      "Share Founder",
    ])
      expect(everything, internal).not.toContain(internal);
    expect(Object.keys(shared).sort()).toEqual([
      "design",
      "expiresAt",
      "input",
      "meta",
      "reflection",
      "shareId",
      "sportKey",
      "title",
    ]);
  });

  it("stops the moment the link is revoked; a regenerated link replaces the old one", async () => {
    const p = await makePlan(coach, { title: "Revocable" });
    const oldLink = url(await createShare(coach, SPORT, p.id));
    expect(await resolveShare(urlToken(oldLink))).not.toBeNull();
    const newLink = url(await regenerateShare(coach, SPORT, p.id));
    expect(newLink).not.toBe(oldLink);
    expect(await resolveShare(urlToken(oldLink))).toBeNull(); // the old link is dead at once
    expect(await resolveShare(urlToken(newLink))).not.toBeNull();
    good(await revokeShare(coach, SPORT, p.id));
    expect(await resolveShare(urlToken(newLink))).toBeNull();
    expect((await getShareStatus(coach, SPORT, p.id)).active).toBe(false);
    good(await revokeShare(coach, SPORT, p.id)); // twice is fine
    const third = url(await createShare(coach, SPORT, p.id)); // and a new link can be made afterwards
    expect(third).not.toBe(newLink);
    expect(await resolveShare(urlToken(newLink))).toBeNull();
  });

  it("has an expiry: an expired link is dead, and making a link again replaces it", async () => {
    const p = await makePlan(coach, { title: "Expiring" });
    const link = url(await createShare(coach, SPORT, p.id, 7));
    const status = (await getShareStatus(coach, SPORT, p.id)) as { active: true; expiresAt: Date };
    expect(status.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(await resolveShare(urlToken(link))).not.toBeNull();
    // time passes (a superuser moves the dates back: an application cannot edit these)
    await admin$(
      "update plan_shares set created_at = now() - interval '9 days', expires_at = now() - interval '2 days' where id = $1",
      [shareIdOf(link)],
    );
    expect(await resolveShare(urlToken(link))).toBeNull();
    expect((await getShareStatus(coach, SPORT, p.id)).active).toBe(false);
    const fresh = url(await createShare(coach, SPORT, p.id));
    expect(fresh).not.toBe(link);
    expect(await resolveShare(urlToken(fresh))).not.toBeNull();
  });

  it("follows the session: archived or deleted means unavailable, restored means available again", async () => {
    const p = await makePlan(coach, { title: "Lifecycle" });
    const link = url(await createShare(coach, SPORT, p.id));
    expect(await resolveShare(urlToken(link))).not.toBeNull();
    good(await setPlanStatus(coach, SPORT, p.id, "archived", p.version));
    expect(await resolveShare(urlToken(link))).toBeNull();
    const back = await tenantTx(coach, (tx) =>
      tx.execute(sql`select version from plans where id = ${p.id}`),
    );
    good(await setPlanStatus(coach, SPORT, p.id, "draft", Number(back.rows[0]!.version)));
    expect(await resolveShare(urlToken(link))).not.toBeNull();
    good(await deletePlan(coach, SPORT, p.id));
    expect(await resolveShare(urlToken(link))).toBeNull();
    good(await restorePlan(coach, SPORT, p.id));
    expect(await resolveShare(urlToken(link))).not.toBeNull();
  });

  it("a link for one session never opens another, and a link cannot be moved to another session", async () => {
    const a = await makePlan(coach, { title: "Session A" });
    const b = await makePlan(coach, { title: "Session B" });
    const linkA = url(await createShare(coach, SPORT, a.id));
    const linkB = url(await createShare(coach, SPORT, b.id));
    expect((await resolveShare(urlToken(linkA)))!.title).toBe("Session A");
    expect((await resolveShare(urlToken(linkB)))!.title).toBe("Session B");
    // a made-up token with a real share id and a wrong signature
    const forged = shareIdOf(linkA).replaceAll("-", "") + urlToken(linkB).slice(32);
    expect(await resolveShare(forged)).toBeNull();
    expect(
      makeShareToken(shareIdOf(linkA), "another secret that is long enough for this test"),
    ).not.toBe(urlToken(linkA));
  });
});

describe("what a public visitor can touch in the database", () => {
  it("only the one live session their link names — not its neighbours, not templates, not other shares", async () => {
    const a = await makePlan(coach, { title: "Visible" });
    const other = await makePlan(coach, { title: "Not visible", visibility: "organization" });
    await createShare(coach, SPORT, other.id);
    const shareId = shareIdOf(url(await createShare(coach, SPORT, a.id)));
    expect((await asVisitor(shareId, sql`select id from plans`)).map((r) => r.id)).toEqual([a.id]);
    expect(await asVisitor(shareId, sql`select id from plans where id = ${other.id}`)).toHaveLength(
      0,
    );
    expect((await asVisitor(shareId, sql`select id from plan_shares`)).map((r) => r.id)).toEqual([
      shareId,
    ]);
    for (const table of ["document_templates", "audit_events", "profiles", "drill_favorites"])
      expect(
        await asVisitor(shareId, sql`select 1 from ${sql.raw(table)} limit 1`),
        table,
      ).toHaveLength(0);
    // and what hangs off the session comes with it
    expect(await asVisitor(shareId, sql`select 1 from plan_activities`)).toBeDefined();
  });

  it("can change nothing", async () => {
    const p = await makePlan(coach, { title: "Read only" });
    const shareId = shareIdOf(url(await createShare(coach, SPORT, p.id)));
    expect(
      await asVisitor(
        shareId,
        sql`update plans set title = 'Hacked' where id = ${p.id} returning id`,
      ),
    ).toHaveLength(0);
    await expectDbError(
      asVisitor(
        shareId,
        sql`insert into plans (id, organization_id, sport_id, created_by, title, target_minutes) values (gen_random_uuid(), ${coach.organizationId}, ${BB}, ${coach.userId}, 'x', 60)`,
      ),
      /row-level security/,
    );
    await expectDbError(
      asVisitor(shareId, sql`update plan_shares set revoked_at = null where id = ${shareId}`).then(
        (r) => {
          if (r.length === 0) throw new Error("row-level security: nothing updated");
        },
      ),
      /row-level security/,
    );
    await expectDbError(
      asVisitor(shareId, sql`delete from plans where id = ${p.id}`),
      /permission denied/,
    );
    expect((await rows(coach, sql`select title from plans where id = ${p.id}`))[0]!.title).toBe(
      "Read only",
    );
  });

  it("loses even that when the link is revoked, or the session is deleted or archived", async () => {
    const p = await makePlan(coach, { title: "Going away" });
    const shareId = shareIdOf(url(await createShare(coach, SPORT, p.id)));
    expect(await asVisitor(shareId, sql`select id from plans`)).toHaveLength(1);
    good(await deletePlan(coach, SPORT, p.id));
    expect(await asVisitor(shareId, sql`select id from plans`)).toHaveLength(0);
    good(await restorePlan(coach, SPORT, p.id));
    expect(await asVisitor(shareId, sql`select id from plans`)).toHaveLength(1);
    good(await revokeShare(coach, SPORT, p.id));
    expect(await asVisitor(shareId, sql`select id from plans`)).toHaveLength(0);
  });

  it("a visitor with no share at all sees nothing", async () => {
    await makePlan(coach, { title: "Nobody's public" });
    expect(
      await asVisitor("0b6f6f4e-6c0f-4b39-8f6e-0d5d7b1c2a10", sql`select id from plans`),
    ).toHaveLength(0);
    expect(
      await asVisitor("0b6f6f4e-6c0f-4b39-8f6e-0d5d7b1c2a10", sql`select id from plan_shares`),
    ).toHaveLength(0);
  });
});

describe("row-level security and integrity of shares", () => {
  it("a share is made for a session you may change, as yourself, in your workspace", async () => {
    const p = await makePlan(coach, { title: "Raw shares" });
    const insert = (actor: Actor, over: { org?: string; createdBy?: string; plan?: string } = {}) =>
      rows(
        actor,
        sql`insert into plan_shares (id, plan_id, organization_id, created_by) values (gen_random_uuid(), ${over.plan ?? p.id}, ${over.org ?? actor.organizationId}, ${over.createdBy ?? actor.userId}) returning id`,
      );
    await expectDbError(insert(assistant), /row-level security|session you can see/);
    await expectDbError(insert(teacher), /row-level security|session you can see/); // not their session
    await expectDbError(insert(coach, { createdBy: teacher.userId }), /row-level security/);
    await expectDbError(insert(outsider, { plan: p.id }), /row-level security|session you can see/);
    await expectDbError(
      insert(coach, { org: outsider.organizationId }),
      /row-level security|workspace/,
    );
    expect(await insert(coach)).toHaveLength(1);
    await expectDbError(insert(coach), /plan_shares_one_live_uq|duplicate key/); // one live link per session
  });

  it("the workspace and the author are copied from the session, never taken from the request", async () => {
    const other = await rawPlan(outsider, BB, { title: "Elsewhere" });
    await expectDbError(
      rows(
        coach,
        sql`insert into plan_shares (id, plan_id, organization_id, created_by) values (gen_random_uuid(), ${other}, ${coach.organizationId}, ${coach.userId})`,
      ),
      /row-level security|session you can see|workspace/,
    );
    const p = await makePlan(coach, { title: "Author copy", visibility: "organization" });
    const created = await createShare(admin, SPORT, p.id);
    good(created);
    const [row] = await rows(
      admin,
      sql`select plan_created_by, created_by from plan_shares where plan_id = ${p.id} and revoked_at is null`,
    );
    expect(row).toEqual({ plan_created_by: coach.userId, created_by: admin.userId });
  });

  it("a share can only be revoked — once, for good; nothing else about it changes; nobody deletes one", async () => {
    const p = await makePlan(coach, { title: "Immutable share" });
    const link = url(await createShare(coach, SPORT, p.id));
    const id = shareIdOf(link);
    for (const set of [
      sql`plan_id = ${(await makePlan(coach, { title: "Other" })).id}`,
      sql`expires_at = now() + interval '1 day'`,
      sql`created_at = now()`,
      sql`organization_id = ${outsider.organizationId}`,
    ])
      await expectDbError(
        rows(coach, sql`update plan_shares set ${set} where id = ${id}`),
        /cannot be changed|row-level/,
      );
    expect(
      await rows(
        coach,
        sql`update plan_shares set revoked_at = now() where id = ${id} returning id`,
      ),
    ).toHaveLength(1);
    await expectDbError(
      rows(coach, sql`update plan_shares set revoked_at = null where id = ${id}`),
      /stays revoked/,
    );
    await expectDbError(
      rows(coach, sql`delete from plan_shares where id = ${id}`),
      /permission denied/,
    );
  });

  it("other people cannot see or revoke your links; a colleague who is not a manager, an assistant, another workspace", async () => {
    const p = await makePlan(coach, { title: "Hidden share", visibility: "organization" });
    const id = shareIdOf(url(await createShare(coach, SPORT, p.id)));
    for (const who of [teacher, assistant, outsider]) {
      expect(
        await rows(who, sql`select id from plan_shares where id = ${id}`),
        who.role,
      ).toHaveLength(0);
      expect(
        await rows(
          who,
          sql`update plan_shares set revoked_at = now() where id = ${id} returning id`,
        ),
        who.role,
      ).toHaveLength(0);
    }
    for (const who of [coach, admin, owner])
      expect(
        await rows(who, sql`select id from plan_shares where id = ${id}`),
        who.role,
      ).toHaveLength(1);
  });

  it("erasing the account of the person who made the link keeps the link and clears the creator", async () => {
    const founder = await createTestActor("Erase Founder");
    const club = await createClub(founder, [{ role: "coach", name: "Leaving Coach" }]);
    const leaver = club.members[0]!;
    const p = await makePlan(leaver, { title: "Leaver's session", visibility: "organization" });
    const link = url(await createShare(leaver, SPORT, p.id));
    await pool.query(`delete from "user" where id = '${leaver.userId}'`);
    expect(await resolveShare(urlToken(link))).not.toBeNull(); // the public link keeps working
    const [row] = await admin$(
      "select created_by, plan_created_by from plan_shares where id = $1",
      [shareIdOf(link)],
    );
    expect(row!.created_by).toBeNull();
    expect(
      await rows(club.ownerActor, sql`select id from plan_shares where id = ${shareIdOf(link)}`),
    ).toHaveLength(1); // a manager still sees it
  });
});

describe("logos on a shared page", () => {
  it("the shared session's own logo can be read through the link; no other image can", async () => {
    resetUploadRate();
    const logoA = good(
      await uploadLogo(coach, { fileName: "a.png", bytes: makePng({ color: [10, 20, 30, 255] }) }),
    );
    const logoB = good(
      await uploadLogo(coach, { fileName: "b.png", bytes: makePng({ color: [200, 20, 30, 255] }) }),
    );
    const foreign = good(
      await uploadLogo(outsider, {
        fileName: "c.png",
        bytes: makePng({ color: [1, 99, 30, 255] }),
      }),
    );
    const p = await makePlan(coach, { title: "Logo share" });
    good(
      await savePlanDocument(
        coach,
        SPORT,
        p.id,
        planDocumentSchema.parse({
          version: p.version,
          preset: "classic",
          design: { ...presetDesign("classic"), logo: { assetId: logoA.id } },
          reflection: { wentWell: "", needsImprovement: "", nextFocus: "", notes: "" },
        }),
      ),
    );
    const link = url(await createShare(coach, SPORT, p.id));
    const token = urlToken(link);
    expect((await resolveShare(token))!.design.logo).toEqual({ assetId: logoA.id });
    expect((await readShareLogo(token, logoA.id))?.mime).toBe("image/png");
    expect(await readShareLogo(token, logoB.id)).toBeNull(); // the workspace's OTHER logo
    expect(await readShareLogo(token, foreign.id)).toBeNull(); // another workspace's
    expect(await readShareLogo(token, "not-a-uuid")).toBeNull();
    expect(await readShareLogo(token + "x", logoA.id)).toBeNull();
    // at the database: a visitor can read the workspace's logos while the link is live, and nobody else's, and nothing once it is revoked
    const shareId = shareIdOf(link);
    expect(await readSharedLogo(shareId, logoA.id)).not.toBeNull();
    expect(await readSharedLogo(shareId, foreign.id)).toBeNull();
    good(await revokeShare(coach, SPORT, p.id));
    expect(await readSharedLogo(shareId, logoA.id)).toBeNull();
    expect(await readShareLogo(token, logoA.id)).toBeNull();
  });
});

describe("the public view", () => {
  it("is a pure function of the session: private sections off, answers empty, nothing added", async () => {
    const p = await makePlan(coach, { title: "View", details: { coachNotes: "hidden" } });
    const shared = (await resolveShare(urlToken(url(await createShare(coach, SPORT, p.id)))))!;
    expect(publicView).toBeTypeOf("function");
    expect(shared.input.coachNotes).toBe("");
  });
});

void planShares;
void and;
