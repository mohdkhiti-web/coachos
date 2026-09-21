import "server-only";
import { env } from "@/lib/env";
import type { Actor } from "@/lib/authz/can";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { fail, ok, type Result } from "@/lib/result";
import { recordAudit } from "@/modules/audit";
import { buildDocumentModel, resolveSessionDesign } from "@/modules/documents";
import { getPlan, toDocumentInput, type PlanDetailDto } from "@/modules/plans";
import { getSport, type SportDto } from "@/modules/sports";
import { pdfFileName, safeBaseName } from "./filename";
import { GateFull, type Gate, type RateWindow } from "./limits";
import { stampPdf } from "./metadata";
import { stampPng } from "./png-meta";
import {
  MAX_IMAGE_PIXELS,
  RenderError,
  STACK_GAP_PX,
  type PdfRenderer,
  type RenderedImage,
} from "./renderer";
import { runtime } from "./runtime";
import { createZip } from "./zip";

/**
 * Export a session as a PDF or as PNG images. The file is the app's own document pipeline run by a headless browser as
 * the requester: exactly what Print shows, and only what this person is allowed to see, because the browser acts with
 * their cookies and row-level security applies as usual.
 *
 * Order matters: is export on at all → is the request well-formed → may this person see the session (a session they
 * cannot read is "not found") → is this person asking too often → is there room to render → render → verify → audit.
 */

export interface ExportDeps {
  renderer: PdfRenderer | null;
  gate: Gate;
  rate: RateWindow;
  /** The app's origin, from configuration — never from the request. */
  origin: string;
}

const defaults = (): ExportDeps => ({ ...runtime(), origin: new URL(env.APP_URL).origin });

/** Only this app's own session cookies go to the renderer: it needs to be the requester, nothing more. */
export function authCookies(header: string | null): Array<{ name: string; value: string }> {
  if (!header) return [];
  const out: Array<{ name: string; value: string }> = [];
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    // Better Auth's cookies carry the app's prefix (and `__Secure-` when served over HTTPS)
    if (/^(__Secure-)?coachos[._]/.test(name) && value) out.push({ name, value });
  }
  return out;
}

interface Prepared {
  sport: SportDto;
  plan: PlanDetailDto;
  cookies: Array<{ name: string; value: string }>;
  url: string;
}

type ExportRequest = { cookieHeader: string | null; ip?: string | null };

async function prepare(
  actor: Actor,
  sportKey: string,
  planId: string,
  request: ExportRequest,
  deps: ExportDeps,
): Promise<Result<Prepared>> {
  if (!deps.renderer) return fail("UNAVAILABLE");
  if (!isUuid(planId)) return fail("NOT_FOUND");
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");
  const plan = await getPlan(actor, sport.key, planId);
  if (!plan) return fail("NOT_FOUND"); // not there, or not this person's to see
  const cookies = authCookies(request.cookieHeader);
  if (cookies.length === 0) return fail("UNAUTHENTICATED");
  if (!deps.rate.allow(actor.userId)) return fail("RATE_LIMITED");
  // the address is built from validated parts and the configured origin: nothing the requester typed is a URL
  const url = `${deps.origin}/sessions/${encodeURIComponent(sport.key)}/${plan.id}/document?view=preview`;
  return ok({ sport, plan, cookies, url });
}

const failureOf = (err: unknown, planId: string, what: string): Result<never> => {
  if (err instanceof GateFull) return fail("RATE_LIMITED");
  const reason = err instanceof RenderError ? err.reason : "crashed";
  logger.error(
    { reason, planId, what, message: err instanceof Error ? err.message.slice(0, 300) : "" },
    "exports.render_failed",
  );
  if (reason === "unauthenticated") return fail("UNAUTHENTICATED");
  if (reason === "too_large") return fail("VALIDATION", { fields: { layout: ["too_many_pages"] } });
  return fail("INTERNAL");
};

export interface ExportFile {
  bytes: Buffer;
  fileName: string;
  contentType: string;
}
export type PdfFile = ExportFile;

// ---- PDF ---------------------------------------------------------------------------------------------------------

