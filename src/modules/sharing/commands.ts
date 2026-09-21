import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { planShares, plans } from "@/db/schema";
import { can, type Actor, type PlanResource } from "@/lib/authz/can";
import type { Tx } from "@/lib/db/client";
import { inTx } from "@/lib/db/in-tx";
import { tenantTx } from "@/lib/db/tx";
import { isUuid, newId } from "@/lib/ids";
import { fail, ok, type Result } from "@/lib/result";
import { recordAuditInTx } from "@/modules/audit";
import { getSport } from "@/modules/sports";
import type { ShareExpiry, ShareStatusDto } from "./dto";
import { shareSecret, shareUrl } from "./secret";
import { makeShareToken } from "./token";

/**
 * Sharing a session read-only (Step 7): make the link, see it, regenerate it, revoke it. Each command re-checks who may:
 * an author of the session or an owner/admin (`plan:share`), on a LIVE session (not deleted, not archived). The database
 * enforces the same (row-level security and a guard trigger), and it allows at most one live link per session.
 */

type ShareRow = typeof planShares.$inferSelect;
const DAY = 86_400_000;

const isLive = (s: Pick<ShareRow, "revokedAt" | "expiresAt">, now = Date.now()) =>
  s.revokedAt === null && (s.expiresAt === null || s.expiresAt.getTime() > now);

function toStatus(actor: Actor, s: ShareRow): ShareStatusDto {
  return {
    active: true,
    url: shareUrl(makeShareToken(s.id, shareSecret())),
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    createdByMe: s.createdBy === actor.userId,
  };
}

const resourceOf = (p: {
  organizationId: string;
  createdBy: string | null;
  visibility: string;
  status: string;
}): PlanResource => ({
  organizationId: p.organizationId,
  createdBy: p.createdBy,
  visibility: p.visibility as PlanResource["visibility"],
  status: p.status,
});

async function loadPlan(tx: Tx, sportKey: string, planId: string) {
  const sport = await getSport(sportKey);
  if (!sport || !isUuid(planId)) return null;
  const [row] = await tx
    .select({
      id: plans.id,
      organizationId: plans.organizationId,
      createdBy: plans.createdBy,
      visibility: plans.visibility,
      status: plans.status,
      deletedAt: plans.deletedAt,
    })
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.sportId, sport.id)))
    .limit(1);
  return row && !row.deletedAt ? { ...row, sportKey: sport.key } : null;
}

const liveShareOf = async (tx: Tx, planId: string): Promise<ShareRow | null> => {
  const [row] = await tx
    .select()
    .from(planShares)
    .where(and(eq(planShares.planId, planId), isNull(planShares.revokedAt)))
    .limit(1);
  return row ?? null;
};

async function revoke(tx: Tx, shareId: string) {
  await tx.update(planShares).set({ revokedAt: new Date() }).where(eq(planShares.id, shareId));
}

/** The session's link, for someone who may manage it. Null when it is not shared (or the link has expired). */
export async function getShareStatus(
  actor: Actor,
  sportKey: string,
  planId: string,
): Promise<ShareStatusDto> {
  return tenantTx(actor, async (tx) => {
    const plan = await loadPlan(tx, sportKey, planId);
    if (!plan || !can(actor, "plan:share", resourceOf(plan))) return { active: false };
    const live = await liveShareOf(tx, plan.id);
    return live && isLive(live) ? toStatus(actor, live) : { active: false };
  });
}

/** Make the session's link (or return the one that is live: creating twice never makes two). */
export async function createShare(
  actor: Actor,
  sportKey: string,
  planId: string,
  expiresInDays: ShareExpiry = null,
): Promise<Result<ShareStatusDto>> {
  return inTx(actor, async (tx) => {
    const plan = await loadPlan(tx, sportKey, planId);
    if (!plan) return fail("NOT_FOUND");
    if (!can(actor, "plan:share", resourceOf(plan)) || plan.status === "archived")
      return fail("FORBIDDEN");
    const live = await liveShareOf(tx, plan.id);
    if (live && isLive(live)) return ok(toStatus(actor, live));
    if (live) await revoke(tx, live.id); // an expired link makes way for a new one
    return ok(await insertShare(tx, actor, plan, expiresInDays, "share.created"));
  });
}

/** A new link; the old one stops working at once. */
export async function regenerateShare(
  actor: Actor,
  sportKey: string,
  planId: string,
  expiresInDays: ShareExpiry = null,
): Promise<Result<ShareStatusDto>> {
  return inTx(actor, async (tx) => {
    const plan = await loadPlan(tx, sportKey, planId);
    if (!plan) return fail("NOT_FOUND");
    if (!can(actor, "plan:share", resourceOf(plan)) || plan.status === "archived")
      return fail("FORBIDDEN");
    const live = await liveShareOf(tx, plan.id);
    if (live) await revoke(tx, live.id);
    return ok(await insertShare(tx, actor, plan, expiresInDays, "share.regenerated"));
  });
}

/** Stop sharing: the link stops working. Doing it twice is fine. */
export async function revokeShare(
  actor: Actor,
  sportKey: string,
  planId: string,
): Promise<Result<ShareStatusDto>> {
  return inTx(actor, async (tx) => {
    const plan = await loadPlan(tx, sportKey, planId);
    if (!plan) return fail("NOT_FOUND");
    if (!can(actor, "plan:share", resourceOf(plan))) return fail("FORBIDDEN");
    const live = await liveShareOf(tx, plan.id);
    if (live) {
      await revoke(tx, live.id);
      await recordAuditInTx(tx, actor, {
        action: "share.revoked",
        entityType: "plan",
        entityId: plan.id,
        metadata: { sport: plan.sportKey },
      });
    }
    return ok({ active: false } as ShareStatusDto);
  });
}

async function insertShare(
  tx: Tx,
  actor: Actor,
  plan: { id: string; organizationId: string; sportKey: string },
  expiresInDays: ShareExpiry,
  action: "share.created" | "share.regenerated",
): Promise<ShareStatusDto> {
  const id = newId();
  const now = new Date();
  const [row] = await tx
    .insert(planShares)
    .values({
      id,
      planId: plan.id,
      organizationId: plan.organizationId,
      createdBy: actor.userId,
      createdAt: now,
      expiresAt: expiresInDays ? new Date(now.getTime() + expiresInDays * DAY) : null,
    })
    .returning();
  await recordAuditInTx(tx, actor, {
    action,
    entityType: "plan",
    entityId: plan.id,
    metadata: { sport: plan.sportKey, expiresInDays },
  });
  return toStatus(actor, row!);
}
