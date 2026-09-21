import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { auditEvents, mediaAssets } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import { presetDesign } from "@/modules/documents";
import {
  deleteLogo,
  uploadLogo,
  resetUploadRate,
  MAX_LOGOS_PER_WORKSPACE,
} from "@/modules/media/commands";
import { listLogos, readLogo } from "@/modules/media/queries";
import { makeJpeg, makePng, SIMPLE_SVG } from "@/modules/media/test-support";
import { savePlanDocument } from "@/modules/plans/commands";
import { planDocumentSchema } from "@/modules/plans/validators";
import { createTemplate } from "@/modules/templates/commands";
import { createClub, expectDbError } from "./drill-fixtures";
import { createTestActor } from "./factories";
import { adminPool, makePlan } from "./plan-fixtures";
import { templateInput } from "./template-fixtures";

/**
 * Logos through the real commands, permissions and database (Step 7): who may upload and delete, what is stored
 * (stripped, deduplicated, bounded), who can read it, and that a design can only ever point at one of its OWN workspace's
 * live logos. Raw statements check that the database itself refuses what the application would.
 */

let owner: Actor;
let admin: Actor;
let coach: Actor;
let teacher: Actor;
let assistant: Actor;
let outsider: Actor;

const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
const fieldOf = (r: Result<unknown>) => (r.ok ? "" : (r.error.fields?.file?.[0] ?? ""));
const good = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r.error)}`);
  return r.data;
};
const upload = (actor: Actor, bytes: Uint8Array, fileName = "crest.png") =>
  uploadLogo(actor, { fileName, bytes });
let colour = 0;
/** A distinct PNG each time (same colour = same picture = one logo). */
const png = (o: Parameters<typeof makePng>[0] = {}) =>
  makePng({ color: [(colour += 7) % 256, (colour * 3) % 256, 90, 255], ...o });

const rows = async (actor: Actor, query: ReturnType<typeof sql>) =>
  (await tenantTx(actor, (tx) => tx.execute(query))).rows as Array<Record<string, unknown>>;

beforeAll(async () => {
  const founder = await createTestActor("Logo Founder");
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
beforeEach(async () => {
  resetUploadRate();
  // every test starts with an empty logo shelf (the workspace limit is 20 and the tests share one club)
  const superuser = adminPool();
  try {
    await superuser.query("update media_assets set deleted_at = now() where deleted_at is null");
  } finally {
    await superuser.end();
  }
});
afterAll(async () => {
  await pool.end();
});

describe("uploading a logo", () => {
  it("stores a PNG, a JPEG and an SVG, returns a description of them, never the bytes", async () => {
    const a = good(await upload(coach, png({ width: 120, height: 60 }), "Riverside BC logo.png"));
    expect(a).toMatchObject({
      mime: "image/png",
      width: 120,
      height: 60,
      name: "Riverside BC logo",
      isMine: true,
      canDelete: true,
    });
    expect(a.url).toBe(`/logos/${a.id}`);
    expect(JSON.stringify(a)).not.toContain("data");
    const b = good(await upload(coach, makeJpeg({ width: 200, height: 100 }), "photo.jpg"));
    expect(b.mime).toBe("image/jpeg");
    const c = good(await upload(coach, Buffer.from(SIMPLE_SVG), "crest.svg"));
    expect(c).toMatchObject({ mime: "image/svg+xml", width: 256, height: 128 });
  });

  it("keeps only the cleaned file: metadata is gone from what is in the database", async () => {
    const dirty = png({ metadata: true });
    const logo = good(await upload(coach, dirty));
    const file = (await readLogo(coach, logo.id))!;
    const text = file.bytes.toString("latin1");
    for (const secret of ["GPS-LATITUDE-SECRET", "Somebody Private"])
      expect(text).not.toContain(secret);
    const jpeg = good(await upload(coach, makeJpeg({ metadata: true, width: 90, height: 90 })));
    expect((await readLogo(coach, jpeg.id))!.bytes.toString("latin1")).not.toContain("GPSLatitude");
  });

  it("recognises the same picture: uploading it again is the same logo", async () => {
    const bytes = png();
    const first = good(await upload(coach, bytes));
    const again = good(await upload(teacher, bytes, "other name.png"));
    expect(again.id).toBe(first.id);
    const [{ n }] = (await rows(
      coach,
      sql`select count(*)::int as n from media_assets where id = ${first.id}`,
    )) as [{ n: number }];
    expect(n).toBe(1);
  });

  it("refuses what is not a logo, with a reason the form can say", async () => {
    expect(fieldOf(await upload(coach, Buffer.from("<html><script>1</script></html>")))).toBe(
      "logo_type",
    );
    expect(fieldOf(await upload(coach, makePng({ trailing: Buffer.from("x") })))).toBe(
      "logo_corrupt",
    );
    expect(fieldOf(await upload(coach, makePng({ width: 8, height: 8 })))).toBe("logo_dimensions");
    expect(fieldOf(await upload(coach, Buffer.alloc(0)))).toBe("logo_empty");
    expect(fieldOf(await upload(coach, Buffer.alloc(1_100_000)))).toBe("logo_too_large");
    expect(
      fieldOf(
        await upload(
          coach,
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><script>alert(1)</script></svg>',
          ),
        ),
      ),
    ).toBe("logo_svg_unsafe");
    expect(codeOf(await upload(coach, Buffer.from("x")))).toBe("VALIDATION");
    const [{ n }] = (await rows(
      coach,
      sql`select count(*)::int as n from media_assets where name = 'crest' and deleted_at is null`,
    )) as [{ n: number }];
    expect(n).toBe(0); // nothing refused was stored
  });

  it("is for authors: an assistant cannot upload; another workspace's actor uploads into its own", async () => {
    expect(codeOf(await upload(assistant, png()))).toBe("FORBIDDEN");
    const own = good(await upload(outsider, png()));
    expect(await readLogo(coach, own.id)).toBeNull();
  });

  it("is rate limited per person and bounded per workspace", async () => {
    for (let i = 0; i < 10; i++) good(await upload(teacher, png({ width: 20 + i, height: 20 })));
    expect(codeOf(await upload(teacher, png({ width: 40, height: 20 })))).toBe("RATE_LIMITED");
    resetUploadRate();
    const founder = await createTestActor("Full Workspace");
    const alone = founder;
    for (let batch = 0; batch < 2; batch++) {
      for (let i = 0; i < MAX_LOGOS_PER_WORKSPACE / 2; i++)
        good(await upload(alone, png({ width: 20 + batch * 20 + i, height: 21 })));
      resetUploadRate();
    }
    expect(fieldOf(await upload(alone, png({ width: 99, height: 22 })))).toBe("logo_limit");
  });

  it("is audited", async () => {
    const logo = good(await upload(coach, png()));
    const events = await tenantTx(coach, (tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(
          and(eq(auditEvents.action, "media.logo_uploaded"), eq(auditEvents.entityId, logo.id)),
        ),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.metadata).toMatchObject({ mime: "image/png" });
  });
});

describe("who can see and delete a logo", () => {
  it("every member of the workspace sees it (assistants use logos too); another workspace does not", async () => {
    const logo = good(await upload(coach, png()));
    for (const who of [owner, admin, teacher, assistant]) {
      expect((await readLogo(who, logo.id))?.mime, who.role).toBe("image/png");
      expect(
        (await listLogos(who)).map((l) => l.id),
        who.role,
      ).toContain(logo.id);
    }
    expect(await readLogo(outsider, logo.id)).toBeNull();
    expect((await listLogos(outsider)).map((l) => l.id)).not.toContain(logo.id);
    expect(await readLogo(coach, "not-a-uuid")).toBeNull();
  });

  it("the uploader or an owner/admin may delete; a colleague or an assistant may not; deleting hides it everywhere", async () => {
    const logo = good(await upload(coach, png()));
    expect(codeOf(await deleteLogo(teacher, logo.id))).toBe("FORBIDDEN");
    expect(codeOf(await deleteLogo(assistant, logo.id))).toBe("FORBIDDEN");
    expect(codeOf(await deleteLogo(outsider, logo.id))).toBe("NOT_FOUND");
    expect((await listLogos(teacher)).find((l) => l.id === logo.id)?.canDelete).toBe(false);
    expect((await listLogos(admin)).find((l) => l.id === logo.id)?.canDelete).toBe(true);
    good(await deleteLogo(admin, logo.id));
    expect(await readLogo(coach, logo.id)).toBeNull();
    expect((await listLogos(coach)).map((l) => l.id)).not.toContain(logo.id);
    expect(codeOf(await deleteLogo(coach, logo.id))).toBe("NOT_FOUND"); // already gone
    const mine = good(await upload(coach, png()));
    expect(codeOf(await deleteLogo(coach, mine.id))).toBe("OK");
  });

  it("the same picture can be uploaded again after it was deleted", async () => {
    const bytes = png();
    const first = good(await upload(coach, bytes));
    good(await deleteLogo(coach, first.id));
    const second = good(await upload(coach, bytes));
    expect(second.id).not.toBe(first.id);
    expect(await readLogo(coach, second.id)).not.toBeNull();
  });
});

describe("a design may only point at its own workspace's live logo", () => {
  const design = (assetId: string | null) => ({
    ...presetDesign("classic"),
    logo: assetId ? { assetId } : null,
  });
  const save = async (actor: Actor, planId: string, version: number, assetId: string | null) =>
    savePlanDocument(
      actor,
      "basketball",
      planId,
      planDocumentSchema.parse({
        version,
        preset: "classic",
        design: design(assetId),
        reflection: { wentWell: "", needsImprovement: "", nextFocus: "", notes: "" },
      }),
    );

  it("a session design accepts the workspace's logo, and refuses another workspace's, a deleted one and a guessed id", async () => {
    const mine = good(await upload(coach, png()));
    const theirs = good(await upload(outsider, png()));
    const gone = good(await upload(coach, png()));
    good(await deleteLogo(coach, gone.id));
    const p = await makePlan(coach, { title: "Logo session" });
    const ok = good(await save(coach, p.id, p.version, mine.id));
    for (const bad of [theirs.id, gone.id, "0b6f6f4e-6c0f-4b39-8f6e-0d5d7b1c2a10"]) {
      const r = await save(coach, p.id, ok.version, bad);
      expect(codeOf(r), bad).toBe("VALIDATION");
      expect(r.ok ? {} : r.error.fields, bad).toEqual({ "design.logo": ["logo_unknown"] });
    }
    expect(codeOf(await save(coach, p.id, ok.version, null))).toBe("OK"); // no logo is always fine
  });

  it("a template design is held to the same rule", async () => {
    const mine = good(await upload(coach, png()));
    const theirs = good(await upload(outsider, png()));
    expect(
      codeOf(await createTemplate(coach, "basketball", templateInput({ design: design(mine.id) }))),
    ).toBe("OK");
    const r = await createTemplate(
      coach,
      "basketball",
      templateInput({ design: design(theirs.id) }),
    );
    expect(codeOf(r)).toBe("VALIDATION");
  });
});

describe("row-level security on stored images", () => {
  const insert = (actor: Actor, over: Record<string, unknown> = {}) => {
    const bytes = png();
    return tenantTx(actor, (tx) =>
      tx.insert(mediaAssets).values({
        id: crypto.randomUUID(),
        organizationId: actor.organizationId,
        mime: "image/png",
        name: "raw",
        width: 64,
        height: 64,
        byteSize: bytes.length,
        sha256: "0".repeat(64),
        data: bytes,
        createdBy: actor.userId,
        ...over,
      }),
    );
  };

  it("an author inserts as themselves in their workspace; nobody else, and nothing malformed", async () => {
    await insert(coach);
    await expectDbError(insert(assistant), /row-level security/);
    await expectDbError(insert(coach, { createdBy: teacher.userId }), /row-level security/);
    await expectDbError(
      insert(coach, { organizationId: outsider.organizationId }),
      /row-level security/,
    );
    await expectDbError(insert(coach, { byteSize: 5 }), /bytes_chk/);
    await expectDbError(insert(coach, { mime: "image/gif" }), /mime_chk/);
    await expectDbError(insert(coach, { width: 5000 }), /dimensions_chk/);
    await expectDbError(insert(coach, { kind: "avatar" }), /kind_chk/);
  });

  it("a stored image cannot be edited, un-deleted or hard-deleted", async () => {
    const logo = good(await upload(coach, png()));
    await expectDbError(
      rows(coach, sql`update media_assets set data = ${Buffer.from("x")} where id = ${logo.id}`),
      /cannot be changed|bytes_chk/,
    );
    await expectDbError(
      rows(coach, sql`update media_assets set mime = 'image/jpeg' where id = ${logo.id}`),
      /cannot be changed/,
    );
    await expectDbError(
      rows(
        coach,
        sql`update media_assets set organization_id = ${outsider.organizationId} where id = ${logo.id}`,
      ),
      /cannot be changed|row-level/,
    );
    await expectDbError(
      rows(coach, sql`delete from media_assets where id = ${logo.id}`),
      /permission denied/,
    );
    good(await deleteLogo(coach, logo.id));
    const superuser = adminPool();
    try {
      const { rows: all } = await superuser.query(
        "select deleted_at from media_assets where id = $1",
        [logo.id],
      );
      expect(all[0]!.deleted_at).not.toBeNull(); // soft: the row is still there
    } finally {
      await superuser.end();
    }
  });

  it("a colleague cannot delete another's logo by SQL either; an assistant cannot update at all", async () => {
    const logo = good(await upload(coach, png()));
    expect(
      await rows(
        teacher,
        sql`update media_assets set deleted_at = now() where id = ${logo.id} returning id`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(
        assistant,
        sql`update media_assets set deleted_at = now() where id = ${logo.id} returning id`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(
        admin,
        sql`update media_assets set deleted_at = now() where id = ${logo.id} returning id`,
      ),
    ).toHaveLength(1);
  });
});