export async function exportPlanPdf(
  actor: Actor,
  sportKey: string,
  planId: string,
  request: ExportRequest,
  deps: ExportDeps = defaults(),
): Promise<Result<PdfFile>> {
  const prepared = await prepare(actor, sportKey, planId, request, deps);
  if (!prepared.ok) return prepared;
  const { sport, plan, cookies, url } = prepared.data;

  let bytes: Buffer;
  try {
    bytes = await deps.gate.run(() => deps.renderer!.render({ url, cookies }));
  } catch (err) {
    return failureOf(err, plan.id, "pdf");
  }
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    logger.error({ planId: plan.id }, "exports.pdf_invalid");
    return fail("INTERNAL"); // never hand out something that is not a PDF
  }

  // the document information: what is printed on the document, nothing internal
  try {
    const objectives = [plan.objectives.primary, ...plan.objectives.secondary].flatMap((o) =>
      o ? [o.name] : [],
    );
    bytes = await stampPdf(bytes, {
      title: plan.title,
      author: plan.details.coachName,
      subject:
        [sport.name, plan.ageGroup?.name, plan.teamName].filter(Boolean).join(" · ") +
        " · training session",
      keywords: objectives,
      created: new Date(),
    });
  } catch (err) {
    logger.error(
      { planId: plan.id, message: String(err).slice(0, 200) },
      "exports.pdf_metadata_failed",
    );
    return fail("INTERNAL");
  }

  await recordAudit(
    { userId: actor.userId, organizationId: actor.organizationId },
    {
      action: "plan.exported",
      entityType: "plan",
      entityId: plan.id,
      ip: request.ip ?? null,
      metadata: { sport: sport.key, format: "pdf", bytes: bytes.length },
    },
  );
  return ok({ bytes, fileName: pdfFileName(plan.title), contentType: "application/pdf" });
}

// ---- a public shared page as a PDF --------------------------------------------------------------------------------

/**
 * The PDF of a PUBLIC shared page: there is no signed-in person here, so the caller (the share route) has already
 * verified the link's signature and that the session is live, and passes the page's own address and what may go into
 * the file's properties. Same renderer, same guards (the gate, and a rate window keyed by whatever the caller chooses,
 * e.g. the visitor's address), same `%PDF-` check; no cookies are given to the browser.
 */
export async function renderPublicPdf(
  input: {
    url: string;
    title: string;
    author: string;
    subject: string;
    keywords: string[];
    rateKey: string;
  },
  deps: ExportDeps = defaults(),
): Promise<Result<PdfFile>> {
  if (!deps.renderer) return fail("UNAVAILABLE");
  if (!deps.rate.allow(input.rateKey)) return fail("RATE_LIMITED");
  let bytes: Buffer;
  try {
    bytes = await deps.gate.run(() => deps.renderer!.render({ url: input.url, cookies: [] }));
  } catch (err) {
    return failureOf(err, "shared", "public-pdf");
  }
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("latin1") !== "%PDF-")
    return fail("INTERNAL");
  try {
    bytes = await stampPdf(bytes, {
      title: input.title,
      author: input.author,
      subject: input.subject,
      keywords: input.keywords,
      created: new Date(),
    });
  } catch {
    return fail("INTERNAL");
  }
  return ok({ bytes, fileName: pdfFileName(input.title), contentType: "application/pdf" });
}

// ---- PNG ---------------------------------------------------------------------------------------------------------

export const RESOLUTIONS = { standard: 2, high: 3 } as const;
export type Resolution = keyof typeof RESOLUTIONS;

export interface PngOptions {
  /** A page number (1-based) or every page. */
  page: number | "all";
  /** For `all`: a ZIP of one PNG per page, or ONE tall image. (A single page is always one PNG.) */
  layout: "zip" | "stack";
  resolution: Resolution;
}

const PX_PER_MM = 96 / 25.4;
const near = (a: number, b: number) => Math.abs(a - b) <= 2;

/**
 * Pages as PNG images. The pages are the DocumentModel's (built here with the same pure function the preview and the
 * print use), so the number of pages and each page's size are KNOWN before rendering; the renderer then captures the
 * real page elements at print, and every image is checked against the size the model says it must have.
 */
