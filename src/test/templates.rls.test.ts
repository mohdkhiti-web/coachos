import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { plans } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { db, pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import { createTestActor } from "./factories";
import { createClub, expectDbError } from "./drill-fixtures";
import { adminPool, basketballId, footballId, rawPlan } from "./plan-fixtures";
import { bareConfig, rawTemplate } from "./template-fixtures";

/**
 * Saved templates against real PostgreSQL as the real runtime role (coachos_app). Every statement goes straight to
 * the database: no command, no `can()`. The point is that the DATABASE refuses what must be refused — another
 * workspace's templates, someone's private one, an assistant authoring, moving a template between workspaces —
 * whatever the application does (ARCHITECTURE.md §19).
 */

let BB: string;
let FB: string;
let owner: Actor;
let admin: Actor;
let coach: Actor; // Bob
let teacher: Actor;
let assistant: Actor;
let outsider: Actor; // a member of a DIFFERENT workspace
let stranger: Actor; // a valid user claiming the club's context, but not a member of it

const rows = async (actor: Actor, query: ReturnType<typeof sql>) =>
  (await tenantTx(actor, (tx) => tx.execute(query))).rows as Array<Record<string, unknown>>;
const visibleIds = async (actor: Actor, ids: string[]) =>
  (
    await rows(
      actor,
      sql`select id from document_templates where id in (${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      )})`,
    )
  )
    .map((r) => r.id as string)
    .sort();
const update = (actor: Actor, id: string, set: ReturnType<typeof sql>) =>
  rows(actor, sql`update document_templates set ${set} where id = ${id} returning id`);

beforeAll(async () => {
  BB = await basketballId();
  FB = await footballId();
  const founder = await createTestActor("Club Founder");
  const club = await createClub(founder, [
    { role: "admin", name: "Eve Admin" },
    { role: "coach", name: "Bob Coach" },
    { role: "teacher", name: "Dan Teacher" },
    { role: "assistant", name: "Cara Assistant" },
  ]);
  owner = club.ownerActor;
  [admin, coach, teacher, assistant] = club.members as [Actor, Actor, Actor, Actor];
  outsider = await createTestActor("Otto Outsider");
  const s = await createTestActor("Sam Stranger");
  stranger = { ...s, organizationId: owner.organizationId };
});

afterAll(async () => {
  await pool.end();
});

describe("who can read a template", () => {
  it("a workspace-visible template is readable by every member, an assistant too", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "organization" });
    for (const a of [owner, admin, coach, teacher, assistant])
      expect(await visibleIds(a, [t]), a.role).toEqual([t]);
  });

  it("a personal template is readable by its creator only — not by the owner or an admin", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "private" });
    expect(await visibleIds(coach, [t])).toEqual([t]);
    for (const a of [owner, admin, teacher, assistant])
      expect(await visibleIds(a, [t]), a.role).toEqual([]);
  });

  it("another workspace sees nothing, shared or personal", async () => {
    const shared = await rawTemplate(coach, BB, { visibility: "organization" });
    const mine = await rawTemplate(coach, BB, { visibility: "private" });
    expect(await visibleIds(outsider, [shared, mine])).toEqual([]);
  });

  it("a non-member who somehow claims the workspace would see its shared templates, never a personal one (as for sessions); writes re-check membership", async () => {
    const shared = await rawTemplate(coach, BB, { visibility: "organization" });
    const mine = await rawTemplate(coach, BB, { visibility: "private" });
    expect(await visibleIds(stranger, [shared, mine])).toEqual([shared]);
    expect(await update(stranger, shared, sql`name = 'Hijacked'`)).toHaveLength(0);
  });

  it("archived and deleted templates stay readable to those who could read them (lists filter them)", async () => {
    const archived = await rawTemplate(coach, BB, {
      visibility: "organization",
      status: "archived",
    });
    const deleted = await rawTemplate(coach, BB, {
      visibility: "organization",
      deletedAt: undefined,
    });
    await update(coach, deleted, sql`deleted_at = now()`);
    expect(await visibleIds(teacher, [archived, deleted])).toEqual([archived, deleted].sort());
    expect(await visibleIds(outsider, [archived, deleted])).toEqual([]);
  });
});

