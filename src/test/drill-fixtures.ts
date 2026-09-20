import { expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { member, organization } from "@/db/schema";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import type { Actor, MembershipRole } from "@/lib/authz/can";
import { drillInputSchema, type DrillInput, type DrillInputRaw } from "@/modules/drills/validators";
import { createTestActor } from "./factories";

/** A minimal but fully valid basketball drill for tests. */
export function drillInput(over: Partial<DrillInputRaw> = {}): DrillInput {
  const raw: DrillInputRaw = {
    title: "Test Passing Drill",
    description: "A short drill used by the automated tests to check that saving works end to end.",
    category: "passing",
    primarySkill: "passing",
    secondarySkills: ["catching"],
    level: "beginner",
    ageMin: 9,
    ageMax: 14,
    playersMin: 2,
    playersMax: 10,
    durationMin: 5,
    durationMax: 10,
    space: "half_court",
    tags: ["test", "passing"],
    equipment: [{ type: "basketball", rule: "per_pair", quantity: 1 }],
    content: {
      objective: "Pass accurately to a partner.",
      setup: "Pairs face each other four metres apart with one ball.",
      instructions: ["Chest pass to your partner.", "Catch with two hands."],
      coachingPoints: ["Step into the pass."],
    },
    diagrams: [
      {
        title: "Pair passing",
        diagram: {
          schemaVersion: 1,
          sport: "basketball",
          court: { type: "half", variant: "fiba" },
          entities: [
            { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "left_slot" } },
            { id: "o2", type: "player", side: "offense", label: "2", at: { anchor: "right_slot" } },
            { id: "b1", type: "ball", heldBy: "o1" },
          ],
          actions: [{ id: "a1", step: 1, type: "pass", from: "o1", to: "o2" }],
        },
      },
    ],
    ...over,
  };
  return drillInputSchema.parse(raw);
}

/** A club-type organization (multi-member) with the given members, for org-visibility and role tests. */
export async function createClub(
  owner: Actor,
  members: Array<{ role: MembershipRole; name: string }> = [],
) {
  const orgId = newId();
  await db
    .insert(organization)
    .values({ id: orgId, name: "Test Club", slug: `club-${orgId}`, type: "club" });
  await db
    .insert(member)
    .values({ id: newId(), organizationId: orgId, userId: owner.userId, role: "owner" });
  const actors: Actor[] = [];
  for (const m of members) {
    const a = await createTestActor(m.name);
    await db
      .insert(member)
      .values({ id: newId(), organizationId: orgId, userId: a.userId, role: m.role });
    actors.push({ ...a, organizationId: orgId, role: m.role });
  }
  return {
    orgId,
    ownerActor: { ...owner, organizationId: orgId, role: "owner" as const },
    members: actors,
  };
}

export async function membershipRole(userId: string, orgId: string) {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)));
  return row?.role;
}

/** Connection as the OWNER role, for assertions and setup the runtime role is (deliberately) not allowed to do. */
export function ownerPool() {
  return new Pool({ connectionString: process.env.DATABASE_OWNER_URL, max: 1 });
}

/** Drizzle wraps driver errors ("Failed query: …"); the real Postgres message is on `cause`. */
export async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as { message: string; cause?: { message?: string } },
  );
  expect(err, "expected the database to reject this statement").not.toBeNull();
  expect(`${err?.cause?.message ?? ""} ${err?.message ?? ""}`).toMatch(pattern);
}