export async function exportPlanPng(
  actor: Actor,
  sportKey: string,
  planId: string,
  request: ExportRequest,
  options: PngOptions,
  deps: ExportDeps = defaults(),
): Promise<Result<ExportFile & { pages: number; width: number; height: number }>> {
  const prepared = await prepare(actor, sportKey, planId, request, deps);
  if (!prepared.ok) return prepared;
  const { sport, plan, cookies, url } = prepared.data;

  // the same model the preview and the print show
  const settings = plan.documentSettings;
  const model = buildDocumentModel(
    toDocumentInput(plan),
    resolveSessionDesign(settings),
    settings.reflection,
  );
  const total = model.pageCount;
  const pageW = model.geometry.widthMm * PX_PER_MM;
  const pageH = model.geometry.heightMm * PX_PER_MM;

  let pages: number[];
  if (options.page === "all") pages = Array.from({ length: total }, (_, i) => i + 1);
  else if (Number.isInteger(options.page) && options.page >= 1 && options.page <= total)
    pages = [options.page];
  else return fail("VALIDATION", { fields: { page: ["out_of_range"] } });

  const stack = options.page === "all" && options.layout === "stack";
  let scale: number = RESOLUTIONS[options.resolution];
  if (stack) {
    const cssHeight = pages.length * pageH + (pages.length + 1) * STACK_GAP_PX;
    scale = Math.min(scale, Math.floor((MAX_IMAGE_PIXELS / cssHeight) * 100) / 100);
    if (scale < 1) return fail("VALIDATION", { fields: { layout: ["too_many_pages"] } });
  }

  let images: RenderedImage[];
  try {
    images = await deps.gate.run(() =>
      deps.renderer!.renderPng({ url, cookies, scale, pages, layout: stack ? "stack" : "pages" }),
    );
  } catch (err) {
    return failureOf(err, plan.id, "png");
  }

  // every image must be the size the model says its page is — never hand out a clipped or mis-scaled page
  const expected = stack
    ? [
        {
          w: (pageW + 2 * STACK_GAP_PX) * scale,
          h: (pages.length * pageH + (pages.length + 1) * STACK_GAP_PX) * scale,
        },
      ]
    : pages.map(() => ({ w: pageW * scale, h: pageH * scale }));
  if (
    images.length !== expected.length ||
    images.some((img, i) => !near(img.width, expected[i]!.w) || !near(img.height, expected[i]!.h))
  ) {
    logger.error(
      {
        planId: plan.id,
        got: images.map((i) => `${i.width}x${i.height}`),
        want: expected.map((e) => `${Math.round(e.w)}x${Math.round(e.h)}`),
      },
      "exports.png_size_mismatch",
    );
    return fail("INTERNAL");
  }

  const dpi = 96 * scale;
  const stamped = images.map((img) => ({
    ...img,
    bytes: stampPng(img.bytes, { title: plan.title, dpi }),
  }));

  const base = safeBaseName(plan.title, "session");
  const digits = String(total).length;
  let file: ExportFile;
  let format: "png" | "zip";
  if (stack) {
    file = { bytes: stamped[0]!.bytes, fileName: `${base}.png`, contentType: "image/png" };
    format = "png";
  } else if (pages.length === 1) {
    file = {
      bytes: stamped[0]!.bytes,
      fileName: `${base} - page ${String(pages[0]).padStart(digits, "0")}.png`,
      contentType: "image/png",
    };
    format = "png";
  } else {
    const now = new Date();
    file = {
      bytes: createZip(
        stamped.map((img) => ({
          name: `${base} - page ${String(img.page).padStart(digits, "0")}.png`,
          data: img.bytes,
          time: now,
        })),
      ),
      fileName: `${base} - pages.zip`,
      contentType: "application/zip",
    };
    format = "zip";
  }

  await recordAudit(
    { userId: actor.userId, organizationId: actor.organizationId },
    {
      action: "plan.exported",
      entityType: "plan",
      entityId: plan.id,
      ip: request.ip ?? null,
      metadata: {
        sport: sport.key,
        format,
        pages: pages.length,
        bytes: file.bytes.length,
        resolution: options.resolution,
      },
    },
  );
  return ok({ ...file, pages: pages.length, width: stamped[0]!.width, height: stamped[0]!.height });
}
