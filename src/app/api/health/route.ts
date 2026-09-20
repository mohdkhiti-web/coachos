import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";

// Uptime/readiness probe. Verifies the runtime role can reach the database. Reveals nothing else.
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      { status: "ok", db: "up", latencyMs: Date.now() - startedAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "health.db_down");
    return Response.json(
      { status: "degraded", db: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
