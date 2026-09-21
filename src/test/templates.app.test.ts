import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { auditEvents, documentTemplates, planActivities, plans } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { db, pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import {
  presetDesign,
  resolveSessionDesign,
  type DocumentDesign,
  type PresetId,
} from "@/modules/documents";
import {
  addBreak,
  addCustomActivity,
  addDrillActivity,
  applyTemplateToPlan,
  createPlan,
  deletePlan,
  detachTemplateFromPlan,
  duplicatePlan,
  savePlanDocument,
  setPlanStatus,
} from "@/modules/plans/commands";
import { getPlan } from "@/modules/plans/queries";
import {
  addBreakSchema,
  addCustomActivitySchema,
  addDrillActivitySchema,
  applyTemplateSchema,
  planDocumentSchema,
} from "@/modules/plans/validators";
import { buildSampleDocumentInput } from "@/modules/plans/sample";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  restoreTemplate,
  setTemplateStatus,
  updateTemplate,
} from "@/modules/templates/commands";
import { getTemplate, listTemplateChoices, listTemplates } from "@/modules/templates/queries";
import { createClub } from "./drill-fixtures";
import { createTestActor } from "./factories";
import { libraryDrill, planInput, makePlan } from "./plan-fixtures";
import { makeTemplate, templateInput } from "./template-fixtures";

/**
 * Saved templates through the real commands, permissions and database: creating, editing (version vs revision),
 * duplicating, archiving, deleting, listing; and the part that matters most — applying one to a session, which must
 * change the design and NOTHING else, with the session's own changes always winning.
 */

const SPORT = "basketball";
let owner: Actor;
let admin: Actor;
let coach: Actor;
let teacher: Actor;
let assistant: Actor;
let outsider: Actor;
let library: { id: string; version: number };

