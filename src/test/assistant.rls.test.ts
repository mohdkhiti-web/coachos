import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { assistantConversations, assistantMessages, assistantUsage } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import { createClub } from "./drill-fixtures";
import { createTestActor } from "./factories";
import { makePlan } from "./plan-fixtures";

/**
 * The database's own refusals for the assistant's memory, with no application code in between: a conversation, its messages and
 * a person's usage belong to one person in one workspace — not readable, writable or movable by anyone else, colleague, owner
 * or outsider.
 */

let owner: Actor;
let ann: Actor;
let bob: Actor;
let outsider: Actor;
let conversationId: string;
let messageId: string;

const content = { schemaVersion: 1, text: "hello", proposals: [], sources: [] };
const refused = async (run: () => Promise<unknown>, pattern: RegExp) => {
  const err = await run().then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the database to refuse").not.toBeNull();
  const text = (e: unknown): string =>
    e instanceof Error ? `${e.message} ${text((e as { cause?: unknown }).cause)}` : String(e ?? "");
  expect(text(err)).toMatch(pattern);
};

beforeAll(async () => {
  const founder = await createTestActor("Assistant RLS Founder");
  const club = await createClub(founder, [
    { role: "coach", name: "Ann" },
    { role: "coach", name: "Bob" },
  ]);
  owner = club.ownerActor;
  [ann, bob] = club.members as [Actor, Actor];
  outsider = await createTestActor("Assistant RLS Outsider");

  conversationId = newId();
  messageId = newId();
  await tenantTx(ann, async (tx) => {
    await tx.insert(assistantConversations).values({
      id: conversationId,
      organizationId: ann.organizationId,
      userId: ann.userId,
      sportKey: "basketball",
      title: "Ann's plan",
    });
    await tx.insert(assistantMessages).values({
      id: messageId,
      conversationId,
      organizationId: ann.organizationId,
      userId: ann.userId,
      seq: 1,
      role: "user",
      content,
    });
    await tx.insert(assistantUsage).values({
      userId: ann.userId,
      organizationId: ann.organizationId,
      day: "2030-01-01",
      messages: 1,
    });
  });
});
afterAll(async () => {
  await pool.end();
});

describe("reading", () => {
  it("lets the person read their own rows", async () => {
    const [c, m, u] = await tenantTx(ann, async (tx) => [
      await tx.select().from(assistantConversations),
      await tx.select().from(assistantMessages),
      await tx.select().from(assistantUsage),
    ]);
    expect(c.map((r) => r.id)).toContain(conversationId);
    expect(m.map((r) => r.id)).toContain(messageId);
    expect(u.length).toBeGreaterThan(0);
  });

  it("shows nothing to a colleague, the workspace owner or an outsider", async () => {
    for (const other of [bob, owner, outsider]) {
      const [c, m, u] = await tenantTx(other, async (tx) => [
        await tx
          .select()
          .from(assistantConversations)
          .where(eq(assistantConversations.id, conversationId)),
        await tx.select().from(assistantMessages).where(eq(assistantMessages.id, messageId)),
        await tx.select().from(assistantUsage).where(eq(assistantUsage.userId, ann.userId)),
      ]);
      expect([c.length, m.length, u.length]).toEqual([0, 0, 0]);
    }
  });
});

