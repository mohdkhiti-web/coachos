import { describe, expect, it } from "vitest";
import { createAnthropicProvider } from "./anthropic";
import { AiFailure, type CompletionRequest } from "./provider";

/**
 * The Anthropic adapter against a FAKE network (no key, no call ever leaves the machine): that it sends what the port
 * describes, reads a streamed answer — text and tool requests — back into neutral blocks, and turns every failure into an
 * `AiFailure` the engine understands.
 */

const sse = (events: Array<{ event: string; data: unknown }>) =>
  events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");

const stream = (
  blocks: Array<Record<string, unknown>>,
  stop: string,
  usage = { input_tokens: 120, output_tokens: 30 },
) =>
  sse([
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "m",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { ...usage, output_tokens: 1 },
        },
      },
    },
    ...blocks.flatMap((block, index) => {
      const start =
        block.type === "text"
          ? { type: "text", text: "" }
          : { type: "tool_use", id: block.id, name: block.name, input: {} };
      const delta =
        block.type === "text"
          ? { type: "text_delta", text: block.text }
          : { type: "input_json_delta", partial_json: JSON.stringify(block.input) };
      return [
        {
          event: "content_block_start",
          data: { type: "content_block_start", index, content_block: start },
        },
        { event: "content_block_delta", data: { type: "content_block_delta", index, delta } },
        { event: "content_block_stop", data: { type: "content_block_stop", index } },
      ];
    }),
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: stop, stop_sequence: null },
        usage: { output_tokens: usage.output_tokens },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ]);

const respond = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": status === 200 ? "text/event-stream" : "application/json" },
  });

const request: CompletionRequest = {
  system: "You are a test.",
  messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
  tools: [
    {
      name: "get_objectives",
      description: "List objectives",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  maxTokens: 1000,
};

describe("the Anthropic adapter", () => {
  it("sends the system prompt, the tools and the messages, and reads text and tool requests back", async () => {
    let sent: Record<string, unknown> = {};
    const provider = createAnthropicProvider("sk-ant-test-key", {
      fetch: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return respond(
          stream(
            [
              { type: "text", text: "Let me look." },
              { type: "tool_use", id: "toolu_1", name: "get_objectives", input: { a: 1 } },
            ],
            "tool_use",
          ),
        );
      },
    });
    const completion = await provider.complete(request);
    expect(sent).toMatchObject({
      system: "You are a test.",
      stream: true,
      tool_choice: { type: "auto" },
      tools: [{ name: "get_objectives", input_schema: { type: "object" } }],
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    expect(completion.stopReason).toBe("tool_use");
    expect(completion.content).toEqual([
      { type: "text", text: "Let me look." },
      { type: "tool_use", id: "toolu_1", name: "get_objectives", input: { a: 1 } },
    ]);
    expect(completion.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
  });

  it("sends tool results back as tool_result blocks and never sends thinking or system text of its own", async () => {
    let sent: { messages: Array<{ role: string; content: Array<Record<string, unknown>> }> } = {
      messages: [],
    };
    const provider = createAnthropicProvider("sk-ant-test-key", {
      fetch: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return respond(stream([{ type: "text", text: "Done." }], "end_turn"));
      },
    });
    const completion = await provider.complete({
      ...request,
      messages: [
        ...request.messages,
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "toolu_1", name: "get_objectives", input: {} }],
        },
        {
          role: "user",
          content: [{ type: "tool_result", toolUseId: "toolu_1", content: "{}", isError: true }],
        },
      ],
    });
    expect(completion.stopReason).toBe("end_turn");
    expect(sent.messages[2]!.content[0]).toEqual({
      type: "tool_result",
      tool_use_id: "toolu_1",
      content: "{}",
      is_error: true,
    });
  });

  it("reports a refusal as a stop reason, not as text", async () => {
    const provider = createAnthropicProvider("sk-ant-test-key", {
      fetch: async () => respond(stream([], "refusal")),
    });
    expect((await provider.complete(request)).stopReason).toBe("refusal");
  });

  it("maps failures: bad credentials, rate limits, server errors, cancelling", async () => {
    const failing = (status: number) =>
      createAnthropicProvider("sk-ant-test-key", {
        fetch: async () =>
          respond(
            JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } }),
            status,
          ),
      });
    await expect(failing(401).complete(request)).rejects.toMatchObject({
      name: "AiFailure",
      kind: "unavailable",
    });
    await expect(failing(429).complete(request)).rejects.toMatchObject({ kind: "rate_limited" });
    await expect(failing(500).complete(request)).rejects.toMatchObject({ kind: "failed" });

    const controller = new AbortController();
    const slow = createAnthropicProvider("sk-ant-test-key", {
      fetch: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    });
    const running = slow.complete({ ...request, signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(running).rejects.toBeInstanceOf(AiFailure);
    await expect(running).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("never puts the key in an error", async () => {
    const provider = createAnthropicProvider("sk-ant-secret-secret-key", {
      fetch: async () =>
        respond(
          JSON.stringify({
            type: "error",
            error: { type: "authentication_error", message: "invalid x-api-key" },
          }),
          401,
        ),
    });
    const err = await provider.complete(request).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain("sk-ant-secret");
  });
});
