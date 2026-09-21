import "server-only";
import type { ConversationSummaryDto, MessageDto } from "./dto";
import type { ConversationDto, StoredMessage } from "./store";

export const toMessageDto = (m: StoredMessage): MessageDto => ({
  id: m.id,
  role: m.role,
  content: m.content,
  createdAt: m.createdAt.toISOString(),
});

export const toConversationDto = (c: ConversationDto): ConversationSummaryDto => ({
  id: c.id,
  title: c.title,
  planId: c.planId,
  updatedAt: c.updatedAt.toISOString(),
});
