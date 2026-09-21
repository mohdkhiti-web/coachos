import { NextResponse } from "next/server";
import { httpStatus } from "@/lib/errors";
import { getViewer } from "@/modules/identity";
import { imageResponse } from "@/modules/media/serve";
import { readLogo } from "@/modules/media";

/**
 * GET /logos/[id] — a workspace logo, for a signed-in member of that workspace (Step 7). The bytes come from the
 * database through row-level security: another workspace's logo, a deleted one and a made-up id are all simply "not found".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/logos/[id]">) {
  const viewer = await getViewer();
  if (!viewer)
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED" } },
      { status: httpStatus("UNAUTHENTICATED"), headers: { "cache-control": "private, no-store" } },
    );
  const { id } = await ctx.params;
  const file = await readLogo(viewer.actor, id);
  if (!file)
    return NextResponse.json(
      { error: { code: "NOT_FOUND" } },
      { status: 404, headers: { "cache-control": "private, no-store" } },
    );
  return imageResponse(request, file);
}
