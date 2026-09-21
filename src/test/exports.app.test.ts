import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { and, eq } from "drizzle-orm";
import { auditEvents } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import { authCookies, exportPlanPdf, type ExportDeps } from "@/modules/exports/commands";
import { Gate, RateWindow } from "@/modules/exports/limits";
import { RenderError, type PdfRenderer, type RenderJob } from "@/modules/exports/renderer";
import { setPlanStatus } from "@/modules/plans/commands";
import { createClub } from "./drill-fixtures";
import { createTestActor } from "./factories";
import { makePlan } from "./plan-fixtures";

/**
 * Exporting a session as a PDF through the real command, permissions and database, with the browser replaced by a
 * fake renderer that records what it was asked to print. (The real browser is exercised end to end in Playwright.)
 * What matters here: who may export what, what the renderer is allowed to be told, and that nothing that is not a PDF
 * is ever handed out.
 */

const SPORT = "basketball";
const ORIGIN = "http://app.test";
const COOKIE = "coachos.session_token=abc.def; other=1; coachos.session_data=xyz";
let PDF: Buffer; // a real (one-page) PDF: the command stamps its document information, so the fake must be parseable

let owner: Actor;
let coach: Actor;
let assistant: Actor;
let outsider: Actor;

const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);

function fake(bytes?: Buffer | Error) {
  const out = bytes ?? PDF;
  const jobs: RenderJob[] = [];
  const renderer: PdfRenderer = {
    async render(job) {
      jobs.push(job);
      if (out instanceof Error) throw out;
      return out;
    },
    async renderPng() {
      throw new RenderError("crashed", "not used in these tests");
    },
  };
  return { jobs, renderer };
}
const deps = (renderer: PdfRenderer | null, over: Partial<ExportDeps> = {}): ExportDeps => ({
  renderer,
  gate: new Gate(2, 4),
  rate: new RateWindow(50, 60_000),
  origin: ORIGIN,
  ...over,
});
const exportIt = (actor: Actor, id: string, d: ExportDeps, cookieHeader: string | null = COOKIE) =>
  exportPlanPdf(actor, SPORT, id, { cookieHeader }, d);

const audited = async (who: Actor, planId: string) =>
  (
    await tenantTx(who, (tx) =>
      tx
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(and(eq(auditEvents.action, "plan.exported"), eq(auditEvents.entityId, planId))),
    )
  ).length;

