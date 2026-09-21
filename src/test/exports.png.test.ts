import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { and, eq } from "drizzle-orm";
import { auditEvents } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import { exportPlanPng, type ExportDeps, type PngOptions } from "@/modules/exports/commands";
import { Gate, RateWindow } from "@/modules/exports/limits";
import { pngSize, RenderError, type PdfRenderer, type PngJob } from "@/modules/exports/renderer";
import { readZip } from "@/modules/exports/zip";
import { makePng } from "@/modules/media/test-support";
import { addDrillActivity } from "@/modules/plans/commands";
import { addDrillActivitySchema } from "@/modules/plans/validators";
import { createClub } from "./drill-fixtures";
import { createTestActor } from "./factories";
import { libraryDrill, makePlan } from "./plan-fixtures";

/**
 * Exporting a session as PNG images through the real command, permissions and database, with the browser replaced by a
 * renderer that answers with images of exactly the size the real one would produce. What matters here: the pages and
 * their sizes come from the DocumentModel, every image is checked against them, and the permissions are the PDF's.
 */

const SPORT = "basketball";
const ORIGIN = "http://app.test";
const COOKIE = "coachos.session_token=abc.def";
const PX_PER_MM = 96 / 25.4;
const A4 = { w: 210 * PX_PER_MM, h: 297 * PX_PER_MM };
const GAP = 24;

let owner: Actor;
let coach: Actor;
let outsider: Actor;
let pdf: Buffer;

const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);

/** A renderer that answers with header-only PNGs of the size the real renderer would produce. */
function pngRenderer(over: { wrong?: boolean; fail?: Error } = {}) {
  const jobs: PngJob[] = [];
  const renderer: PdfRenderer = {
    async render() {
      return pdf;
    },
    async renderPng(job) {
      jobs.push(job);
      if (over.fail) throw over.fail;
      const bump = over.wrong ? 30 : 0;
      if (job.layout === "stack") {
        const w = Math.round((A4.w + 2 * GAP) * job.scale) + bump;
        const h = Math.round((job.pages.length * A4.h + (job.pages.length + 1) * GAP) * job.scale);
        return [
          {
            page: 0,
            bytes: makePng({ width: w, height: h, headerOnly: true }),
            width: w,
            height: h,
          },
        ];
      }
      const w = Math.round(A4.w * job.scale) + bump;
      const h = Math.round(A4.h * job.scale);
      return job.pages.map((page) => ({
        page,
        bytes: makePng({ width: w, height: h, headerOnly: true }),
        width: w,
        height: h,
      }));
    },
  };
  return { jobs, renderer };
}

const deps = (renderer: PdfRenderer | null, over: Partial<ExportDeps> = {}): ExportDeps => ({
  renderer,
  gate: new Gate(2, 4),
  rate: new RateWindow(500, 60_000),
  origin: ORIGIN,
  ...over,
});

const exportPng = (
  actor: Actor,
  id: string,
  d: ExportDeps,
  options: Partial<PngOptions> = {},
  cookieHeader: string | null = COOKIE,
) =>
  exportPlanPng(
    actor,
    SPORT,
    id,
    { cookieHeader },
    { page: 1, layout: "zip", resolution: "standard", ...options },
    d,
  );

const sessionWithPages = async (title: string, drills: number) => {
  const plan = await makePlan(coach, { title });
  let version = plan.version;
  const lib = await libraryDrill();
  for (let i = 0; i < drills; i++) {
    const added = await addDrillActivity(
      coach,
      SPORT,
      plan.id,
      addDrillActivitySchema.parse({ drillId: lib.id, version, durationMin: 5 }),
    );
    if (!added.ok) throw new Error(JSON.stringify(added.error));
    version = added.data.version;
  }
  return plan.id;
};

const audited = async (who: Actor, planId: string) =>
  (
    await tenantTx(who, (tx) =>
      tx
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(and(eq(auditEvents.action, "plan.exported"), eq(auditEvents.entityId, planId))),
    )
  ).length;

beforeAll(async () => {
  const blank = await PDFDocument.create();
  blank.addPage([595, 842]);
  pdf = Buffer.from(await blank.save());
  const founder = await createTestActor("Png Founder");
  const club = await createClub(founder, [{ role: "coach", name: "Bob Coach" }]);
  owner = club.ownerActor;
  [coach] = club.members as [Actor];
  outsider = await createTestActor("Otto Outsider");
});

afterAll(async () => {
  await pool.end();
});

