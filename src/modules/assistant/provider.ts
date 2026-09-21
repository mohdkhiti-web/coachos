/**
 * The AI provider PORT (Step 8). The assistant talks to a language model only through this small interface, so the model is
 * replaceable: one adapter is built (Anthropic), another is a matter of writing `complete` for its API. Nothing in the
 * assistant knows which provider it is using, and nothing a provider returns is trusted — it is text and tool requests that
 * the server validates, exactly like anything a browser sends.
 */

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface AiMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

/** A tool the model may ask for: a name, when to use it, and the JSON Schema of its input. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface CompletionRequest {
  system: string;
  messages: AiMessage[];
  tools: ToolSpec[];
  maxTokens: number;
  /** Aborted when the person cancels or leaves: the provider must stop and free what it holds. */
  signal?: AbortSignal;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface Completion {
  content: ContentBlock[];
  stopReason: StopReason;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiProvider {
  /** "anthropic", "scripted"… — recorded in logs and shown nowhere as a claim about quality. */
  readonly id: string;
  complete(request: CompletionRequest): Promise<Completion>;
}

/** The provider could not answer (network, quota, refusal at the API…). The message is for logs, never shown as such. */
export class AiFailure extends Error {
  constructor(
    readonly kind: "unavailable" | "timeout" | "rate_limited" | "cancelled" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "AiFailure";
  }
}