const good = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r.error)}`);
  return r.data;
};
const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
const fieldsOf = (r: Result<unknown>) => (r.ok ? {} : (r.error.fields ?? {}));

const design = (preset: PresetId, patch: (d: DocumentDesign) => DocumentDesign = (d) => d) =>
  patch(presetDesign(preset));
const green = (d: DocumentDesign): DocumentDesign => ({
  ...d,
  colors: { ...d.colors, accent: "#0a7d4b" },
  page: { ...d.page, paper: "letter", orientation: "landscape" },
  mode: "compact",
  branding: { clubName: "Template FC", coachName: "Coach Tee" },
});

const tpl = (actor: Actor, over: Parameters<typeof templateInput>[0] = {}) =>
  makeTemplate(actor, over);
const row = async (actor: Actor, id: string) => {
  const [r] = await tenantTx(actor, (tx) =>
    tx.select().from(documentTemplates).where(eq(documentTemplates.id, id)),
  );
  return r;
};
const planRow = async (actor: Actor, id: string) => {
  const [r] = await tenantTx(actor, (tx) => tx.select().from(plans).where(eq(plans.id, id)));
  return r!;
};
const audited = async (action: string, entityId: string) => {
  let n = 0;
  for (const who of [owner, admin, coach, teacher])
    n += (
      await tenantTx(who, (tx) =>
        tx
          .select({ id: auditEvents.id })
          .from(auditEvents)
          .where(and(eq(auditEvents.action, action), eq(auditEvents.entityId, entityId))),
      )
    ).length;
  return n;
};
const apply = (
  actor: Actor,
  planId: string,
  version: number,
  templateId: string,
  extra: { mode?: "replace" | "keep"; confirmed?: boolean } = {},
) =>
  applyTemplateToPlan(
    actor,
    SPORT,
    planId,
    applyTemplateSchema.parse({ version, templateId, ...extra }),
  );

/** A session with real content: a drill, a break, a custom activity, a date, notes — everything a template must not touch. */
const richSession = async (a: Actor, over: Parameters<typeof planInput>[0] = {}) => {
  const { id, version: created } = await makePlan(a, {
    title: "Tuesday practice",
    players: 12,
    scheduledDate: "2030-06-11",
    startTime: "18:30",
    timezone: "Europe/London",
    details: {
      location: "Main gym",
      season: "2030",
      sessionNumber: 7,
      coachName: "Sam Rivera",
      clubName: "Riverside BC",
      coachNotes: "Watch number 9.",
    },
    ...over,
  });
  let version = created;
  version = good(
    await addDrillActivity(
      a,
      SPORT,
      id,
      addDrillActivitySchema.parse({ drillId: library.id, version, durationMin: 12 }),
    ),
  ).version;
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

/** Everything that belongs to the session and not to its design, exactly as stored. */
const sessionContent = async (a: Actor, id: string) => {
  const r = await planRow(a, id);
  const acts = await tenantTx(a, (tx) =>
    tx.select().from(planActivities).where(eq(planActivities.planId, id)),
  );
  return {
    title: r.title,
    scheduledDate: r.scheduledDate,
    startTime: r.startTime,
    timezone: r.timezone,
    details: r.details,
    players: r.players,
    targetMinutes: r.targetMinutes,
    status: r.status,
    visibility: r.visibility,
    activities: acts
      .map((x) => ({ ...x, createdAt: undefined, updatedAt: undefined }))
      .sort((p, q) => p.position - q.position),
    reflection: (r.documentSettings as { reflection?: unknown }).reflection ?? null,
  };
};

beforeAll(async () => {
  library = await libraryDrill();
  const founder = await createTestActor("Template Founder");
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

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------------------------------
describe("creating a template", () => {
  it("saves the preset and only the difference from it, with details, category and visibility", async () => {
    const { id, version } = await tpl(coach, {
      name: "  Game day sheet ",
      description: "For home games",
      category: "game_day",
      visibility: "organization",
      preset: "modern",
      design: design("modern", green),
    });
    expect(version).toBe(1);
    const r = (await row(coach, id))!;
    expect(r).toMatchObject({
      name: "Game day sheet",
      description: "For home games",
      category: "game_day",
      visibility: "organization",
      status: "active",
      revision: 1,
      version: 1,
      createdBy: coach.userId,
      forkedFromId: null,
    });
    expect(r.config).toEqual({
      schemaVersion: 1,
      preset: "modern",
      design: {
        colors: { accent: "#0a7d4b" },
        page: { paper: "letter", orientation: "landscape" },
        mode: "compact",
        branding: { clubName: "Template FC", coachName: "Coach Tee" },
      },
    });
    expect(await audited("template.created", id)).toBe(1);
  });

  it("comes back as the complete design that was saved, with the viewer's permissions", async () => {
    const saved = design("school", green);
    const { id } = await tpl(coach, {
      preset: "school",
      design: saved,
      visibility: "organization",
    });
    const dto = (await getTemplate(coach, id, { sportKey: SPORT }))!;
    expect(dto.design).toEqual(saved);
    expect(dto).toMatchObject({
      preset: "school",
      isMine: true,
      authorName: "Bob Coach",
      revision: 1,
    });
    expect(dto.permissions).toEqual({ canEdit: true, canDelete: true, canDuplicate: true });
    const seenByTeacher = (await getTemplate(teacher, id))!;
    expect(seenByTeacher.isMine).toBe(false);
    expect(seenByTeacher.permissions).toEqual({
      canEdit: false,
      canDelete: false,
      canDuplicate: true,
    });
    const seenByAdmin = (await getTemplate(admin, id))!;
    expect(seenByAdmin.permissions).toEqual({ canEdit: true, canDelete: true, canDuplicate: true });
    const seenByAssistant = (await getTemplate(assistant, id))!;
    expect(seenByAssistant.permissions).toEqual({
      canEdit: false,
      canDelete: false,
      canDuplicate: false,
    });
  });

  it("belongs only to what a session is not: nothing in the stored config comes from a session", async () => {
    const { id } = await tpl(coach, { preset: "classic", design: presetDesign("classic") });
    const stored = JSON.stringify((await row(coach, id))!.config);
    for (const word of [
      "scheduledDate",
      "startTime",
      "sessionNumber",
      "activities",
      "attendance",
      "coachNotes",
      'wentWell":"',
      "timeline",
    ])
      expect(stored).not.toContain(word);
  });

  it("an assistant cannot create one; the failure is a permission one", async () => {
    expect(codeOf(await createTemplate(assistant, SPORT, templateInput()))).toBe("FORBIDDEN");
  });

  it("a personal workspace has nobody to share with: whatever was asked, it is personal", async () => {
    const { id } = await tpl(outsider, { visibility: "organization" });
    expect((await row(outsider, id))!.visibility).toBe("private");
  });

  it("refuses text that cannot be read on its background, and an unknown sport", async () => {
    const d = design("classic");
    const unreadable = { ...d, colors: { ...d.colors, text: d.colors.background } };
    const r = await createTemplate(coach, SPORT, templateInput({ design: unreadable }));
    expect(codeOf(r)).toBe("VALIDATION");
    expect(fieldsOf(r)).toHaveProperty(["design.colors.text"]);
    expect(codeOf(await createTemplate(coach, "curling", templateInput()))).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------------------------------
describe("editing a template: version vs revision", () => {
  it("changing the design bumps the revision; changing only the details does not", async () => {
    const { id, version } = await tpl(coach, { name: "Original" });
    const renamed = good(
      await updateTemplate(
        coach,
        SPORT,
        id,
        templateInput({ name: "Renamed", description: "Now with words", version }),
      ),
    );
    expect(renamed.version).toBe(2);
    expect(await row(coach, id)).toMatchObject({ name: "Renamed", revision: 1, version: 2 });

    const restyled = good(
      await updateTemplate(
        coach,
        SPORT,
        id,
        templateInput({
          name: "Renamed",
          design: design("classic", green),
          version: renamed.version,
        }),
      ),
    );
    expect(restyled.version).toBe(3);
    expect(await row(coach, id)).toMatchObject({ revision: 2, version: 3 });
    expect(await audited("template.updated", id)).toBe(2);
  });

  it("archiving, restoring and deleting never bump the revision (sessions are not told an update exists)", async () => {
    const { id, version } = await tpl(coach);
    const a = good(await setTemplateStatus(coach, SPORT, id, "archived", version));
    const b = good(await setTemplateStatus(coach, SPORT, id, "active", a.version));
    good(await deleteTemplate(coach, SPORT, id));
    good(await restoreTemplate(coach, SPORT, id));
    expect(b.version).toBe(3);
    expect((await row(coach, id))!.revision).toBe(1);
  });

  it("refuses a stale editor (CONFLICT) and a missing version", async () => {
    const { id, version } = await tpl(coach);
    good(await updateTemplate(coach, SPORT, id, templateInput({ name: "First", version })));
    expect(
      codeOf(await updateTemplate(coach, SPORT, id, templateInput({ name: "Second", version }))),
    ).toBe("CONFLICT");
    const noVersion = await updateTemplate(coach, SPORT, id, templateInput({ name: "Third" }));
    expect(codeOf(noVersion)).toBe("VALIDATION");
    expect(fieldsOf(noVersion)).toHaveProperty("version");
    expect((await row(coach, id))!.name).toBe("First");
  });

  it("only the creator or an owner/admin may edit a shared template; nobody else, and never an assistant", async () => {
    const { id, version } = await tpl(coach, { visibility: "organization" });
    const edit = (a: Actor, v: number) =>
      updateTemplate(
        a,
        SPORT,
        id,
        templateInput({ name: `by ${a.role}`, visibility: "organization", version: v }),
      );
    expect(codeOf(await edit(teacher, version))).toBe("FORBIDDEN");
    expect(codeOf(await edit(assistant, version))).toBe("FORBIDDEN");
    expect(codeOf(await edit(outsider, version))).toBe("NOT_FOUND");
    const byAdmin = good(await edit(admin, version));
    good(await edit(owner, byAdmin.version));
    expect((await row(coach, id))!.createdBy).toBe(coach.userId); // editing never changes whose it is
  });

  it("an archived template cannot be edited until it is restored", async () => {
    const { id, version } = await tpl(coach);
    const archived = good(await setTemplateStatus(coach, SPORT, id, "archived", version));
    expect(
      codeOf(
        await updateTemplate(
          coach,
          SPORT,
          id,
          templateInput({ name: "Nope", version: archived.version }),
        ),
      ),
    ).toBe("FORBIDDEN");
  });

  it("can move between personal and shared", async () => {
    const { id, version } = await tpl(coach, { visibility: "private" });
    expect(await getTemplate(teacher, id)).toBeNull();
    const shared = good(
      await updateTemplate(
        coach,
        SPORT,
        id,
        templateInput({ visibility: "organization", version }),
      ),
    );
    expect(await getTemplate(teacher, id)).not.toBeNull();
    good(
      await updateTemplate(
        coach,
        SPORT,
        id,
        templateInput({ visibility: "private", version: shared.version }),
      ),
    );
    expect(await getTemplate(teacher, id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
describe("duplicating, archiving, deleting and restoring", () => {
  it("a copy is the reader's own, personal, and records where it came from", async () => {
    const { id } = await tpl(coach, {
      name: "Shared original",
      category: "school",
      visibility: "organization",
      design: design("classic", green),
    });
    const copy = good(await duplicateTemplate(teacher, SPORT, id));
    const r = (await row(teacher, copy.id))!;
    expect(r).toMatchObject({
      name: "Copy of Shared original",
      category: "school",
      visibility: "private",
      createdBy: teacher.userId,
      forkedFromId: id,
      revision: 1,
      status: "active",
    });
    expect(r.config).toEqual((await row(coach, id))!.config);
    expect(await audited("template.duplicated", copy.id)).toBe(1);
    // changing the copy does not touch the original
    good(
      await updateTemplate(
        teacher,
        SPORT,
        copy.id,
        templateInput({ name: "Mine now", version: 1, design: design("modern") }),
      ),
    );
    expect((await row(coach, id))!.name).toBe("Shared original");
  });

  it("a personal template of someone else cannot be duplicated (it is not there); an assistant cannot duplicate", async () => {
    const personal = await tpl(coach, { visibility: "private" });
    const shared = await tpl(coach, { visibility: "organization" });
    expect(codeOf(await duplicateTemplate(teacher, SPORT, personal.id))).toBe("NOT_FOUND");
    expect(codeOf(await duplicateTemplate(assistant, SPORT, shared.id))).toBe("FORBIDDEN");
    expect(codeOf(await duplicateTemplate(outsider, SPORT, shared.id))).toBe("NOT_FOUND");
  });

  it("archive and restore: creator and managers only, with a concurrency check", async () => {
    const { id, version } = await tpl(coach, { visibility: "organization" });
    expect(codeOf(await setTemplateStatus(teacher, SPORT, id, "archived", version))).toBe(
      "FORBIDDEN",
    );
    expect(codeOf(await setTemplateStatus(coach, SPORT, id, "archived", version + 5))).toBe(
      "CONFLICT",
    );
    const archived = good(await setTemplateStatus(admin, SPORT, id, "archived", version));
    expect((await row(coach, id))!.status).toBe("archived");
    expect(await audited("template.status_changed", id)).toBe(1);
    const again = good(await setTemplateStatus(admin, SPORT, id, "archived", archived.version));
    expect(again.version).toBe(archived.version); // already archived: nothing to do
    good(await setTemplateStatus(coach, SPORT, id, "active", archived.version));
    expect((await row(coach, id))!.status).toBe("active");
  });

  it("delete is soft, hides the template from lists, and can be undone; only the creator or a manager", async () => {
    const { id } = await tpl(coach, { name: "Short-lived", visibility: "organization" });
    expect(codeOf(await deleteTemplate(teacher, SPORT, id))).toBe("FORBIDDEN");
    expect(codeOf(await deleteTemplate(outsider, SPORT, id))).toBe("NOT_FOUND");
    good(await deleteTemplate(admin, SPORT, id));
    expect(await getTemplate(coach, id)).toBeNull();
    expect((await getTemplate(coach, id, { includeDeleted: true }))!.deletedAt).not.toBeNull();
    expect((await listTemplates(coach, { sportKey: SPORT, q: "Short-lived" })).total).toBe(0);
    expect(
      (await listTemplates(coach, { sportKey: SPORT, q: "Short-lived", status: "deleted" })).total,
    ).toBe(1);
    expect(codeOf(await deleteTemplate(coach, SPORT, id))).toBe("NOT_FOUND"); // already gone
    good(await restoreTemplate(admin, SPORT, id));
    expect((await listTemplates(coach, { sportKey: SPORT, q: "Short-lived" })).total).toBe(1);
    expect(await audited("template.deleted", id)).toBe(1);
    expect(await audited("template.restored", id)).toBe(1);
  });

  it("restoring something that was never deleted is not found", async () => {
    const { id } = await tpl(coach);
    expect(codeOf(await restoreTemplate(coach, SPORT, id))).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------------------------------
describe("finding templates", () => {
  let club: Actor;
  beforeAll(async () => {
    const founder = await createTestActor("Finder Founder");
    const c = await createClub(founder, [
      { role: "coach", name: "Fay Finder" },
      { role: "teacher", name: "Gus Guide" },
    ]);
    club = c.members[0]!;
    const other = c.members[1]!;
    await makeTemplate(club, {
      name: "Alpha practice",
      category: "practice",
      visibility: "organization",
    });
    await makeTemplate(club, {
      name: "Beta school",
      category: "school",
      description: "For the PE lessons",
    });
    await makeTemplate(other, {
      name: "Gamma youth",
      category: "youth",
      visibility: "organization",
    });
    await makeTemplate(other, { name: "Delta private of Gus", category: "youth" });
    const arch = await makeTemplate(club, { name: "Epsilon archived" });
    good(await setTemplateStatus(club, SPORT, arch.id, "archived", arch.version));
  });

  const names = async (actor: Actor, opts: Parameters<typeof listTemplates>[1] = {}) =>
    (await listTemplates(actor, { sportKey: SPORT, ...opts })).items.map((i) => i.name).sort();

  it("lists what the viewer may see: their own and the workspace's, never someone else's personal ones", async () => {
    expect(await names(club)).toEqual(["Alpha practice", "Beta school", "Gamma youth"]);
  });

  it("searches name and description, filters by category and by whose, and treats % and _ as text", async () => {
    expect(await names(club, { q: "school" })).toEqual(["Beta school"]);
    expect(await names(club, { q: "pe lessons" })).toEqual(["Beta school"]);
    expect(await names(club, { category: "youth" })).toEqual(["Gamma youth"]);
    expect(await names(club, { scope: "mine" })).toEqual(["Alpha practice", "Beta school"]);
    expect(await names(club, { scope: "organization" })).toEqual(["Alpha practice", "Gamma youth"]);
    expect(await names(club, { q: "%" })).toEqual([]);
    expect(await names(club, { q: "_" })).toEqual([]);
  });

  it("shows archived ones only when asked, and pages with an honest total", async () => {
    expect(await names(club, { status: "archived" })).toEqual(["Epsilon archived"]);
    const page = await listTemplates(club, { sportKey: SPORT, limit: 2, offset: 0 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    const last = await listTemplates(club, { sportKey: SPORT, limit: 2, offset: 2 });
    expect(last.items).toHaveLength(1);
  });

  it("another workspace sees none of it", async () => {
    expect((await listTemplates(outsider, { sportKey: SPORT, q: "Alpha" })).total).toBe(0);
    expect((await listTemplates(outsider, { sportKey: "football" })).total).toBe(0);
  });

  it("a picker offers only the active ones", async () => {
    const choices = await listTemplateChoices(club, SPORT);
    expect(choices.map((c) => c.name)).toEqual(["Alpha practice", "Beta school", "Gamma youth"]);
    expect(choices[0]).toHaveProperty("design");
  });

  it("looks a template up only in its own sport, and never by a bad id", async () => {
    const { id } = await tpl(coach);
    expect(await getTemplate(coach, id, { sportKey: "football" })).toBeNull();
    expect(await getTemplate(coach, "not-a-uuid")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
describe("starting a new session from a template", () => {
  it("the session gets the template's design and its link; and the template's design only", async () => {
    const t = await tpl(coach, {
      visibility: "organization",
      preset: "modern",
      design: design("modern", green),
    });
    const created = good(
      await createPlan(teacher, SPORT, planInput({ title: "From template", templateId: t.id })),
    );
    const p = (await getPlan(teacher, SPORT, created.id))!;
    expect(p.template).toMatchObject({
      id: t.id,
      revision: 1,
      status: "current",
      name: "Friday sheet",
    });
    expect(resolveSessionDesign(p.documentSettings)).toEqual(design("modern", green));
    expect(p.documentSettings.overrides).toEqual({});
    const stored = await planRow(teacher, created.id);
    expect(stored).toMatchObject({ templateId: t.id, templateRevision: 1 });
    expect(await audited("plan.created", created.id)).toBe(1);
  });

  it("brings nothing else along: the session is exactly what the coach typed", async () => {
    const t = await tpl(coach, { visibility: "organization", design: design("classic", green) });
    const created = good(
      await createPlan(
        teacher,
        SPORT,
        planInput({
          title: "Plain",
          templateId: t.id,
          players: 9,
          scheduledDate: "2031-01-02",
          startTime: "17:00",
          timezone: "Europe/London",
        }),
      ),
    );
    const c = await sessionContent(teacher, created.id);
    expect(c).toMatchObject({ title: "Plain", players: 9, activities: [] });
    expect(c.reflection).toEqual({ wentWell: "", needsImprovement: "", nextFocus: "", notes: "" });
  });

  it("refuses a template that is archived, someone else's personal one, another workspace's, or unknown", async () => {
    const archived = await tpl(coach, { visibility: "organization" });
    good(await setTemplateStatus(coach, SPORT, archived.id, "archived", archived.version));
    const personal = await tpl(coach, { visibility: "private" });
    const foreign = await tpl(outsider);
    const start = (templateId: string) => createPlan(teacher, SPORT, planInput({ templateId }));
    const a = await start(archived.id);
    expect(codeOf(a)).toBe("VALIDATION");
    expect(fieldsOf(a)).toHaveProperty("templateId");
    expect(codeOf(await start(personal.id))).toBe("NOT_FOUND");
    expect(codeOf(await start(foreign.id))).toBe("NOT_FOUND");
    expect(codeOf(await start("0b6f6f4e-6c0f-4b39-8f6e-0d5d7b1c2a10"))).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------------------------------
describe("applying a template to an existing session", () => {
  it("changes the design and NOTHING else: activities, date, times, notes and reflection are untouched", async () => {
    const t = await tpl(coach, {
      visibility: "organization",
      preset: "modern",
      design: design("modern", green),
    });
    const s = await richSession(teacher);
    // the coach has typed reflection text: it is session content
    let version = good(
      await savePlanDocument(
        teacher,
        SPORT,
        s.id,
        planDocumentSchema.parse({
          version: s.version,
          preset: "classic",
          design: presetDesign("classic"),
          reflection: {
            wentWell: "Great press",
            needsImprovement: "",
            nextFocus: "Finishing",
            notes: "",
          },
        }),
      ),
    ).version;
    const before = await sessionContent(teacher, s.id);

    // this session has no design of its own beyond the default look, so no confirmation is needed
    const applied = good(await apply(teacher, s.id, version, t.id));
    version = applied.version;

    expect(await sessionContent(teacher, s.id)).toEqual(before);
    const p = (await getPlan(teacher, SPORT, s.id))!;
    expect(resolveSessionDesign(p.documentSettings)).toEqual(design("modern", green));
    expect(p.documentSettings.reflection.wentWell).toBe("Great press");
    expect(await planRow(teacher, s.id)).toMatchObject({ templateId: t.id, templateRevision: 1 });
    expect(p.template).toMatchObject({ id: t.id, status: "current", revision: 1 });
    expect(await audited("plan.template_applied", s.id)).toBe(1);
  });

  it("a session with a design of its own needs a yes first; the server insists, whatever the browser did", async () => {
    const t = await tpl(coach, { visibility: "organization", design: design("classic", green) });
    const s = await richSession(teacher);
    const styled = good(
      await savePlanDocument(
        teacher,
        SPORT,
        s.id,
        planDocumentSchema.parse({
          version: s.version,
          preset: "minimal",
          design: presetDesign("minimal"),
          reflection: { wentWell: "", needsImprovement: "", nextFocus: "", notes: "" },
        }),
      ),
    );
    const refused = await apply(teacher, s.id, styled.version, t.id);
    expect(codeOf(refused)).toBe("VALIDATION");
    expect(fieldsOf(refused)).toEqual({ confirmed: ["confirmation_required"] });
    expect((await planRow(teacher, s.id)).templateId).toBeNull(); // nothing happened
    expect((await planRow(teacher, s.id)).version).toBe(styled.version);
    good(await apply(teacher, s.id, styled.version, t.id, { confirmed: true }));
    expect((await planRow(teacher, s.id)).templateId).toBe(t.id);
  });

  it("'replace' makes the session look exactly like the template; 'keep' keeps the coach's own changes on top", async () => {
    const t = await tpl(coach, { visibility: "organization", design: design("classic", green) });
    const mine = design("classic", (d) => ({
      ...d,
      colors: { ...d.colors, accent: "#a11a1a" }, // conflicts with the template's accent
      sections: { ...d.sections, safety: false }, // and something the template does not mention
    }));
    const start = async () => {
      const s = await richSession(teacher);
      const saved = good(
        await savePlanDocument(
          teacher,
          SPORT,
          s.id,
          planDocumentSchema.parse({
            version: s.version,
            preset: "classic",
            design: mine,
            reflection: { wentWell: "", needsImprovement: "", nextFocus: "", notes: "" },
          }),
        ),
      );
      return { id: s.id, version: saved.version };
    };

    const a = await start();
    good(await apply(teacher, a.id, a.version, t.id, { mode: "replace", confirmed: true }));
    const replaced = resolveSessionDesign((await getPlan(teacher, SPORT, a.id))!.documentSettings);
    expect(replaced).toEqual(design("classic", green));
    expect(replaced.sections.safety).toBe(true);

    const b = await start();
    good(await apply(teacher, b.id, b.version, t.id, { mode: "keep", confirmed: true }));
    const kept = resolveSessionDesign((await getPlan(teacher, SPORT, b.id))!.documentSettings);
    expect(kept.colors.accent).toBe("#a11a1a"); // the session's override wins over the template
    expect(kept.sections.safety).toBe(false); // …and its own choices stay
    expect(kept.page.paper).toBe("letter"); // while the template fills in the rest
    expect(kept.branding.clubName).toBe("Template FC");
  });

  it("a change the coach makes AFTER applying is a session override and always wins", async () => {
    const t = await tpl(coach, { visibility: "organization", design: design("classic", green) });
    const s = await richSession(teacher);
    const applied = good(await apply(teacher, s.id, s.version, t.id));
    const edited = {
      ...design("classic", green),
      colors: { ...design("classic", green).colors, accent: "#a11a1a" },
    };
    good(
      await savePlanDocument(
        teacher,
        SPORT,
        s.id,
        planDocumentSchema.parse({
          version: applied.version,
          preset: "classic",
          design: edited,
          reflection: { wentWell: "", needsImprovement: "", nextFocus: "", notes: "" },
        }),
      ),
    );
    const p = (await getPlan(teacher, SPORT, s.id))!;
    expect(p.documentSettings.overrides).toEqual({ colors: { accent: "#a11a1a" } }); // only the difference from the template
    expect(p.documentSettings.template).toMatchObject({ id: t.id, revision: 1 }); // the link survives an edit
    expect(resolveSessionDesign(p.documentSettings)).toEqual(edited);
    expect((await planRow(teacher, s.id)).templateId).toBe(t.id);
  });

  it("editing the template afterwards does not change the session: it holds its own frozen copy", async () => {
    const t = await tpl(coach, { visibility: "organization", design: design("classic", green) });
    const s = await richSession(teacher);
    const applied = good(await apply(teacher, s.id, s.version, t.id));
    const before = resolveSessionDesign((await getPlan(teacher, SPORT, s.id))!.documentSettings);

    good(
      await updateTemplate(
        coach,
        SPORT,
        t.id,
        templateInput({
          visibility: "organization",
          preset: "professional",
          design: design("professional"),
          version: t.version,
        }),
      ),
    );

    const p = (await getPlan(teacher, SPORT, s.id))!;
    expect(resolveSessionDesign(p.documentSettings)).toEqual(before); // unchanged
    expect(p.template).toMatchObject({
      status: "update_available",
      revision: 1,
      latestRevision: 2,
    });
    expect((await planRow(teacher, s.id)).version).toBe(applied.version); // the session was not even written to

    // the coach chooses to update: now it follows revision 2
    good(await apply(teacher, s.id, applied.version, t.id, { mode: "keep", confirmed: true }));
    const after = (await getPlan(teacher, SPORT, s.id))!;
    expect(after.template).toMatchObject({ status: "current", revision: 2 });
    expect(resolveSessionDesign(after.documentSettings)).toEqual(design("professional"));
  });

  it("renaming or archiving a template is not a design change: no 'update available'", async () => {
    const t = await tpl(coach, { visibility: "organization" });
    const s = await richSession(teacher);
    good(await apply(teacher, s.id, s.version, t.id));
    const renamed = good(
      await updateTemplate(
        coach,
        SPORT,
        t.id,
        templateInput({ name: "Better name", visibility: "organization", version: t.version }),
      ),
    );
    expect((await getPlan(teacher, SPORT, s.id))!.template).toMatchObject({
      status: "current",
      name: "Friday sheet",
    });
    good(await setTemplateStatus(coach, SPORT, t.id, "archived", renamed.version));
    expect((await getPlan(teacher, SPORT, s.id))!.template!.status).toBe("unavailable");
  });

  it("a deleted template leaves the session's design exactly as it was", async () => {
    const t = await tpl(coach, { visibility: "organization", design: design("classic", green) });
    const s = await richSession(teacher);
    good(await apply(teacher, s.id, s.version, t.id));
    const before = resolveSessionDesign((await getPlan(teacher, SPORT, s.id))!.documentSettings);
    good(await deleteTemplate(coach, SPORT, t.id));
    const p = (await getPlan(teacher, SPORT, s.id))!;
    expect(p.template).toMatchObject({ status: "unavailable", name: "Friday sheet" });
    expect(resolveSessionDesign(p.documentSettings)).toEqual(before);
  });

  it("a member who can no longer read the template still sees the session's own copy", async () => {
    const t = await tpl(coach, { visibility: "organization", design: design("classic", green) });
    const s = await richSession(teacher);
    good(await apply(teacher, s.id, s.version, t.id));
    const { version } = (await getTemplate(coach, t.id))!;
    good(
      await updateTemplate(
        coach,
        SPORT,
        t.id,
        templateInput({ visibility: "private", design: design("classic", green), version }),
      ),
    );
    const p = (await getPlan(teacher, SPORT, s.id))!; // teacher can no longer see the template
    expect(p.template!.status).toBe("unavailable");
    expect(resolveSessionDesign(p.documentSettings)).toEqual(design("classic", green));
  });

  it("refuses what it must: archived template, someone's personal one, another workspace, a stale session, an archived session, an assistant", async () => {
    const shared = await tpl(coach, { visibility: "organization" });
    const archived = await tpl(coach, { visibility: "organization" });
    good(await setTemplateStatus(coach, SPORT, archived.id, "archived", archived.version));
    const personal = await tpl(coach, { visibility: "private" });
    const foreign = await tpl(outsider);
    const s = await richSession(teacher);

    const a = await apply(teacher, s.id, s.version, archived.id);
    expect(codeOf(a)).toBe("VALIDATION");
    expect(fieldsOf(a)).toHaveProperty("templateId");
    expect(codeOf(await apply(teacher, s.id, s.version, personal.id))).toBe("NOT_FOUND");
    expect(codeOf(await apply(teacher, s.id, s.version, foreign.id))).toBe("NOT_FOUND");
    expect(codeOf(await apply(teacher, s.id, s.version + 4, shared.id))).toBe("CONFLICT");
    expect(codeOf(await apply(coach, s.id, s.version, shared.id))).toBe("NOT_FOUND"); // not coach's session (private)
    expect(codeOf(await apply(assistant, s.id, s.version, shared.id))).toBe("NOT_FOUND");
    expect(codeOf(await apply(outsider, s.id, s.version, shared.id))).toBe("NOT_FOUND");

    good(await setPlanStatus(teacher, SPORT, s.id, "archived", s.version));
    const v = (await planRow(teacher, s.id)).version;
    expect(codeOf(await apply(teacher, s.id, v, shared.id))).toBe("FORBIDDEN");
    expect((await planRow(teacher, s.id)).templateId).toBeNull();
  });

  it("an assistant, who may read a shared template, still cannot apply it to a session they cannot edit", async () => {
    const shared = await tpl(coach, { visibility: "organization" });
    const { id, version } = await makePlan(coach, {
      title: "Coach's shared",
      visibility: "organization",
    });
    expect(codeOf(await apply(assistant, id, version, shared.id))).toBe("FORBIDDEN");
  });

  it("a deleted session cannot be given a template", async () => {
    const shared = await tpl(coach, { visibility: "organization" });
    const s = await richSession(teacher);
    good(await deletePlan(teacher, SPORT, s.id));
    expect(codeOf(await apply(teacher, s.id, s.version, shared.id))).toBe("NOT_FOUND");
  });

  it("refuses a body that is not what the schema says (unknown fields, bad ids, bad mode)", () => {
    const ok = { version: 1, templateId: "0b6f6f4e-6c0f-4b39-8f6e-0d5d7b1c2a10" };
    expect(applyTemplateSchema.safeParse(ok).success).toBe(true);
    expect(applyTemplateSchema.parse(ok)).toMatchObject({ mode: "replace", confirmed: false });
    expect(applyTemplateSchema.safeParse({ ...ok, templateId: "x" }).success).toBe(false);
    expect(applyTemplateSchema.safeParse({ ...ok, mode: "merge" }).success).toBe(false);
    expect(applyTemplateSchema.safeParse({ ...ok, activities: [] }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("letting go of a template", () => {
  it("keeps the session looking exactly the same and removes only the link", async () => {
    const t = await tpl(coach, { visibility: "organization", design: design("classic", green) });
    const s = await richSession(teacher);
    const applied = good(await apply(teacher, s.id, s.version, t.id));
    const before = (await getPlan(teacher, SPORT, s.id))!;
    const content = await sessionContent(teacher, s.id);

    const detached = good(await detachTemplateFromPlan(teacher, SPORT, s.id, applied.version));
    const after = (await getPlan(teacher, SPORT, s.id))!;
    expect(after.template).toBeNull();
    expect(after.documentSettings.template).toBeNull();
    expect(resolveSessionDesign(after.documentSettings)).toEqual(
      resolveSessionDesign(before.documentSettings),
    );
    expect(await sessionContent(teacher, s.id)).toEqual(content);
    expect(await planRow(teacher, s.id)).toMatchObject({
      templateId: null,
      templateRevision: null,
    });
    expect(await audited("plan.template_detached", s.id)).toBe(1);

    // nothing to detach any more: not an error, nothing written
    expect(good(await detachTemplateFromPlan(teacher, SPORT, s.id, detached.version)).version).toBe(
      detached.version,
    );
  });

  it("is refused for a stale session, an archived one, and anyone who cannot edit it", async () => {
    const t = await tpl(coach, { visibility: "organization" });
    const s = await richSession(teacher);
    const applied = good(await apply(teacher, s.id, s.version, t.id));
    expect(codeOf(await detachTemplateFromPlan(teacher, SPORT, s.id, applied.version + 3))).toBe(
      "CONFLICT",
    );
    expect(codeOf(await detachTemplateFromPlan(outsider, SPORT, s.id, applied.version))).toBe(
      "NOT_FOUND",
    );
    good(await setPlanStatus(teacher, SPORT, s.id, "archived", applied.version));
    const v = (await planRow(teacher, s.id)).version;
    expect(codeOf(await detachTemplateFromPlan(teacher, SPORT, s.id, v))).toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------------------------------
describe("copies and templates", () => {
  it("a duplicated session keeps its template link and prints the same, with an empty reflection", async () => {
    const t = await tpl(coach, { visibility: "organization", design: design("classic", green) });
    const s = await richSession(teacher);
    const applied = good(await apply(teacher, s.id, s.version, t.id));
    good(
      await savePlanDocument(
        teacher,
        SPORT,
        s.id,
        planDocumentSchema.parse({
          version: applied.version,
          preset: "classic",
          design: design("classic", green),
          reflection: {
            wentWell: "Old answer",
            needsImprovement: "",
            nextFocus: "",
            notes: "Old note",
          },
        }),
      ),
    );
    const copy = good(await duplicatePlan(teacher, SPORT, s.id));
    const c = (await getPlan(teacher, SPORT, copy.id))!;
    expect(c.template).toMatchObject({ id: t.id, status: "current" });
    expect(resolveSessionDesign(c.documentSettings)).toEqual(design("classic", green));
    expect(c.documentSettings.reflection).toEqual({
      wentWell: "",
      needsImprovement: "",
      nextFocus: "",
      notes: "",
    });
    expect(await planRow(teacher, copy.id)).toMatchObject({
      templateId: t.id,
      templateRevision: 1,
    });
  });

  it("a copy made by someone who cannot read the template keeps the design but not the link", async () => {
    const t = await tpl(coach, { visibility: "organization", design: design("classic", green) });
    const { id, version } = await makePlan(coach, {
      title: "Shared session",
      visibility: "organization",
    });
    good(await apply(coach, id, version, t.id));
    const { version: tv } = (await getTemplate(coach, t.id))!;
    good(
      await updateTemplate(
        coach,
        SPORT,
        t.id,
        templateInput({ visibility: "private", design: design("classic", green), version: tv }),
      ),
    );
    const copy = good(await duplicatePlan(teacher, SPORT, id));
    const c = (await getPlan(teacher, SPORT, copy.id))!;
    expect(resolveSessionDesign(c.documentSettings)).toEqual(design("classic", green));
    expect(await planRow(teacher, copy.id)).toMatchObject({
      templateId: null,
      templateRevision: null,
    });
    expect(c.template === null || c.template.status === "unavailable").toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("the sample session a template is previewed on", () => {
  const labels = {
    title: "Example session",
    teamName: "Example team",
    goal: "A sample",
    location: "Main gym",
    season: "Season",
    coachName: "Bob Coach",
    clubName: "Example club",
    objective: { primary: "Ball handling", secondary: ["Passing"] },
    breakTitle: "Water break",
    customTitle: "Team talk",
    customDescription: "Sample text.",
  };

  it("is built from real library drills and the labels given, with a break and a custom block", async () => {
    const sample = await buildSampleDocumentInput(coach, SPORT, labels);
    expect(sample.title).toBe("Example session");
    const kinds = sample.activities.map((a) => a.kind);
    expect(kinds.filter((k) => k === "drill").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("break");
    expect(kinds).toContain("custom");
    // timed like a real session: back to back from minute zero
    let at = 0;
    for (const a of sample.activities) {
      expect(a.startMin).toBe(at);
      at = a.endMin;
    }
    expect(sample.totalMinutes).toBe(at);
  });

  it("is not one of the viewer's sessions: it is the same for everyone and stored nowhere", async () => {
    const mine = await richSession(coach, { title: "My private session about nothing else" });
    const a = await buildSampleDocumentInput(coach, SPORT, labels);
    const b = await buildSampleDocumentInput(outsider, SPORT, labels);
    expect(JSON.stringify(a)).not.toContain("My private session");
    expect(a.activities.map((x) => x.title)).toEqual(b.activities.map((x) => x.title));
    expect(a.scheduledDate).toBe(b.scheduledDate); // an invented, fixed date: never one of the viewer's
    expect(a.sessionNumber).toBe(b.sessionNumber);
    expect((await planRow(coach, mine.id)).title).toBe("My private session about nothing else");
  });
});

// ---------------------------------------------------------------------------------------------------
describe("when the author's account is erased", () => {
  it("a shared template stays for the workspace with no author's name, and a manager can still look after it", async () => {
    const founder = await createTestActor("Erasure Founder");
    const club = await createClub(founder, [
      { role: "admin", name: "Keeper Admin" },
      { role: "coach", name: "Departing Coach" },
      { role: "teacher", name: "Staying Teacher" },
    ]);
    const [keeper, leaver, stayer] = club.members as [Actor, Actor, Actor];
    const shared = await makeTemplate(leaver, { name: "Left behind", visibility: "organization" });
    const personal = await makeTemplate(leaver, { name: "Left personal", visibility: "private" });
    const s = await richSession(stayer);
    good(await apply(stayer, s.id, s.version, shared.id));

    await db.execute(sql`delete from "user" where id = ${leaver.userId}`);

    const dto = (await getTemplate(stayer, shared.id))!;
    expect(dto).toMatchObject({ name: "Left behind", authorName: null, isMine: false });
    expect(dto.permissions).toEqual({ canEdit: false, canDelete: false, canDuplicate: true });
    expect(await getTemplate(keeper, shared.id)).toMatchObject({
      permissions: { canEdit: true, canDelete: true, canDuplicate: true },
    });
    expect(await getTemplate(keeper, personal.id)).toBeNull(); // unreachable (as sessions and drills are)
    // the session that used it is unaffected, and a manager can archive the orphan
    expect((await getPlan(stayer, SPORT, s.id))!.template).toMatchObject({ status: "current" });
    good(await setTemplateStatus(keeper, SPORT, shared.id, "archived", dto.version));
    expect((await getPlan(stayer, SPORT, s.id))!.template!.status).toBe("unavailable");
  });
});
