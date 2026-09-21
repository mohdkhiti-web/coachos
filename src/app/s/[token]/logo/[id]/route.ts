import { NextResponse } from "next/server";
import { clientIp } from "@/modules/identity";
import { imageResponse } from "@/modules/media/serve";
import { readShareLogo } from "@/modules/sharing";
import { publicPageRate } from "@/modules/sharing/public-limits";

/**
 * GET /s/[token]/logo/[id] — the logo a shared session's design uses, for the holder of the link. Only THAT logo, only
 * while the link is live: any other id (another logo of the workspace, a made-up one) is a plain 404.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/s/[token]/logo/[id]">) {
  const { token, id } = await ctx.params;
  const notFound = () =>
    NextResponse.json(
      { error: { code: "NOT_FOUND" } },
      { status: 404, headers: { "cache-control": "private, no-store" } },
    );
  if (!publicPageRate.allow(clientIp(request.headers) ?? "unknown")) return notFound();
  const file = await readShareLogo(token, id);
  return file ? imageResponse(request, file) : notFound();
}
