import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import {
  AiFailure,
  type AiMessage,
  type AiProvider,
  type Completion,
  type CompletionRequest,
  type ContentBlock,
  type StopReason,
} from "./provider";

/**
 * The Anthropic adapter: the official SDK, streamed under the hood (so a long answer never trips an HTTP timeout) and
 * collected into one message. It maps between this app's neutral blocks and the SDK's, and turns every failure into an
 * `AiFailure` the engine understands. Nothing here decides what the assistant may do.
 */

const toParam = (m: AiMessage): Anthropic.MessageParam => ({
  role: m.role,
  content: m.content.map((b): Anthropic.ContentBlockParam => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
    return {
      type: "tool_result",
      tool_use_id: b.toolUseId,
      content: b.content,
      ...(b.isError ? { is_error: true } : {}),
    };
  }),
});

const stopOf = (r: Anthropic.Message["stop_reason"]): StopReason =>
  r === "end_turn" || r === "tool_use" || r === "max_tokens" || r === "refusal" ? r : "other";

export function createAnthropicProvider(
  apiKey: string,
  /** Tests give it a fake network; production never passes this. */
  options: { fetch?: typeof fetch; baseURL?: string } = {},
): AiProvider {
  const client = new Anthropic({
    apiKey,
    timeout: env.AI_TIMEOUT_MS,
    maxRetries: options.fetch ? 0 : 1,
    ...options,
  });
  return {
    id: "anthropic",
    async complete(req: CompletionRequest): Promise<Completion> {
      try {
        const stream = client.messages.stream(
          {
            model: env.AI_MODEL,
            max_tokens: Math.min(req.maxTokens, env.AI_MAX_OUTPUT_TOKENS),
            system: req.system,
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
            })),
            tool_choice: { type: "auto" },
            // the tools and the stable start of the conversation are re-sent every round: let the API cache them
            cache_control: { type: "ephemeral" },
            output_config: { effort: "medium" },
            messages: req.messages.map(toParam),
          },
          { signal: req.signal },
        );
        const message = await stream.finalMessage();
        const content: ContentBlock[] = [];
        for (const b of message.content) {
          if (b.type === "text") content.push({ type: "text", text: b.text });
          else if (b.type === "tool_use")
            content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
          // thinking blocks are not shown and not replayed: each request stands on its own
        }
        return {
          content,
          stopReason: stopOf(message.stop_reason),
          usage: {
            inputTokens:
              message.usage.input_tokens +
              (message.usage.cache_read_input_tokens ?? 0) +
              (message.usage.cache_creation_input_tokens ?? 0),
            outputTokens: message.usage.output_tokens,
          },
        };
      } catch (err) {
        if (req.signal?.aborted) throw new AiFailure("cancelled", "cancelled");
        if (err instanceof Anthropic.RateLimitError)
          throw new AiFailure("rate_limited", err.message);
        if (err instanceof Anthropic.APIConnectionTimeoutError)
          throw new AiFailure("timeout", err.message);
        if (
          err instanceof Anthropic.AuthenticationError ||
          err instanceof Anthropic.PermissionDeniedError
        )
          throw new AiFailure("unavailable", `provider refused the credentials (${err.status})`);
        if (err instanceof Anthropic.APIError)
          throw new AiFailure("failed", `provider error ${err.status}`);
        throw new AiFailure("failed", err instanceof Error ? err.message : "unknown");
      }
    },
  };
}