beforeAll(async () => {
  const blank = await PDFDocument.create();
  blank.addPage([595, 842]);
  blank.setProducer("Skia/PDF m0");
  blank.setTitle("Internal page title");
  PDF = Buffer.from(await blank.save());
  const founder = await createTestActor("Export Founder");
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

describe("cookies handed to the renderer", () => {
  it("are only the app's own session cookies", () => {
    expect(authCookies(COOKIE)).toEqual([
      { name: "coachos.session_token", value: "abc.def" },
      { name: "coachos.session_data", value: "xyz" },
    ]);
    expect(authCookies("__Secure-coachos.session_token=s; theme=dark")).toEqual([
      { name: "__Secure-coachos.session_token", value: "s" },
    ]);
    expect(authCookies("analytics=1; ads=2")).toEqual([]);
    expect(authCookies("coachos.session_token=")).toEqual([]);
    expect(authCookies("=novalue; coachos.x")).toEqual([]);
    expect(authCookies(null)).toEqual([]);
  });
});

describe("exporting a session", () => {
  it("prints the app's own design route for that session, as the requester", async () => {
    const { id } = await makePlan(coach, { title: "Tuesday practice" });
    const { jobs, renderer } = fake();
    const r = await exportIt(coach, id, deps(renderer));
    expect(r.ok && r.data.fileName).toBe("Tuesday practice.pdf");
    expect(r.ok && r.data.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(jobs).toEqual([
      {
        url: `${ORIGIN}/sessions/basketball/${id}/document?view=preview`,
        cookies: [
          { name: "coachos.session_token", value: "abc.def" },
          { name: "coachos.session_data", value: "xyz" },
        ],
      },
    ]);
  });

  it("puts what is printed on the document into its properties, and nothing internal", async () => {
    const { id } = await makePlan(coach, {
      title: "Metadata run",
      teamName: "U14 Boys",
      details: { coachName: "Sam Rivera", clubName: "Riverside BC" },
    });
    const r = await exportIt(coach, id, deps(fake().renderer));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = await PDFDocument.load(r.data.bytes, { updateMetadata: false });
    expect(doc.getTitle()).toBe("Metadata run");
    expect(doc.getAuthor()).toBe("Sam Rivera");
    expect(doc.getSubject()).toContain("Basketball");
    expect(doc.getSubject()).toContain("U14 Boys");
    expect(doc.getCreator()).toBe("CoachOS");
    expect(doc.getProducer()).toBe("CoachOS PDF export");
    expect(doc.getPageCount()).toBe(1);
    const info = r.data.bytes.toString("latin1");
    for (const internal of [id, coach.userId, coach.organizationId, "Internal page title", "Skia"])
      expect(info, internal).not.toContain(internal);
  });

  it("names the file from the title, safely", async () => {
    const { id } = await makePlan(coach, { title: 'U14 / "finishing": part 1' });
    const r = await exportIt(coach, id, deps(fake().renderer));
    expect(r.ok && r.data.fileName).toBe("U14 finishing part 1.pdf");
  });

  it("records who exported what, in the audit trail", async () => {
    const { id } = await makePlan(coach, { title: "Audited" });
    await exportIt(coach, id, deps(fake().renderer));
    expect(await audited(coach, id)).toBe(1);
    const failed = await makePlan(coach, { title: "Not audited" });
    await exportIt(coach, failed.id, deps(fake(new RenderError("crashed")).renderer));
    expect(await audited(coach, failed.id)).toBe(0); // only a file that was actually produced
  });

  it("can be read by anyone who can see the session, an assistant included; archived sessions too", async () => {
    const shared = await makePlan(coach, { title: "Shared", visibility: "organization" });
    for (const who of [owner, assistant]) {
      expect(codeOf(await exportIt(who, shared.id, deps(fake().renderer))), who.role).toBe("OK");
    }
    const archived = await makePlan(coach, { title: "Archived one", visibility: "organization" });
    const done = await setPlanStatus(coach, SPORT, archived.id, "archived", archived.version);
    expect(done.ok).toBe(true);
    expect(codeOf(await exportIt(assistant, archived.id, deps(fake().renderer)))).toBe("OK");
  });

  it("does not exist for anyone who cannot see the session: another member's private one, another workspace, junk ids", async () => {
    const mine = await makePlan(coach, { title: "Private", visibility: "private" });
    const { jobs, renderer } = fake();
    expect(codeOf(await exportIt(owner, mine.id, deps(renderer)))).toBe("NOT_FOUND");
    expect(codeOf(await exportIt(outsider, mine.id, deps(renderer)))).toBe("NOT_FOUND");
    expect(codeOf(await exportIt(coach, "not-a-uuid", deps(renderer)))).toBe("NOT_FOUND");
    expect(
      codeOf(await exportIt(coach, "0b6f6f4e-6c0f-4b39-8f6e-0d5d7b1c2a10", deps(renderer))),
    ).toBe("NOT_FOUND");
    expect(
      await exportPlanPdf(coach, "curling", mine.id, { cookieHeader: COOKIE }, deps(renderer)),
    ).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(jobs).toEqual([]); // nothing was rendered for any of them
  });

  it("does not export a deleted session", async () => {
    const { id, version } = await makePlan(coach, { title: "Soon deleted" });
    const { deletePlan } = await import("@/modules/plans/commands");
    expect((await deletePlan(coach, SPORT, id)).ok).toBe(true);
    void version;
    expect(codeOf(await exportIt(coach, id, deps(fake().renderer)))).toBe("NOT_FOUND");
  });

  it("is unavailable when there is no renderer, before anything else happens", async () => {
    const { id } = await makePlan(coach, { title: "No browser" });
    expect(codeOf(await exportIt(coach, id, deps(null)))).toBe("UNAVAILABLE");
  });

  it("needs the requester's own cookies to render as them", async () => {
    const { id } = await makePlan(coach, { title: "No cookies" });
    const { jobs, renderer } = fake();
    expect(codeOf(await exportIt(coach, id, deps(renderer), null))).toBe("UNAUTHENTICATED");
    expect(codeOf(await exportIt(coach, id, deps(renderer), "theme=dark"))).toBe("UNAUTHENTICATED");
    expect(jobs).toEqual([]);
  });

  it("limits how often one person may ask, and how many render at once", async () => {
    const { id } = await makePlan(coach, { title: "Popular" });
    const tight = deps(fake().renderer, { rate: new RateWindow(2, 60_000) });
    expect(codeOf(await exportIt(coach, id, tight))).toBe("OK");
    expect(codeOf(await exportIt(coach, id, tight))).toBe("OK");
    expect(codeOf(await exportIt(coach, id, tight))).toBe("RATE_LIMITED");

    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const slow: PdfRenderer = {
      render: async () => (await held, PDF),
      renderPng: async () => [],
    };
    const crowded = deps(slow, { gate: new Gate(1, 0) });
    const first = exportIt(coach, id, crowded);
    await new Promise((r) => setTimeout(r, 20));
    expect(codeOf(await exportIt(coach, id, crowded))).toBe("RATE_LIMITED"); // no room, not even a queue
    release();
    expect(codeOf(await first)).toBe("OK");
  });

  it("reports a renderer that failed, timed out or returned rubbish as an error, never as a file", async () => {
    const { id } = await makePlan(coach, { title: "Fragile" });
    for (const outcome of [
      new RenderError("timeout"),
      new RenderError("crashed"),
      new RenderError("empty"),
      new Error("anything else"),
    ])
      expect(codeOf(await exportIt(coach, id, deps(fake(outcome).renderer)))).toBe("INTERNAL");
    expect(
      codeOf(await exportIt(coach, id, deps(fake(new RenderError("unauthenticated")).renderer))),
    ).toBe("UNAUTHENTICATED");
    for (const rubbish of [
      Buffer.from("<html>sign in</html>"),
      Buffer.alloc(0),
      Buffer.from("%PD"),
    ])
      expect(codeOf(await exportIt(coach, id, deps(fake(rubbish).renderer)))).toBe("INTERNAL");
  });
});
