import { z } from "zod";
import { env } from "@/lib/env";
import { httpStatus } from "@/lib/errors";
import { assistantAvailability, runTurn } from "@/modules/assistant";
import type { StreamEvent } from "@/modules/assistant/dto";
import { toConversationDto, toMessageDto } from "@/modules/assistant/serialize";
import { getViewer } from "@/modules/identity";
import { isSportKey } from "@/sports/registry";

/**
 * POST /api/assistant/message — one turn of the conversation, streamed as lines of JSON (Step 8): progress while the assistant
 * works ("thinking", "searching drills…"), then the answer. It is a route rather than a Server Action so that closing the
 * page or pressing Cancel really stops the work (the request's abort signal reaches the model call).
 *
 * Authentication is the database-backed session; the request must come from this app's own origin; the body is small and
 * strictly validated. Everything else — who may use it, how often, what the model sees — is `runTurn`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024;
const bodySchema = z.strictObject({
  conversationId: z.uuid().nullable(),
  sportKey: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  planId: z.uuid().nullable(),
  text: z.string().max(4_000),
});

const headers = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};

const problem = (code: Parameters<typeof httpStatus>[0], status = httpStatus(code)) =>
  Response.json({ error: { code } }, { status, headers: { "cache-control": "private, no-store" } });

export async function POST(request: Request) {
  // a browser sends Origin on a cross-site POST; refuse anything that is not this app
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env.APP_URL).origin) return problem("FORBIDDEN");

  const viewer = await getViewer();
  if (!viewer) return problem("UNAUTHENTICATED");
  if (!assistantAvailability().available) return problem("UNAVAILABLE");

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY) return problem("VALIDATION", 413);
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return problem("VALIDATION", 413);
    raw = JSON.parse(text);
  } catch {
    return problem("VALIDATION");
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success || !isSportKey(body.data.sportKey)) return problem("VALIDATION");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          /* the client has gone */
        }
      };
      try {
        const result = await runTurn(viewer.actor, body.data, {
          signal: request.signal,
          onEvent: (e) => send(e),
        });
        if (result.ok)
          send({
            type: "done",
            conversation: toConversationDto(result.data.conversation),
            user: toMessageDto(result.data.user),
            assistant: toMessageDto(result.data.assistant),
          });
        else send({ type: "error", code: result.error.code, values: result.values });
      } catch {
        send({ type: "error", code: "INTERNAL" });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, { headers });
}
