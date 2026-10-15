import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { profiles } from "@/db/schema";
import { pool } from "@/lib/db/client";
import { userTx } from "@/lib/db/tx";
import { listOwnActivity } from "@/modules/audit";
import { createTestActor } from "@/test/factories";
import { completeCoachOnboarding, saveCoachingProfile, skipOnboarding } from "./commands";
import { coachingProfileSchema } from "./validators";

afterAll(async () => {
  await pool.end();
});

const answers = coachingProfileSchema.parse({
  coachingExperience: "developing",
  ageGroups: ["u14"],
  typicalPlayers: 12,
  priorities: ["shooting", "ball_handling", "defense"],
  needs: ["practice_planning", "ai_coaching"],
  coachingStyles: ["skill_development", "balanced"],
});

const profileOf = (userId: string) =>
  userTx(userId, (tx) => tx.select().from(profiles).where(eq(profiles.userId, userId))).then(
    (rows) => rows[0]!,
  );

describe("basketball onboarding persistence (real database)", () => {
  it("saves all six answers with the timezone and the completion stamps", async () => {
    const actor = await createTestActor("Dana Coach");
    expect((await profileOf(actor.userId)).onboardingCompletedAt).toBeNull();

    await completeCoachOnboarding(actor, { coaching: answers, timezone: "Asia/Dubai" });

    const p = await profileOf(actor.userId);
    expect(p).toMatchObject({
      coachingExperience: "developing",
      ageGroups: ["u14"],
      typicalPlayers: 12,
      priorities: ["shooting", "ball_handling", "defense"],
      needs: ["practice_planning", "ai_coaching"],
      coachingStyles: ["skill_development", "balanced"],
      timezone: "Asia/Dubai",
      profession: "coach",
    });
    expect(p.onboardingCompletedAt).not.toBeNull();
    expect(p.coachingProfileCompletedAt).not.toBeNull();

    const audit = await listOwnActivity(actor, 10);
    expect(audit.filter((e) => e.action === "account.onboarded")).toHaveLength(1);
  });

  it("skipping unlocks the app with a minimal profile and leaves the coaching profile empty", async () => {
    const actor = await createTestActor("Sam Skipper");
    await skipOnboarding(actor, { timezone: "Europe/Paris" });

    const p = await profileOf(actor.userId);
    expect(p.onboardingCompletedAt).not.toBeNull();
    expect(p.timezone).toBe("Europe/Paris");
    expect(p.profession).toBe("coach");
    expect(p.coachingProfileCompletedAt).toBeNull();
    expect(p.coachingExperience).toBeNull();
    expect(p.priorities).toEqual([]);
    expect(p.ageGroups).toEqual([]);
  });

  it("a skipped coach can fill the profile in later (Settings) and it is stamped complete then", async () => {
    const actor = await createTestActor("Lee Later");
    await skipOnboarding(actor, { timezone: "UTC" });
    await saveCoachingProfile(actor, answers);
    const p = await profileOf(actor.userId);
    expect(p.coachingProfileCompletedAt).not.toBeNull();
    expect(p.priorities).toEqual(["shooting", "ball_handling", "defense"]);
  });

  it("editing keeps the first completion time and replaces the answers", async () => {
    const actor = await createTestActor("Eddie Edit");
    await completeCoachOnboarding(actor, { coaching: answers, timezone: "UTC" });
    const first = (await profileOf(actor.userId)).coachingProfileCompletedAt;

    await saveCoachingProfile(actor, {
      ...answers,
      priorities: ["rebounding"],
      typicalPlayers: 10,
    });
    const p = await profileOf(actor.userId);
    expect(p.priorities).toEqual(["rebounding"]);
    expect(p.typicalPlayers).toBe(10);
    expect(p.coachingProfileCompletedAt).toEqual(first);
  });

  it("the database itself refuses values outside the allowed sets", async () => {
    const actor = await createTestActor("Val Idator");
    await expect(
      userTx(actor.userId, (tx) =>
        tx
          .update(profiles)
          .set({ priorities: ["not_a_priority"] })
          .where(eq(profiles.userId, actor.userId)),
      ),
    ).rejects.toThrow();
    await expect(
      userTx(actor.userId, (tx) =>
        tx.update(profiles).set({ typicalPlayers: 999 }).where(eq(profiles.userId, actor.userId)),
      ),
    ).rejects.toThrow();
  });

  it("one coach cannot read or change another coach's profile (row-level security)", async () => {
    const a = await createTestActor("Alpha");
    const b = await createTestActor("Bravo");
    await completeCoachOnboarding(a, { coaching: answers, timezone: "UTC" });

    const seenByB = await userTx(b.userId, (tx) =>
      tx.select().from(profiles).where(eq(profiles.userId, a.userId)),
    );
    expect(seenByB).toHaveLength(0);
    const changed = await userTx(b.userId, (tx) =>
      tx
        .update(profiles)
        .set({ typicalPlayers: 5 })
        .where(eq(profiles.userId, a.userId))
        .returning({ id: profiles.userId }),
    );
    expect(changed).toHaveLength(0);
    expect((await profileOf(a.userId)).typicalPlayers).toBe(12);
  });
});