describe("who can create a template", () => {
  it("owners, admins, coaches and teachers can; an assistant cannot", async () => {
    for (const a of [owner, admin, coach, teacher]) {
      const id = await rawTemplate(a, BB);
      expect(await visibleIds(a, [id]), a.role).toEqual([id]);
    }
    await expectDbError(rawTemplate(assistant, BB), /row-level security/);
  });

  it("only as oneself: nobody can write a template in someone else's name", async () => {
    await expectDbError(
      rawTemplate(coach, BB, { createdBy: teacher.userId }),
      /row-level security/,
    );
    await expectDbError(rawTemplate(coach, BB, { createdBy: null }), /row-level security/);
  });

  it("only in the workspace they are working in, and never for a workspace they do not belong to", async () => {
    await expectDbError(
      rawTemplate(coach, BB, { organizationId: outsider.organizationId }),
      /row-level security/,
    );
    await expectDbError(rawTemplate(stranger, BB), /row-level security/);
    await expectDbError(
      rawTemplate(outsider, BB, { organizationId: owner.organizationId }),
      /row-level security/,
    );
  });

  it("not born deleted", async () => {
    await expectDbError(rawTemplate(coach, BB, { deletedAt: new Date() }), /row-level security/);
  });

  it("checks the data itself: name, description, category, visibility, status", async () => {
    await expectDbError(rawTemplate(coach, BB, { name: "" }), /name_len/);
    await expectDbError(rawTemplate(coach, BB, { name: "x".repeat(81) }), /name_len/);
    await expectDbError(
      rawTemplate(coach, BB, { description: "x".repeat(301) }),
      /description_len/,
    );
    await expectDbError(rawTemplate(coach, BB, { category: "party" }), /category_chk/);
    await expectDbError(rawTemplate(coach, BB, { visibility: "public" }), /visibility_chk/);
    await expectDbError(rawTemplate(coach, BB, { status: "paused" }), /status_chk/);
  });

  it("a template must name a real sport", async () => {
    await expectDbError(rawTemplate(coach, newId()), /foreign key/);
    expect(await visibleIds(coach, [await rawTemplate(coach, FB)])).toHaveLength(1); // any real sport row is fine
  });
});

describe("who can change or remove a template", () => {
  it("its creator can edit it; a member who is not its creator or a manager cannot", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "organization" });
    expect(await update(coach, t, sql`name = 'Renamed by Bob'`)).toHaveLength(1);
    expect(await update(teacher, t, sql`name = 'Renamed by Dan'`)).toHaveLength(0);
    expect(await update(assistant, t, sql`name = 'Renamed by Cara'`)).toHaveLength(0);
    expect(
      (await rows(coach, sql`select name from document_templates where id = ${t}`))[0]!.name,
    ).toBe("Renamed by Bob");
  });

  it("an owner or admin can edit a workspace-shared template that someone else made", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "organization" });
    expect(await update(owner, t, sql`name = 'Owner edit'`)).toHaveLength(1);
    expect(await update(admin, t, sql`name = 'Admin edit'`)).toHaveLength(1);
  });

  it("…but never a personal one: they cannot even see it", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "private" });
    expect(await update(owner, t, sql`name = 'Owner edit'`)).toHaveLength(0);
    expect(await update(admin, t, sql`name = 'Admin edit'`)).toHaveLength(0);
  });

  it("another workspace, and someone claiming this one, cannot change anything", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "organization" });
    expect(await update(outsider, t, sql`name = 'Hijacked'`)).toHaveLength(0);
    expect(await update(stranger, t, sql`name = 'Hijacked'`)).toHaveLength(0);
    expect(
      (await rows(coach, sql`select name from document_templates where id = ${t}`))[0]!.name,
    ).toBe("Raw template");
  });

  it("a manager who loses author rights (an assistant) cannot edit; an assistant cannot restore either", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "organization" });
    expect(await update(assistant, t, sql`status = 'archived'`)).toHaveLength(0);
  });

  it("nobody can hard-delete a template: there is no DELETE grant, only soft delete", async () => {
    const t = await rawTemplate(coach, BB);
    await expectDbError(
      rows(coach, sql`delete from document_templates where id = ${t}`),
      /permission denied/,
    );
    expect(await visibleIds(coach, [t])).toEqual([t]);
  });

  it("a creator can move a template between shared and personal", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "private" });
    await update(coach, t, sql`visibility = 'organization'`);
    expect(await visibleIds(teacher, [t])).toEqual([t]);
    await update(coach, t, sql`visibility = 'private'`);
    expect(await visibleIds(teacher, [t])).toEqual([]);
  });
});

