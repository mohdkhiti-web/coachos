import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { httpStatus } from "@/lib/errors";
import { contentDisposition, renderPublicPdf } from "@/modules/exports";
import { clientIp } from "@/modules/identity";
import { resolveShare } from "@/modules/sharing";
import { publicPageRate, publicPdfRate } from "@/modules/sharing/public-limits";

/**
 * GET /s/[token]/pdf — the shared session as a PDF, for anyone who holds the link (Step 7). The link's signature is
 * verified before anything runs; a forged, revoked or expired link (or a deleted/archived session) is a plain 404; the
 * renderer opens the public page itself, with no cookies, so it can only ever show what the public may see.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const problem = (code: Parameters<typeof httpStatus>[0]) =>
  NextResponse.json(
    { error: { code } },
    { status: httpStatus(code), headers: { "cache-control": "private, no-store" } },
  );

export async function GET(request: Request, ctx: RouteContext<"/s/[token]/pdf">) {
  const { token } = await ctx.params;
  const ip = clientIp(request.headers) ?? "unknown";
  if (!publicPageRate.allow(ip)) return problem("RATE_LIMITED");
  const shared = await resolveShare(token);
  if (!shared) return problem("NOT_FOUND"); // cheap: a wrong link costs nothing but this check
  if (!publicPdfRate.allow(ip)) return problem("RATE_LIMITED"); // each real PDF runs a browser

  const result = await renderPublicPdf({
    url: `${new URL(env.APP_URL).origin}/s/${token}`,
    title: shared.title,
    author: shared.meta.author,
    subject: shared.meta.subject,
    keywords: shared.meta.keywords,
    rateKey: `share:${shared.shareId}`,
  });
  if (!result.ok) return problem(result.error.code);
  return new Response(new Uint8Array(result.data.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": contentDisposition(result.data.fileName),
      "content-length": String(result.data.bytes.length),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
