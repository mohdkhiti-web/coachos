import "server-only";
import { eq, sql } from "drizzle-orm";
import { profiles, user } from "@/db/schema";
import type { Units } from "@/db/enums";
import { tenantTx } from "@/lib/db/tx";
import { can, type Actor } from "@/lib/authz/can";
import { AppError } from "@/lib/errors";
import { recordAuditInTx } from "@/modules/audit";
import type { CoachingProfileInput } from "./validators";

/**
 * WRITE side of the identity module. Every function: authorize (`can`) → transaction → audit,
 * with the audit row committed in the same transaction as the change (§3.3, §19.4).
 * Inputs are already Zod-validated by the calling Server Action.
 */

function assertCanUpdateOwnProfile(actor: Actor) {
  if (!can(actor, "profile:update", { userId: actor.userId })) throw new AppError("FORBIDDEN");
}

type CoachingInput = CoachingProfileInput;

const coachingColumns = (c: CoachingInput) => ({
  coachingExperience: c.coachingExperience,
  ageGroups: c.ageGroups,
  typicalPlayers: c.typicalPlayers,
  priorities: c.priorities,
  needs: c.needs,
  coachingStyles: c.coachingStyles,
});

/**
 * Finish onboarding: the six basketball answers are saved WITH the timezone and the completion stamps, in one
 * transaction, so a coach is never "onboarded" without the answers they just gave. This product is for basketball
 * coaches, so a profession that was never chosen is recorded as "coach" (Settings can still change it).
 */
export async function completeCoachOnboarding(
  actor: Actor,
  input: { coaching: CoachingInput; timezone: string; name?: string },
): Promise<void> {
  assertCanUpdateOwnProfile(actor);
  await tenantTx(actor, async (tx) => {
    if (input.name) {
      await tx
        .update(user)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(user.id, actor.userId));
    }
    await tx
      .update(profiles)
      .set({
        ...coachingColumns(input.coaching),
        profession: sql`coalesce(${profiles.profession}, 'coach')`,
        timezone: input.timezone,
        onboardingCompletedAt: sql`coalesce(${profiles.onboardingCompletedAt}, now())`,
        coachingProfileCompletedAt: sql`coalesce(${profiles.coachingProfileCompletedAt}, now())`,
        updatedAt: new Date(),
        version: sql`${profiles.version} + 1`,
      })
      .where(eq(profiles.userId, actor.userId));
    await recordAuditInTx(tx, actor, { action: "account.onboarded" });
  });
}

/**
 * Skip onboarding: the coach gets into the app with a minimal profile (timezone + profession only). The coaching
 * profile stays empty and its completion stamp stays null — which is exactly what makes the dashboard keep offering it.
 */
export async function skipOnboarding(
  actor: Actor,
  input: { timezone: string; name?: string },
): Promise<void> {
  assertCanUpdateOwnProfile(actor);
  await tenantTx(actor, async (tx) => {
    if (input.name) {
      await tx
        .update(user)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(user.id, actor.userId));
    }
    await tx
      .update(profiles)
      .set({
        profession: sql`coalesce(${profiles.profession}, 'coach')`,
        timezone: input.timezone,
        onboardingCompletedAt: sql`coalesce(${profiles.onboardingCompletedAt}, now())`,
        updatedAt: new Date(),
        version: sql`${profiles.version} + 1`,
      })
      .where(eq(profiles.userId, actor.userId));
    await recordAuditInTx(tx, actor, { action: "account.onboarding_skipped" });
  });
}

/** Settings → Coaching profile: replace the six answers (and stamp completion the first time they are all given). */
export async function saveCoachingProfile(actor: Actor, input: CoachingInput): Promise<void> {
  assertCanUpdateOwnProfile(actor);
  await tenantTx(actor, async (tx) => {
    await tx
      .update(profiles)
      .set({
        ...coachingColumns(input),
        coachingProfileCompletedAt: sql`coalesce(${profiles.coachingProfileCompletedAt}, now())`,
        updatedAt: new Date(),
        version: sql`${profiles.version} + 1`,
      })
      .where(eq(profiles.userId, actor.userId));
    await recordAuditInTx(tx, actor, { action: "account.coaching_profile_updated" });
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