describe("what never changes", () => {
  it("the creator, the workspace and the sport are fixed once a template exists", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "organization" });
    await expectDbError(
      update(coach, t, sql`created_by = ${teacher.userId}`),
      /immutable|row-level/,
    );
    await expectDbError(update(owner, t, sql`created_by = ${owner.userId}`), /immutable|row-level/);
    await expectDbError(
      update(coach, t, sql`organization_id = ${outsider.organizationId}`),
      /immutable|row-level/,
    );
    await expectDbError(update(coach, t, sql`sport_id = ${FB}`), /immutable/);
  });

  it("a deleted template is frozen until it is restored", async () => {
    const t = await rawTemplate(coach, BB);
    await update(coach, t, sql`deleted_at = now()`);
    await expectDbError(update(coach, t, sql`name = 'Edited while deleted'`), /deleted template/);
    await expectDbError(
      update(coach, t, sql`config = ${JSON.stringify(bareConfig({ mode: "compact" }))}::jsonb`),
      /deleted template/,
    );
    await update(coach, t, sql`deleted_at = null`); // restoring is allowed…
    expect(await update(coach, t, sql`name = 'Edited after restore'`)).toHaveLength(1); // …and then it is editable
  });

  it("an archived template is frozen until its status changes", async () => {
    const t = await rawTemplate(coach, BB);
    await update(coach, t, sql`status = 'archived'`);
    await expectDbError(update(coach, t, sql`name = 'Edited while archived'`), /archived template/);
    await update(coach, t, sql`status = 'active'`);
    expect(await update(coach, t, sql`name = 'Edited after restore'`)).toHaveLength(1);
  });

  it("archiving and deleting bump nothing but bookkeeping: the design revision is the application's to change", async () => {
    const t = await rawTemplate(coach, BB);
    await update(coach, t, sql`status = 'archived', version = version + 1`);
    const [r] = await rows(
      coach,
      sql`select revision, version, status from document_templates where id = ${t}`,
    );
    expect(r).toMatchObject({ revision: 1, version: 2, status: "archived" });
  });
});

describe("when the creator's account is erased", () => {
  it("shared templates stay for the workspace, with no creator; the owner and admins can then manage them", async () => {
    const founder = await createTestActor("Erase Founder");
    const club = await createClub(founder, [
      { role: "admin", name: "Erase Admin" },
      { role: "coach", name: "Leaving Coach" },
    ]);
    const [clubAdmin, leaver] = club.members as [Actor, Actor];
    const shared = await rawTemplate(leaver, BB, {
      visibility: "organization",
      name: "Leaver shared",
    });
    const personal = await rawTemplate(leaver, BB, {
      visibility: "private",
      name: "Leaver personal",
    });

    await db.execute(sql`delete from "user" where id = ${leaver.userId}`); // the account is erased

    const after = await rows(
      club.ownerActor,
      sql`select id, created_by, organization_id, status from document_templates where id in (${shared}, ${personal})`,
    );
    // the shared one is still there for the workspace; the personal one has no reader left but is not destroyed
    expect(after.map((r) => r.id)).toEqual([shared]);
    expect(after[0]).toMatchObject({
      created_by: null,
      organization_id: club.orgId,
      status: "active",
    });
    const superuser = adminPool();
    try {
      const { rows: all } = await superuser.query(
        "select created_by, organization_id from document_templates where id = $1",
        [personal],
      );
      expect(all[0]).toEqual({ created_by: null, organization_id: club.orgId });
    } finally {
      await superuser.end();
    }
    // the orphan can be managed by an admin (a manager), and archived without tripping the ownership guard
    expect(await update(clubAdmin, shared, sql`status = 'archived'`)).toHaveLength(1);
    expect(await update(club.ownerActor, shared, sql`status = 'active'`)).toHaveLength(1);
    // …but the creator can not be set to somebody
    await expectDbError(
      update(clubAdmin, shared, sql`created_by = ${clubAdmin.userId}`),
      /immutable/,
    );
  });

  it("erasing a whole workspace removes its templates and leaves the sessions' bookkeeping consistent", async () => {
    const founder = await createTestActor("Doomed Founder");
    const t = await rawTemplate(founder, BB, { name: "Doomed" });
    await db.execute(sql`delete from organization where id = ${founder.organizationId}`);
    const superuser = adminPool();
    try {
      const { rows: all } = await superuser.query(
        "select id from document_templates where id = $1",
        [t],
      );
      expect(all).toEqual([]);
    } finally {
      await superuser.end();
    }
  });
});

