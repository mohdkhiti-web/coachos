import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drills, plans, planActivities, skills, sports } from "@/db/schema";
import { db } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import type { Actor } from "@/lib/authz/can";
import { createPlan } from "@/modules/plans/commands";
import { planInputSchema, type PlanInput, type PlanInputRaw } from "@/modules/plans/validators";

/** A valid session input; only the title is required, everything else has a default. */
export function planInput(over: Partial<PlanInputRaw> = {}): PlanInput {
  return planInputSchema.parse({ title: "Tuesday practice", ...over });
}

/** Create a session through the command (the normal path) and return its id + version, or throw. */
export async function makePlan(
  actor: Actor,
  over: Partial<PlanInputRaw> = {},
): Promise<{ id: string; version: number }> {
  const r = await createPlan(actor, "basketball", planInput(over));
  if (!r.ok) throw new Error(`plan fixture failed: ${JSON.stringify(r)}`);
  return r.data;
}

/** Superuser connection: bypasses row-level security, for setup and assertions a user must never be able to do. */
export function adminPool() {
  return new Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 1 });
}

export async function basketballId(): Promise<string> {
  const [row] = await db.select({ id: sports.id }).from(sports).where(eq(sports.key, "basketball"));
  return row!.id;
}

export async function footballId(): Promise<string> {
  const [row] = await db.select({ id: sports.id }).from(sports).where(eq(sports.key, "football"));
  return row!.id;
}

export async function skillIdOf(key: string): Promise<string> {
  const [row] = await db.select({ id: skills.id }).from(skills).where(eq(skills.key, key));
  return row!.id;
}

/** A published library drill, by its seed key. */
export async function libraryDrill(seedKey = "mikan-drill") {
  const [row] = await db
    .select({ id: drills.id, version: drills.version })
    .from(drills)
    .where(eq(drills.seedKey, seedKey));
  return row!;
}

/** Minimal JSON that satisfies the database's own checks on a drill snapshot (the app writes a full one). */
export const bareSnapshot = (drillId: string, version: number) => ({
  schemaVersion: 1,
  title: "Raw",
  provenance: { drillId, drillVersion: version },
});

/** Insert a session row directly, as `actor`, through row-level security: no application code in between. */
export async function rawPlan(
  actor: Actor,
  sportId: string,
  over: Partial<typeof plans.$inferInsert> = {},
): Promise<string> {
  const id = over.id ?? newId();
  await tenantTx(actor, (tx) =>
    tx.insert(plans).values({
      id,
      organizationId: actor.organizationId,
      sportId,
      createdBy: actor.userId,
      title: "Raw plan",
      targetMinutes: 90,
      ...over,
    }),
  );
  return id;
}

/** Insert an activity row directly, as `actor`. Defaults to a 10-minute custom activity at position 0. */
export async function rawActivity(
  actor: Actor,
  planId: string,
  sportId: string,
  over: Partial<typeof planActivities.$inferInsert> = {},
): Promise<string> {
  const id = over.id ?? newId();
  await tenantTx(actor, (tx) =>
    tx.insert(planActivities).values({
      id,
      planId,
      sportId,
      position: 0,
      kind: "custom",
      title: "Raw activity",
      durationMin: 10,
      ...over,
    }),
  );
  return id;
}