describe("writing", () => {
  it("refuses a conversation or message made in someone else's name or workspace", async () => {
    await refused(
      () =>
        tenantTx(bob, (tx) =>
          tx.insert(assistantConversations).values({
            id: newId(),
            organizationId: bob.organizationId,
            userId: ann.userId,
            sportKey: "basketball",
          }),
        ),
      /row-level security|violates/i,
    );
    await refused(
      () =>
        tenantTx(bob, (tx) =>
          tx.insert(assistantConversations).values({
            id: newId(),
            organizationId: outsider.organizationId,
            userId: bob.userId,
            sportKey: "basketball",
          }),
        ),
      /row-level security|violates/i,
    );
    // a message in somebody else's conversation
    await refused(
      () =>
        tenantTx(bob, (tx) =>
          tx.insert(assistantMessages).values({
            id: newId(),
            conversationId,
            organizationId: bob.organizationId,
            userId: bob.userId,
            seq: 2,
            role: "user",
            content,
          }),
        ),
      /row-level security|violates|foreign key/i,
    );
  });

  it("refuses to attach a conversation to a session the person cannot read", async () => {
    const hers = await makePlan(ann, { title: "Ann private session" });
    await refused(
      () =>
        tenantTx(bob, (tx) =>
          tx.insert(assistantConversations).values({
            id: newId(),
            organizationId: bob.organizationId,
            userId: bob.userId,
            sportKey: "basketball",
            planId: hers.id,
          }),
        ),
      /row-level security|violates/i,
    );
  });

  it("does not let anyone change or delete what is not theirs", async () => {
    const changed = await tenantTx(bob, (tx) =>
      tx
        .update(assistantMessages)
        .set({ content: { ...content, text: "tampered" } })
        .where(eq(assistantMessages.id, messageId))
        .returning({ id: assistantMessages.id }),
    );
    expect(changed).toEqual([]);
    await refused(
      () =>
        tenantTx(bob, (tx) =>
          tx.delete(assistantMessages).where(eq(assistantMessages.id, messageId)),
        ),
      /permission denied/i,
    );
    await refused(
      () => tenantTx(ann, (tx) => tx.delete(assistantConversations)),
      /permission denied/i,
    );
  });

  it("freezes ownership, workspace, sport and everything of a message but its content", async () => {
    await refused(
      () =>
        tenantTx(ann, (tx) =>
          tx
            .update(assistantConversations)
            .set({ userId: bob.userId })
            .where(eq(assistantConversations.id, conversationId)),
        ),
      /row-level security|owner, workspace and sport cannot change/i,
    );
    await refused(
      () =>
        tenantTx(ann, (tx) =>
          tx
            .update(assistantConversations)
            .set({ sportKey: "football" })
            .where(eq(assistantConversations.id, conversationId)),
        ),
      /cannot change/i,
    );
    await refused(
      () =>
        tenantTx(ann, (tx) =>
          tx.update(assistantMessages).set({ seq: 9 }).where(eq(assistantMessages.id, messageId)),
        ),
      /only the content of a message can change/i,
    );
    await refused(
      () =>
        tenantTx(ann, (tx) =>
          tx
            .update(assistantMessages)
            .set({ role: "assistant" })
            .where(eq(assistantMessages.id, messageId)),
        ),
      /only the content of a message can change/i,
    );
    // the content itself may change (a proposal's outcome is written back)
    const ok = await tenantTx(ann, (tx) =>
      tx
        .update(assistantMessages)
        .set({ content: { ...content, text: "edited" } })
        .where(eq(assistantMessages.id, messageId))
        .returning({ id: assistantMessages.id }),
    );
    expect(ok).toHaveLength(1);
  });

  it("limits a message to a sane size and a role to user or assistant", async () => {
    await refused(
      () =>
        tenantTx(ann, (tx) =>
          tx.insert(assistantMessages).values({
            id: newId(),
            conversationId,
            organizationId: ann.organizationId,
            userId: ann.userId,
            seq: 3,
            role: "system",
            content,
          }),
        ),
      /assistant_messages_role_chk/,
    );
    await refused(
      () =>
        tenantTx(ann, (tx) =>
          tx.insert(assistantMessages).values({
            id: newId(),
            conversationId,
            organizationId: ann.organizationId,
            userId: ann.userId,
            seq: 4,
            role: "user",
            content: { ...content, text: "x".repeat(300_000) },
          }),
        ),
      /assistant_messages_size_chk/,
    );
  });

  it("refuses usage counters in another person's name, or negative ones", async () => {
    await refused(
      () =>
        tenantTx(bob, (tx) =>
          tx.insert(assistantUsage).values({
            userId: ann.userId,
            organizationId: bob.organizationId,
            day: "2030-01-02",
            messages: 1,
          }),
        ),
      /row-level security|violates/i,
    );
    await refused(
      () =>
        tenantTx(ann, (tx) =>
          tx.insert(assistantUsage).values({
            userId: ann.userId,
            organizationId: ann.organizationId,
            day: "2030-01-03",
            messages: -1,
          }),
        ),
      /assistant_usage_nonneg_chk/,
    );
  });
});