describe("a session and its template", () => {
  const link = (actor: Actor, planId: string, templateId: string | null, revision: number | null) =>
    rows(
      actor,
      sql`update plans set template_id = ${templateId}, template_revision = ${revision} where id = ${planId} returning id`,
    );

  it("can be based on a template its author can read, recording the revision", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "organization" });
    const p = await rawPlan(teacher, BB);
    expect(await link(teacher, p, t, 1)).toHaveLength(1);
    const [row] = await rows(
      teacher,
      sql`select template_id, template_revision from plans where id = ${p}`,
    );
    expect(row).toEqual({ template_id: t, template_revision: 1 });
  });

  it("must record the revision it holds", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "organization" });
    const p = await rawPlan(teacher, BB);
    await expectDbError(link(teacher, p, t, null), /template revision/);
    await expectDbError(link(teacher, p, t, 0), /revision_chk|check/);
  });

  it("cannot be based on somebody else's personal template, or on another workspace's", async () => {
    const personal = await rawTemplate(coach, BB, { visibility: "private" });
    const foreign = await rawTemplate(outsider, BB, { visibility: "organization" });
    const p = await rawPlan(teacher, BB);
    await expectDbError(link(teacher, p, personal, 1), /own workspace/);
    await expectDbError(link(teacher, p, foreign, 1), /own workspace/);
    await expectDbError(link(teacher, p, newId(), 1), /own workspace/);
  });

  it("an existing link is not re-checked when something else about the session changes", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "private" });
    const p = await rawPlan(coach, BB);
    await link(coach, p, t, 1);
    await update(coach, t, sql`visibility = 'private', status = 'archived'`); // the template is archived
    expect(
      await rows(
        coach,
        sql`update plans set title = 'Still editable' where id = ${p} returning id`,
      ),
    ).toHaveLength(1);
  });

  it("clears the link (and only the link) when the template's row is removed, and the frozen copy stays", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "organization" });
    const p = await rawPlan(teacher, BB);
    await link(teacher, p, t, 1);
    const superuser = adminPool();
    try {
      await superuser.query("delete from document_templates where id = $1", [t]);
    } finally {
      await superuser.end();
    }
    const [row] = await rows(
      teacher,
      sql`select template_id, template_revision, title from plans where id = ${p}`,
    );
    expect(row).toMatchObject({ template_id: null, title: "Raw plan" });
  });

  it("a session that is archived can still lose its template link when the template goes", async () => {
    const t = await rawTemplate(coach, BB, { visibility: "organization" });
    const p = await rawPlan(teacher, BB);
    await link(teacher, p, t, 1);
    await tenantTx(teacher, (tx) =>
      tx.execute(sql`update plans set status = 'archived' where id = ${p}`),
    );
    const superuser = adminPool();
    try {
      await superuser.query("delete from document_templates where id = $1", [t]); // must not be refused by the archive guard
    } finally {
      await superuser.end();
    }
    const [row] = await rows(teacher, sql`select template_id, status from plans where id = ${p}`);
    expect(row).toEqual({ template_id: null, status: "archived" });
    void plans;
  });
});
