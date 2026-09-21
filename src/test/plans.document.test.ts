import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { planActivities, plans } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { db, pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import {
  buildDocumentModel,
  defaultDocumentSettings,
  presetDesign,
  resolveDesign,
  type DocumentDesign,
  type PresetId,
  type Reflection,
} from "@/modules/documents";
import {
  addBreak,
  addCustomActivity,
  addDrillActivity,
  deletePlan,
  duplicatePlan,
  savePlanDocument,
  setPlanStatus,
} from "@/modules/plans/commands";
import { toDocumentInput } from "@/modules/plans/document-input";
import { getPlan } from "@/modules/plans/queries";
import {
  addBreakSchema,
  addCustomActivitySchema,
  addDrillActivitySchema,
  planDocumentSchema,
} from "@/modules/plans/validators";
import { createClub } from "./drill-fixtures";
import { createTestActor } from "./factories";
import { adminPool, libraryDrill, makePlan } from "./plan-fixtures";

/**
 * How a session prints, stored with the session: the design override, the preset it started from and the
 * reflection text. Through the real commands, permissions and database. What matters: the coach's design comes
 * back exactly, only the difference from the preset is stored, nobody else can change it, and it never gets in the
 * way of the timeline.
 */

const SPORT = "basketball";
let owner: Actor;
let coach: Actor;
let assistant: Actor;
let outsider: Actor;
let library: { id: string; version: number };

const good = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r.error)}`);
  return r.data;
};
const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);

const stored = async (a: Actor, id: string) => {
  const [row] = await tenantTx(a, (tx) =>
    tx.select({ s: plans.documentSettings }).from(plans).where(eq(plans.id, id)),
  );
  return row!.s;
};

const blank: Reflection = { wentWell: "", needsImprovement: "", nextFocus: "", notes: "" };
const payload = (
  version: number,
  over: { preset?: PresetId; design?: DocumentDesign; reflection?: Reflection } = {},
) =>
  planDocumentSchema.parse({
    version,
    preset: over.preset ?? "classic",
    design: over.design ?? presetDesign(over.preset ?? "classic"),
    reflection: over.reflection ?? blank,
  });

const customised = (base: DocumentDesign): DocumentDesign => ({
  ...base,
  colors: { ...base.colors, accent: "#0a7d4b" },
  page: { ...base.page, paper: "letter", orientation: "landscape", margins: "narrow" },
  sections: { ...base.sections, cover: true, reflection: true, safety: false },
  mode: "compact",
  footer: { text: "Riverside BC" },
});

const sessionWithDrills = async (a: Actor) => {
  const { id, version: created } = await makePlan(a, {
    title: "Tuesday",
    players: 12,
    scheduledDate: "2030-06-11",
    startTime: "18:30",
    timezone: "Europe/London",
  });
  let version = created;
  const drill = good(
    await addDrillActivity(
      a,
      SPORT,
      id,
      addDrillActivitySchema.parse({ drillId: library.id, version, durationMin: 12 }),
    ),
  );
  version = drill.version;
  version = good(
    await addBreak(a, SPORT, id, addBreakSchema.parse({ durationMin: 3, version })),
  ).version;
  version = good(
    await addCustomActivity(
      a,
      SPORT,
      id,
      addCustomActivitySchema.parse({
        title: "Free throws",
        durationMin: 8,
        version,
        content: { description: "Pairs shoot ten each.", instructions: [], coachingPoints: [] },
      }),
    ),
  ).version;
  return { id, version };
};

beforeAll(async () => {
  library = await libraryDrill();
  const founder = await createTestActor("Doc Founder");
  const club = await createClub(founder, [
    { role: "coach", name: "Bob Coach" },
    { role: "assistant", name: "Cara Assistant" },
  ]);
  owner = club.ownerActor;
  [coach, assistant] = club.members as [Actor, Actor];
  outsider = await createTestActor("Otto Outsider");
});

afterAll(async () => {
  await pool.end();
});

describe("a session that was never customised", () => {
  it("reads as the default preset with an empty reflection, and stores nothing", async () => {
    const { id } = await makePlan(coach);
    const plan = (await getPlan(coach, SPORT, id))!;
    expect(plan.documentSettings).toEqual(defaultDocumentSettings());
    expect(await stored(coach, id)).toEqual({});
  });
});

describe("saving a design", () => {
  it("stores the preset and only what differs from it, and hands the very same design back", async () => {
    const { id, version } = await makePlan(coach);
    const design = customised(presetDesign("school"));
    const saved = good(
      await savePlanDocument(
        coach,
        SPORT,
        id,
        payload(version, {
          preset: "school",
          design,
          reflection: { ...blank, wentWell: "Sharp press release." },
        }),
      ),
    );
    expect(saved.version).toBe(version + 1);

    expect(await stored(coach, id)).toEqual({
      schemaVersion: 1,
      preset: "school",
      overrides: {
        colors: { accent: "#0a7d4b" },
        page: { paper: "letter", orientation: "landscape", margins: "narrow" },
        mode: "compact",
        sections: { cover: true, reflection: true, safety: false },
        footer: { text: "Riverside BC" },
      },
      reflection: {
        wentWell: "Sharp press release.",
        needsImprovement: "",
        nextFocus: "",
        notes: "",
      },
    });

    const plan = (await getPlan(coach, SPORT, id))!;
    expect(plan.documentSettings.preset).toBe("school");
    expect(plan.documentSettings.reflection.wentWell).toBe("Sharp press release.");
    expect(
      resolveDesign({
        preset: plan.documentSettings.preset,
        override: plan.documentSettings.overrides,
      }),
    ).toEqual(design);
    expect(plan.version).toBe(saved.version);
  });

  it("saving the plain preset stores an empty override (nothing to keep in step with the preset)", async () => {
    const { id, version } = await makePlan(coach);
    good(await savePlanDocument(coach, SPORT, id, payload(version, { preset: "modern" })));
    const plan = (await getPlan(coach, SPORT, id))!;
    expect(plan.documentSettings).toMatchObject({ preset: "modern", overrides: {} });
  });

  it("replaces an earlier design completely", async () => {
    const { id, version } = await makePlan(coach);
    const first = good(
      await savePlanDocument(
        coach,
        SPORT,
        id,
        payload(version, { design: customised(presetDesign("classic")) }),
      ),
    );
    good(await savePlanDocument(coach, SPORT, id, payload(first.version, { preset: "dark" })));
    const plan = (await getPlan(coach, SPORT, id))!;
    expect(plan.documentSettings.overrides).toEqual({});
    expect(plan.documentSettings.preset).toBe("dark");
  });

  it("does not touch the timeline, the details or the totals", async () => {
    const { id, version } = await sessionWithDrills(coach);
    const before = (await getPlan(coach, SPORT, id))!;
    good(
      await savePlanDocument(
        coach,
        SPORT,
        id,
        payload(version, { design: customised(presetDesign("classic")) }),
      ),
    );
    const after = (await getPlan(coach, SPORT, id))!;
    expect(after.activities.map((a) => [a.id, a.title, a.durationMin, a.startMin])).toEqual(
      before.activities.map((a) => [a.id, a.title, a.durationMin, a.startMin]),
    );
    expect(after.totals).toEqual(before.totals);
    expect(after.details).toEqual(before.details);
    expect(after.schedule).toEqual(before.schedule);
    expect(after.title).toBe(before.title);
  });
});

describe("who may save, and when", () => {
  it("refuses a stale version and changes nothing", async () => {
    const { id, version } = await makePlan(coach);
    good(await savePlanDocument(coach, SPORT, id, payload(version, { preset: "youth" })));
    const stale = await savePlanDocument(coach, SPORT, id, payload(version, { preset: "dark" }));
    expect(codeOf(stale)).toBe("CONFLICT");
    expect((await getPlan(coach, SPORT, id))!.documentSettings.preset).toBe("youth");
  });

  it("is not visible to another workspace, or to a colleague on a private session", async () => {
    const { id, version } = await makePlan(coach); // private
    expect(codeOf(await savePlanDocument(outsider, SPORT, id, payload(version)))).toBe("NOT_FOUND");
    expect(codeOf(await savePlanDocument(owner, SPORT, id, payload(version)))).toBe("NOT_FOUND");
    expect((await getPlan(coach, SPORT, id))!.version).toBe(version);
  });

  it("lets an assistant read a shared session but not change how it prints", async () => {
    const { id, version } = await makePlan(coach, { visibility: "organization" });
    expect((await getPlan(assistant, SPORT, id))!.permissions.canEdit).toBe(false);
    expect(codeOf(await savePlanDocument(assistant, SPORT, id, payload(version)))).toBe(
      "FORBIDDEN",
    );
    // …while the author and other authors can
    expect(codeOf(await savePlanDocument(owner, SPORT, id, payload(version)))).toBe("OK");
  });

  it("refuses an archived session (it is frozen) and a deleted one (it is gone)", async () => {
    const { id, version } = await makePlan(coach);
    const archived = good(await setPlanStatus(coach, SPORT, id, "archived", version));
    expect(codeOf(await savePlanDocument(coach, SPORT, id, payload(archived.version)))).toBe(
      "FORBIDDEN",
    );
    const back = good(await setPlanStatus(coach, SPORT, id, "draft", archived.version));
    expect(codeOf(await savePlanDocument(coach, SPORT, id, payload(back.version)))).toBe("OK");

    const gone = await makePlan(coach);
    good(await deletePlan(coach, SPORT, gone.id));
    expect(codeOf(await savePlanDocument(coach, SPORT, gone.id, payload(gone.version)))).toBe(
      "NOT_FOUND",
    );
  });

  it("refuses text nobody can read, before anything is written", async () => {
    const { id, version } = await makePlan(coach);
    const base = presetDesign("classic");
    const unreadable = { ...base, colors: { ...base.colors, text: base.colors.background } };
    const r = await savePlanDocument(coach, SPORT, id, payload(version, { design: unreadable }));
    expect(codeOf(r)).toBe("VALIDATION");
    if (!r.ok && r.error.code === "VALIDATION")
      expect(r.error.fields).toEqual({ "design.colors.text": ["text_unreadable"] });
    expect((await getPlan(coach, SPORT, id))!.version).toBe(version);
    // a merely weak contrast is allowed (the design form warns; it does not forbid)
    const grey = { ...base, colors: { ...base.colors, text: "#8a8a8a" } };
    expect(
      codeOf(await savePlanDocument(coach, SPORT, id, payload(version, { design: grey }))),
    ).toBe("OK");
  });
});

describe("the payload itself is validated", () => {
  const ok = payload(1);
  const bad = (patch: object) => planDocumentSchema.safeParse({ ...ok, ...patch }).success;

  it("rejects malformed colours, unknown options, unknown keys and oversized text", () => {
    expect(
      bad({
        design: { ...ok.design, colors: { ...ok.design.colors, primary: "javascript:alert(1)" } },
      }),
    ).toBe(false);
    expect(bad({ design: { ...ok.design, page: { ...ok.design.page, paper: "a0" } } })).toBe(false);
    expect(bad({ design: { ...ok.design, html: "<script>" } })).toBe(false);
    expect(bad({ preset: "neon" })).toBe(false);
    expect(bad({ version: 0 })).toBe(false);
    expect(bad({ reflection: { ...blank, notes: "x".repeat(1501) } })).toBe(false);
    expect(bad({ design: { ...ok.design, footer: { text: "x".repeat(121) } } })).toBe(false);
    expect(bad({ design: { ...ok.design, logo: { assetId: "../../etc/passwd" } } })).toBe(false);
    expect(bad({})).toBe(true);
  });

  it("stores a logo only as a reference (a stored image's id), never as data", () => {
    const withLogo = planDocumentSchema.parse({
      ...ok,
      design: { ...ok.design, logo: { assetId: "01a0c262-7596-7410-91b4-08c214915c45" } },
    });
    expect(withLogo.design.logo).toEqual({ assetId: "01a0c262-7596-7410-91b4-08c214915c45" });
    expect(
      planDocumentSchema.safeParse({
        ...ok,
        design: { ...ok.design, logo: { assetId: "x", data: "AAAA" } },
      }).success,
    ).toBe(false);
  });
});

describe("what the database itself guarantees", () => {
  it("only accepts an object of a sane size in the column (a raw write cannot bypass the app)", async () => {
    const admin = adminPool();
    try {
      const { id } = await makePlan(coach);
      await expect(
        admin.query("UPDATE plans SET document_settings = '[]'::jsonb WHERE id = $1", [id]),
      ).rejects.toThrow(/plans_document_settings_chk/);
      await expect(
        admin.query(
          "UPDATE plans SET document_settings = to_jsonb(repeat('x', 20000)) WHERE id = $1",
          [id],
        ),
      ).rejects.toThrow(/plans_document_settings_chk/);
      await expect(
        admin.query(
          "UPDATE plans SET document_settings = jsonb_build_object('pad', repeat('x', 17000)) WHERE id = $1",
          [id],
        ),
      ).rejects.toThrow(/plans_document_settings_chk/);
    } finally {
      await admin.end();
    }
  });

  it("freezes an archived session's design like the rest of it, even against a direct write", async () => {
    const { id, version } = await makePlan(coach);
    good(await setPlanStatus(coach, SPORT, id, "archived", version));
    const attempt = tenantTx(coach, (tx) =>
      tx
        .update(plans)
        .set({ documentSettings: { schemaVersion: 1, preset: "dark" } })
        .where(eq(plans.id, id)),
    );
    await expect(attempt).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/archived session cannot be edited/) },
    });
  });

  it("falls back to the default look when a stored design is one this code cannot read", async () => {
    const { id } = await makePlan(coach);
    const admin = adminPool();
    try {
      await admin.query(
        `UPDATE plans SET document_settings = '{"schemaVersion": 99, "preset": "hologram"}'::jsonb WHERE id = $1`,
        [id],
      );
    } finally {
      await admin.end();
    }
    const plan = (await getPlan(coach, SPORT, id))!;
    expect(plan).not.toBeNull(); // the session is still there
    expect(plan.documentSettings).toEqual(defaultDocumentSettings());
  });
});

describe("duplicating a session", () => {
  it("prints the same way, with a clean reflection", async () => {
    const { id, version } = await makePlan(coach, { title: "Original" });
    good(
      await savePlanDocument(
        coach,
        SPORT,
        id,
        payload(version, {
          preset: "academy",
          design: customised(presetDesign("academy")),
          reflection: { ...blank, wentWell: "That session's notes" },
        }),
      ),
    );
    const copy = good(await duplicatePlan(coach, SPORT, id));
    const original = (await getPlan(coach, SPORT, id))!;
    const dup = (await getPlan(coach, SPORT, copy.id))!;
    expect(dup.documentSettings.preset).toBe("academy");
    expect(dup.documentSettings.overrides).toEqual(original.documentSettings.overrides);
    expect(dup.documentSettings.reflection).toEqual(blank);
    // and the original keeps its own
    expect(original.documentSettings.reflection.wentWell).toBe("That session's notes");
  });

  it("copies a never-customised session as never customised", async () => {
    const { id } = await makePlan(coach);
    const copy = good(await duplicatePlan(coach, SPORT, id));
    expect(await stored(coach, copy.id)).toEqual({});
  });
});

describe("a real session, all the way to a document", () => {
  it("maps the session onto the document input and builds pages from it", async () => {
    const { id } = await sessionWithDrills(coach);
    const plan = (await getPlan(coach, SPORT, id))!;
    const input = toDocumentInput(plan);

    expect(input).toMatchObject({
      title: "Tuesday",
      players: 12,
      scheduledDate: "2030-06-11",
      totalMinutes: 23,
      endTime: plan.schedule!.endTime,
    });
    // the times are the builder's: the same offsets the timeline shows
    expect(input.activities.map((a) => [a.title, a.startMin, a.endMin])).toEqual(
      plan.activities.map((a) => [a.title, a.startMin, a.endMin]),
    );
    const [drill, pause, custom] = input.activities;
    expect(drill!.kind).toBe("drill");
    expect(drill!.content!.instructions.length).toBeGreaterThan(0);
    expect(drill!.content!.diagrams.length).toBeGreaterThan(0);
    expect(drill!.content!.equipment.length).toBeGreaterThan(0);
    expect(pause).toMatchObject({ kind: "break", content: null });
    expect(custom!.content).toMatchObject({ description: "Pairs shoot ten each.", equipment: [] });

    const model = buildDocumentModel(input, presetDesign("classic"));
    expect(model.pageCount).toBeGreaterThan(1);
    expect(model.sections).toEqual(
      expect.arrayContaining(["overview", "timeline", "equipment", "diagrams"]),
    );
  });

  it("survives a JSON round trip, as it does on its way from the server to the browser", async () => {
    const { id } = await sessionWithDrills(coach);
    const input = toDocumentInput((await getPlan(coach, SPORT, id))!);
    const across = JSON.parse(JSON.stringify(input));
    expect(across).toEqual(input);
    expect(JSON.stringify(buildDocumentModel(across, presetDesign("modern")))).toBe(
      JSON.stringify(buildDocumentModel(input, presetDesign("modern"))),
    );
  });

  it("leaves activities alone when only the design is saved (row count and order unchanged)", async () => {
    const { id, version } = await sessionWithDrills(coach);
    const rows = async () =>
      (
        await db
          .select({ id: planActivities.id, p: planActivities.position })
          .from(planActivities)
          .where(eq(planActivities.planId, id))
      ).sort((a, b) => a.p - b.p);
    const before = await rows();
    good(await savePlanDocument(coach, SPORT, id, payload(version, { preset: "youth" })));
    expect(await rows()).toEqual(before);
  });
});
