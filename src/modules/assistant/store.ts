import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { assistantConversations, assistantMessages, assistantUsage } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { tenantTx } from "@/lib/db/tx";
import { isUuid, newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { messageContentSchema, type MessageContent } from "./proposals";

/**
 * The assistant's memory: conversations, their messages and a person's daily usage. Everything runs inside `tenantTx` as
 * the person asking, and row-level security lets a person see only their own rows — so nothing here filters by owner for
 * safety (it does for clarity). A stored message that no longer parses is skipped and logged, never shown half-understood.
 */

export interface ConversationDto {
  id: string;
  sportKey: string;
  planId: string | null;
  title: string;
  updatedAt: Date;
}

export interface StoredMessage {
  id: string;
  seq: number;
  role: "user" | "assistant";
  content: MessageContent;
  createdAt: Date;
}

const MAX_MESSAGES_PER_CONVERSATION = 80;
export { MAX_MESSAGES_PER_CONVERSATION };

const dto = (r: typeof assistantConversations.$inferSelect): ConversationDto => ({
  id: r.id,
  sportKey: r.sportKey,
  planId: r.planId,
  title: r.title,
  updatedAt: r.updatedAt,
});

export async function createConversation(
  actor: Actor,
  input: { sportKey: string; planId: string | null; title: string },
): Promise<ConversationDto> {
  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .insert(assistantConversations)
      .values({
        id: newId(),
        organizationId: actor.organizationId,
        userId: actor.userId,
        sportKey: input.sportKey,
        planId: input.planId,
        title: input.title.slice(0, 120),
      })
      .returning();
    return dto(row!);
  });
}

export async function getConversation(actor: Actor, id: string): Promise<ConversationDto | null> {
  if (!isUuid(id)) return null;
  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .select()
      .from(assistantConversations)
      .where(and(eq(assistantConversations.id, id), isNull(assistantConversations.deletedAt)))
      .limit(1);
    return row ? dto(row) : null;
  });
}

export async function listConversations(
  actor: Actor,
  sportKey: string,
  limit = 30,
): Promise<ConversationDto[]> {
  return tenantTx(actor, async (tx) => {
    const rows = await tx
      .select()
      .from(assistantConversations)
      .where(
        and(
          eq(assistantConversations.sportKey, sportKey),
          isNull(assistantConversations.deletedAt),
        ),
      )
      .orderBy(desc(assistantConversations.updatedAt))
      .limit(limit);
    return rows.map(dto);
  });
}

export async function deleteConversation(actor: Actor, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return tenantTx(actor, async (tx) => {
    const rows = await tx
      .update(assistantConversations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(assistantConversations.id, id), isNull(assistantConversations.deletedAt)))
      .returning({ id: assistantConversations.id });
    return rows.length > 0;
  });
}

function parseRow(r: typeof assistantMessages.$inferSelect): StoredMessage | null {
  const parsed = messageContentSchema.safeParse(r.content);
  if (!parsed.success) {
    logger.warn({ messageId: r.id }, "assistant.stored_message_invalid");
    return null;
  }
  return {
    id: r.id,
    seq: r.seq,
    role: r.role as "user" | "assistant",
    content: parsed.data,
    createdAt: r.createdAt,
  };
}

export async function listMessages(actor: Actor, conversationId: string): Promise<StoredMessage[]> {
  if (!isUuid(conversationId)) return [];
  return tenantTx(actor, async (tx) => {
    const rows = await tx
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.conversationId, conversationId))
      .orderBy(asc(assistantMessages.seq))
      .limit(MAX_MESSAGES_PER_CONVERSATION + 5);
    return rows.map(parseRow).filter((m): m is StoredMessage => m !== null);
  });
}

export async function getMessage(
  actor: Actor,
  id: string,
): Promise<(StoredMessage & { conversationId: string }) | null> {
  if (!isUuid(id)) return null;
  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.id, id))
      .limit(1);
    const m = row ? parseRow(row) : null;
    return m && row ? { ...m, conversationId: row.conversationId } : null;
  });
}

export async function appendMessage(
  actor: Actor,
  conversationId: string,
  role: "user" | "assistant",
  content: MessageContent,
): Promise<StoredMessage | null> {
  const checked = messageContentSchema.parse(content);
  return tenantTx(actor, async (tx) => {
    const [last] = await tx
      .select({ seq: sql<number>`coalesce(max(${assistantMessages.seq}), 0)::int` })
      .from(assistantMessages)
      .where(eq(assistantMessages.conversationId, conversationId));
    const [row] = await tx
      .insert(assistantMessages)
      .values({
        id: newId(),
        conversationId,
        organizationId: actor.organizationId,
        userId: actor.userId,
        seq: (last?.seq ?? 0) + 1,
        role,
        content: checked,
      })
      .returning();
    await tx
      .update(assistantConversations)
      .set({ updatedAt: new Date() })
      .where(eq(assistantConversations.id, conversationId));
    return row ? parseRow(row) : null;
  });
}

export async function updateMessageContent(
  actor: Actor,
  id: string,
  content: MessageContent,
): Promise<void> {
  const checked = messageContentSchema.parse(content);
  await tenantTx(actor, async (tx) => {
    await tx
      .update(assistantMessages)
      .set({ content: checked })
      .where(eq(assistantMessages.id, id));
  });
}

// ---- usage -----------------------------------------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

export async function usageToday(
  actor: Actor,
): Promise<{ messages: number; inputTokens: number; outputTokens: number }> {
  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .select()
      .from(assistantUsage)
      .where(and(eq(assistantUsage.userId, actor.userId), eq(assistantUsage.day, today())))
      .limit(1);
    return {
      messages: row?.messages ?? 0,
      inputTokens: row?.inputTokens ?? 0,
      outputTokens: row?.outputTokens ?? 0,
    };
  });
}

export async function addUsage(
  actor: Actor,
  add: { messages: number; inputTokens: number; outputTokens: number },
): Promise<void> {
  await tenantTx(actor, async (tx) => {
    await tx
      .insert(assistantUsage)
      .values({
        userId: actor.userId,
        organizationId: actor.organizationId,
        day: today(),
        messages: add.messages,
        inputTokens: add.inputTokens,
        outputTokens: add.outputTokens,
      })
      .onConflictDoUpdate({
        target: [assistantUsage.userId, assistantUsage.day],
        set: {
          messages: sql`${assistantUsage.messages} + ${add.messages}`,
          inputTokens: sql`${assistantUsage.inputTokens} + ${add.inputTokens}`,
          outputTokens: sql`${assistantUsage.outputTokens} + ${add.outputTokens}`,
        },
      });
  });
}
