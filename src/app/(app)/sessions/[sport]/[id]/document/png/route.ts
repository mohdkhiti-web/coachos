import { NextResponse } from "next/server";
import { httpStatus } from "@/lib/errors";
import { clientIp, getViewer } from "@/modules/identity";
import { contentDisposition, exportPlanPng, type PngOptions } from "@/modules/exports";

/**
 * GET /sessions/[sport]/[id]/document/png — the session's pages as PNG images (Step 7).
 *
 *   ?page=3                 one page as a PNG
 *   ?page=all               every page as a ZIP of PNGs (default) …
 *   ?page=all&layout=stack  … or as ONE tall image (only while it fits: the server says when it does not)
 *   &resolution=standard|high   about 192 or 288 dpi
 *
 * Same authentication and permissions as the PDF; the images are the real document pages at print, and each one is
 * checked against the size the DocumentModel says it has before it is handed out.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const problem = (code: Parameters<typeof httpStatus>[0], fields?: Record<string, string[]>) =>
  NextResponse.json(
    { error: { code, ...(fields ? { fields } : {}) } },
    { status: httpStatus(code), headers: { "cache-control": "private, no-store" } },
  );

function parseOptions(url: URL): PngOptions | null {
  const page = url.searchParams.get("page") ?? "all";
  const layout = url.searchParams.get("layout") ?? "zip";
  const resolution = url.searchParams.get("resolution") ?? "standard";
  if (layout !== "zip" && layout !== "stack") return null;
  if (resolution !== "standard" && resolution !== "high") return null;
  if (page === "all") return { page, layout, resolution };
  if (!/^[0-9]{1,4}$/.test(page)) return null;
  return { page: Number(page), layout, resolution };
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/sessions/[sport]/[id]/document/png">,
) {
  const viewer = await getViewer();
  if (!viewer) return problem("UNAUTHENTICATED");
  const options = parseOptions(new URL(request.url));
  if (!options) return problem("VALIDATION");
  const { sport, id } = await ctx.params;

  const result = await exportPlanPng(
    viewer.actor,
    sport,
    id,
    { cookieHeader: request.headers.get("cookie"), ip: clientIp(request.headers) },
    options,
  );
  if (!result.ok) return problem(result.error.code, result.error.fields);

  return new Response(new Uint8Array(result.data.bytes), {
    headers: {
      "content-type": result.data.contentType,
      "content-disposition": contentDisposition(result.data.fileName),
      "content-length": String(result.data.bytes.length),
      "x-image-pages": String(result.data.pages),
      "x-image-size": `${result.data.width}x${result.data.height}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