describe("exporting a session as PNG images", () => {
  it("one page: a PNG at the model's size, with its physical size and title in the file", async () => {
    const id = await sessionWithPages("PNG page run", 3);
    const { jobs, renderer } = pngRenderer();
    const r = await exportPng(coach, id, deps(renderer), { page: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      contentType: "image/png",
      fileName: "PNG page run - page 2.png",
      pages: 1,
    });
    expect(jobs).toEqual([
      expect.objectContaining({
        scale: 2,
        pages: [2],
        layout: "pages",
        url: `${ORIGIN}/sessions/basketball/${id}/document?view=preview`,
      }),
    ]);
    expect(pngSize(r.data.bytes)).toEqual({ width: 1587, height: 2245 }); // A4 at 96 dpi × 2
    const text = r.data.bytes.toString("latin1");
    expect(text).toContain("pHYs");
    expect(text).toContain("Title\u0000PNG page run");
    for (const internal of [id, coach.userId, coach.organizationId])
      expect(text).not.toContain(internal);
  });

  it("all pages: a ZIP with one correctly named, correctly sized PNG per page", async () => {
    const id = await sessionWithPages("PNG zip run", 3);
    const { renderer, jobs } = pngRenderer();
    const r = await exportPng(coach, id, deps(renderer), {
      page: "all",
      layout: "zip",
      resolution: "high",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.contentType).toBe("application/zip");
    expect(r.data.fileName).toBe("PNG zip run - pages.zip");
    const entries = readZip(r.data.bytes);
    expect(entries).toHaveLength(r.data.pages);
    expect(r.data.pages).toBeGreaterThanOrEqual(3);
    expect(entries.map((e) => e.name)).toEqual(
      Array.from({ length: r.data.pages }, (_, i) => `PNG zip run - page ${i + 1}.png`),
    );
    for (const e of entries) expect(pngSize(e.data)).toEqual({ width: 2381, height: 3368 }); // × 3
    expect(jobs[0]).toMatchObject({ scale: 3, layout: "pages" });
    expect(jobs[0]!.pages).toEqual(Array.from({ length: r.data.pages }, (_, i) => i + 1));
  });

  it("all pages as ONE image: the pages stacked with a gap, sized to fit", async () => {
    const id = await sessionWithPages("PNG stack run", 3);
    const { renderer, jobs } = pngRenderer();
    const r = await exportPng(coach, id, deps(renderer), { page: "all", layout: "stack" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ contentType: "image/png", fileName: "PNG stack run.png" });
    expect(jobs[0]!.layout).toBe("stack");
    const n = jobs[0]!.pages.length;
    expect(pngSize(r.data.bytes)).toEqual({
      width: Math.round((A4.w + 2 * GAP) * jobs[0]!.scale),
      height: Math.round((n * A4.h + (n + 1) * GAP) * jobs[0]!.scale),
    });
  });

  it("refuses a page that is not there, and a single image taller than a browser can make", async () => {
    const id = await sessionWithPages("PNG limits run", 3);
    const { renderer, jobs } = pngRenderer();
    for (const page of [0, 99, 1.5, -1]) {
      const r = await exportPng(coach, id, deps(renderer), { page });
      expect(codeOf(r), String(page)).toBe("VALIDATION");
      expect(r.ok ? {} : r.error.fields).toEqual({ page: ["out_of_range"] });
    }
    const long = await sessionWithPages("PNG long run", 24);
    const tall = await exportPng(coach, long, deps(renderer), { page: "all", layout: "stack" });
    expect(codeOf(tall)).toBe("VALIDATION");
    expect(tall.ok ? {} : tall.error.fields).toEqual({ layout: ["too_many_pages"] });
    expect(
      codeOf(await exportPng(coach, long, deps(renderer), { page: "all", layout: "zip" })),
    ).toBe("OK"); // the ZIP always works
    expect(jobs.filter((j) => j.layout === "stack")).toHaveLength(0); // the too-tall request never reached the browser
  });

  it("never hands out an image whose size is not the page's size", async () => {
    const id = await sessionWithPages("PNG size run", 3);
    const r = await exportPng(coach, id, deps(pngRenderer({ wrong: true }).renderer), { page: 1 });
    expect(codeOf(r)).toBe("INTERNAL");
  });

  it("has the PDF's permissions: not found for anyone who cannot see the session; unavailable without a browser; audited", async () => {
    const id = await sessionWithPages("PNG access run", 3);
    const { renderer, jobs } = pngRenderer();
    expect(codeOf(await exportPng(outsider, id, deps(renderer)))).toBe("NOT_FOUND");
    expect(codeOf(await exportPng(owner, id, deps(renderer)))).toBe("NOT_FOUND"); // a colleague's private session
    expect(codeOf(await exportPng(coach, "not-a-uuid", deps(renderer)))).toBe("NOT_FOUND");
    expect(codeOf(await exportPng(coach, id, deps(null)))).toBe("UNAVAILABLE");
    expect(codeOf(await exportPng(coach, id, deps(renderer), {}, "x=1"))).toBe("UNAUTHENTICATED");
    expect(jobs).toEqual([]);
    expect(codeOf(await exportPng(coach, id, deps(renderer)))).toBe("OK");
    expect(await audited(coach, id)).toBe(1);
  });

  it("reports render failures as errors, never as files", async () => {
    const id = await sessionWithPages("PNG fail run", 3);
    for (const [error, code] of [
      [new RenderError("timeout"), "INTERNAL"],
      [new RenderError("crashed"), "INTERNAL"],
      [new RenderError("empty"), "INTERNAL"],
      [new RenderError("unauthenticated"), "UNAUTHENTICATED"],
      [new RenderError("too_large"), "VALIDATION"],
    ] as const)
      expect(codeOf(await exportPng(coach, id, deps(pngRenderer({ fail: error }).renderer)))).toBe(
        code,
      );
  });
});
