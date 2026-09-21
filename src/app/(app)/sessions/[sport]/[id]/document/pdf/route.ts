import { NextResponse } from "next/server";
import { httpStatus } from "@/lib/errors";
import { clientIp, getViewer } from "@/modules/identity";
import { contentDisposition, exportPlanPdf } from "@/modules/exports";

/**
 * GET /sessions/[sport]/[id]/document/pdf — the session as a PDF (Step 6).
 *
 * Authentication is the database-backed session, exactly as for pages; a session the requester may not see answers
 * 404, as everywhere else. The body is the SAVED design (the design screen saves first). Runs on Node: it drives a
 * headless browser.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const problem = (code: Parameters<typeof httpStatus>[0]) =>
  NextResponse.json(
    { error: { code } },
    { status: httpStatus(code), headers: { "cache-control": "private, no-store" } },
  );

export async function GET(
  request: Request,
  ctx: RouteContext<"/sessions/[sport]/[id]/document/pdf">,
) {
  const viewer = await getViewer();
  if (!viewer) return problem("UNAUTHENTICATED");
  const { sport, id } = await ctx.params;

  const result = await exportPlanPdf(viewer.actor, sport, id, {
    cookieHeader: request.headers.get("cookie"),
    ip: clientIp(request.headers),
  });
  if (!result.ok) return problem(result.error.code);

  return new Response(new Uint8Array(result.data.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": contentDisposition(result.data.fileName),
      "content-length": String(result.data.bytes.length),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
