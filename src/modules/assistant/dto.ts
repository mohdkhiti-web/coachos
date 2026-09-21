import type { MessageContent } from "./proposals";

/**
 * What crosses from the assistant's server side to the chat screen: plain data only (pure and client-safe). A message
 * keeps its validated content exactly as stored (text, proposals, the drills it is based on) — the screen renders it, it
 * never interprets it.
 */
export interface MessageDto {
  id: string;
  role: "user" | "assistant";
  content: MessageContent;
  createdAt: string;
}

export interface ConversationSummaryDto {
  id: string;
  title: string;
  planId: string | null;
  updatedAt: string;
}

/** One line of the stream the message route sends: progress while it works, then the answer (or why there is none). */
export type StreamEvent =
  | { type: "status"; phase: "thinking" | "tool"; tool?: string }
  | { type: "done"; conversation: ConversationSummaryDto; user: MessageDto; assistant: MessageDto }
  | { type: "error"; code: string; values?: Record<string, string> };
