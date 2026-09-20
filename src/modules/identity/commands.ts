import "server-only";
import { eq, sql } from "drizzle-orm";
import { profiles, user } from "@/db/schema";
import type { Units } from "@/db/enums";
import { tenantTx } from "@/lib/db/tx";
import { can, type Actor } from "@/lib/authz/can";
import { AppError } from "@/lib/errors";
import { recordAuditInTx } from "@/modules/audit";

/**
 * WRITE side of the identity module. Every function: authorize (`can`) → transaction → audit,
 * with the audit row committed in the same transaction as the change (§3.3, §19.4).
 * Inputs are already Zod-validated by the calling Server Action.
 */

function assertCanUpdateOwnProfile(actor: Actor) {
  if (!can(actor, "profile:update", { userId: actor.userId })) throw new AppError("FORBIDDEN");
}

export async function completeOnboarding(
  actor: Actor,
  input: { name: string; profession: "coach" | "pe_teacher" | "both"; timezone: string },
): Promise<void> {
  assertCanUpdateOwnProfile(actor);
  await tenantTx(actor, async (tx) => {
    await tx
      .update(user)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(user.id, actor.userId));
    await tx
      .update(profiles)
      .set({
        profession: input.profession,
        timezone: input.timezone,
        onboardingCompletedAt: sql`coalesce(${profiles.onboardingCompletedAt}, now())`,
        updatedAt: new Date(),
        version: sql`${profiles.version} + 1`,
      })
      .where(eq(profiles.userId, actor.userId));
    await recordAuditInTx(tx, actor, { action: "account.onboarded" });
  });
}

export async function updateProfile(
  actor: Actor,
  input: { name: string; profession: "coach" | "pe_teacher" | "both"; timezone: string },
): Promise<void> {
  assertCanUpdateOwnProfile(actor);
  await tenantTx(actor, async (tx) => {
    await tx
      .update(user)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(user.id, actor.userId));
    await tx
      .update(profiles)
      .set({
        profession: input.profession,
        timezone: input.timezone,
        updatedAt: new Date(),
        version: sql`${profiles.version} + 1`,
      })
      .where(eq(profiles.userId, actor.userId));
    await recordAuditInTx(tx, actor, { action: "account.profile_updated" });
  });
}

export async function updatePreferences(actor: Actor, input: { units: Units }): Promise<void> {
  assertCanUpdateOwnProfile(actor);
  await tenantTx(actor, async (tx) => {
    await tx
      .update(profiles)
      .set({
        units: input.units,
        preferencesReviewedAt: sql`coalesce(${profiles.preferencesReviewedAt}, now())`,
        updatedAt: new Date(),
        version: sql`${profiles.version} + 1`,
      })
      .where(eq(profiles.userId, actor.userId));
    await recordAuditInTx(tx, actor, {
      action: "account.preferences_updated",
      metadata: { units: input.units },
    });
  });
}
