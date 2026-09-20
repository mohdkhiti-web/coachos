import { db } from "@/lib/db/client";
import { user } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Actor } from "@/lib/authz/can";
import { ensureAccountFoundation } from "@/modules/organizations";

/** Creates a real user + personal organization + profile through the same code path sign-up uses. */
export async function createTestActor(name = "Test Coach"): Promise<Actor> {
  const userId = newId();
  await db
    .insert(user)
    .values({ id: userId, name, email: `${userId}@example.test`, emailVerified: true });
  const ws = await ensureAccountFoundation(userId);
  return {
    userId,
    organizationId: ws.organizationId,
    role: ws.role,
    platformRole: "user",
    sessionId: newId(),
  };
}
