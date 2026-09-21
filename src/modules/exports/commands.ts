import "server-only";
import { env } from "@/lib/env";
import type { Actor } from "@/lib/authz/can";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { fail, ok, type Result } from "@/lib/result";
import { recordAudit } from "@/modules/audit";
import { getPlan } from "@/modules/plans";
import { getSport } from "@/modules/sports";
import { pdfFileName } from "./filename";
import { GateFull, type Gate, type RateWindow } from "./limits";
import { stampPdf } from "./metadata";
import { RenderError, type PdfRenderer } from "./renderer";
import { runtime } from "./runtime";

/**
 * Export a session as a PDF (Step 6). The file is the app's own print pipeline run by a headless browser as the
 * requester: the document is exactly what Print would produce, and it can only ever contain what this person is
 * allowed to see, because the browser acts with their cookies and row-level security applies as usual.
 *
 * Order matters: is export on at all → is the request well-formed → may this person see the session (a session they
 * cannot read is "not found") → is this person asking too often → is there room to render → render → audit.
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

export interface PdfFile {
  bytes: Buffer;
  fileName: string;
}

export async function exportPlanPdf(
  actor: Actor,
  sportKey: string,
  planId: string,
  request: { cookieHeader: string | null; ip?: string | null },
  deps: ExportDeps = defaults(),
): Promise<Result<PdfFile>> {
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
  let bytes: Buffer;
  try {
    bytes = await deps.gate.run(() => deps.renderer!.render({ url, cookies }));
  } catch (err) {
    if (err instanceof GateFull) return fail("RATE_LIMITED");
    const reason = err instanceof RenderError ? err.reason : "crashed";
    logger.error(
      { reason, planId: plan.id, message: err instanceof Error ? err.message.slice(0, 300) : "" },
      "exports.pdf_failed",
    );
    return reason === "unauthenticated" ? fail("UNAUTHENTICATED") : fail("INTERNAL");
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
  return ok({ bytes, fileName: pdfFileName(plan.title) });
}
