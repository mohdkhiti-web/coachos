import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { diagramOpsSchema } from "@/engines/diagram";
import { PLAN_LIMITS } from "@/db/enums";
import { plans } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import {
  applyProposal,
  applyProposalInMessage,
  runTool,
  runTurn,
  type Proposal,
  type StoredMessage,
  type ToolContext,
} from "@/modules/assistant";
import { createConversation, appendMessage } from "@/modules/assistant/store";
import { addBreak, addCustomActivity, updateActivity } from "@/modules/plans/commands";
import { getPlan } from "@/modules/plans/queries";
import {
  addBreakSchema,
  addCustomActivitySchema,
  updateActivitySchema,
} from "@/modules/plans/validators";
import { createClub } from "./drill-fixtures";
import { createTestActor } from "./factories";
import { makePlan } from "./plan-fixtures";

/**
 * FINAL AI SAFETY CHECK (production-readiness pass): every attack the coach-facing spec asked for, proven against the real
 * server code — authorization, row-level security, workspace boundaries, locked activities, structured validation, confirmation
 * and limits — with the deterministic scripted model standing in for "whatever the model says" (the model is untrusted input;
 * these checks do not depend on which words it used, only on what the server enforces regardless of them).
 */

const SPORT = "basketball";
const labels = { breakTitle: "Water break", title: (o: string, m: number) => `${o} · ${m} min` };
const FAKE_ID = "0192a000-0000-7000-8000-0000000000ff";
let mine: Actor;
let other: Actor;

const good = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r.error)}`);
  return r.data;
};
const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
const apply = (actor: Actor, m: StoredMessage, p: Proposal, confirmed = false) =>
  applyProposalInMessage(actor, { messageId: m.id, proposalId: p.id, confirmed }, labels);
const ctxFor = (actor: Actor, planId: string | null = null): ToolContext => ({
  actor,
  sportKey: SPORT,
  planId,
  userText: "",
  proposals: [],
  sources: new Map(),
});
const minimalDiagram = () => ({
  schemaVersion: 1 as const,
  sport: "basketball",
  court: { type: "half" as const, variant: "fiba" },
  entities: [
    { id: "o1", type: "player" as const, side: "offense" as const, at: { anchor: "top_key" } },
  ],
  actions: [],
  annotations: [],
});
/** A proposal stored in a real message, the way it would be applied from the chat screen. */
async function stored(actor: Actor, planId: string, proposal: Proposal): Promise<StoredMessage> {
  const conversation = await createConversation(actor, {
    sportKey: SPORT,
    planId,
    title: "safety test",
  });
  return (await appendMessage(actor, conversation.id, "assistant", {
    schemaVersion: 1,
    text: "",
    proposals: [proposal],
    sources: [],
  }))!;
}

beforeAll(async () => {
  const founder = await createTestActor("Safety Founder");
  const club = await createClub(founder, [{ role: "coach", name: "Safety Mine" }]);
  mine = club.members[0] as Actor;
  other = await createTestActor("Safety Other");
});
afterAll(async () => {
  await pool.end();
});

describe("1. a nonexistent drill id is never accepted", () => {
  it("add_activity and replace_activity refuse an invented drill id, and record no proposal", async () => {
    const planId = (await makePlan(mine, { title: "Safety: fake drill" })).id;
    const plan = (await getPlan(mine, SPORT, planId))!;
    const added = good(
      await addBreak(
        mine,
        SPORT,
        planId,
        addBreakSchema.parse({ durationMin: 5, version: plan.version }),
      ),
    );
    const ctx = ctxFor(mine, planId);
    const add = await runTool(ctx, "add_activity", { drillId: FAKE_ID });
    expect(add.isError).toBe(true);
    expect(JSON.parse(add.text).error).toBe("not_found");
    const replace = await runTool(ctx, "replace_activity", {
      activityId: added.id,
      drillId: FAKE_ID,
    });
    expect(replace.isError).toBe(true);
    expect(ctx.proposals).toEqual([]);
  });
});

describe("2. another user's session is invisible and unwritable", () => {
  it("every tool refuses a session id belonging to another workspace, exactly as if it did not exist", async () => {
    const theirs = await makePlan(other, { title: "Safety: someone else's session" });
    const theirPlan = (await getPlan(other, SPORT, theirs.id))!;
    const theirActivity = theirPlan.activities[0]?.id ?? FAKE_ID;
    const ctx = ctxFor(mine, null); // no session of my own in context: every planId below is explicit and foreign

    for (const [name, input] of [
      ["get_session", { planId: theirs.id }],
      ["validate_session", { planId: theirs.id }],
      ["add_activity", { planId: theirs.id, drillId: theirActivity }],
      ["remove_activity", { planId: theirs.id, activityId: theirActivity }],
      ["update_activity", { planId: theirs.id, activityId: theirActivity, title: "Hijacked" }],
      ["reorder_activity", { planId: theirs.id, activityId: theirActivity, toPosition: 0 }],
      ["change_duration", { planId: theirs.id, totalMinutes: 30 }],
      ["change_player_count", { planId: theirs.id, players: 4 }],
      ["change_objectives", { planId: theirs.id, primary: "shooting", secondary: [] }],
      ["add_break", { planId: theirs.id, durationMin: 5 }],
      [
        "create_diagram",
        { planId: theirs.id, activityId: theirActivity, diagram: minimalDiagram() },
      ],
    ] as const) {
      const r = await runTool(ctx, name, input);
      expect(r.isError, name).toBe(true);
      expect(JSON.parse(r.text).error, name).toBe("not_found");
    }
    expect(ctx.proposals).toEqual([]);

    // the row itself is untouched
    const after = (await getPlan(other, SPORT, theirs.id))!;
    expect(after.version).toBe(theirPlan.version);
    expect(after.title).toBe("Safety: someone else's session");
  });

  it("refuses to apply a proposal against a foreign session even if its planId were tampered with after the fact", async () => {
    const theirs = await makePlan(other, { title: "Safety: apply target" });
    const mySession = await makePlan(mine, { title: "Safety: my session for apply test" });
    const turn = good(
      await runTurn(mine, {
        conversationId: null,
        sportKey: SPORT,
        planId: mySession.id,
        text: "Add a break",
      }),
    );
    const proposal = turn.assistant.content.proposals[0];
    if (!proposal || !("planId" in proposal)) throw new Error("expected a planId-bearing proposal");
    // applyProposal re-reads the session as ME, through RLS, whatever planId the proposal object carries: to me, a
    // foreign session simply does not exist, so this comes back exactly like "the session has moved on" (CONFLICT) —
    // never a hint that it exists, and never a write.
    const tampered = { ...proposal, planId: theirs.id } as Proposal;
    const result = await applyProposal(mine, SPORT, tampered, { confirmed: true, labels });
    expect(codeOf(result)).toBe("CONFLICT");
    expect((await getPlan(other, SPORT, theirs.id))!.activities).toHaveLength(0);
  });
});

describe("3. a locked activity cannot be touched, whatever the model asks for", () => {
  it("remove, update, reorder, replace and diagram tools all refuse it, with the same 'locked' code", async () => {
    const planId = (await makePlan(mine, { title: "Safety: locked" })).id;
    const plan = (await getPlan(mine, SPORT, planId))!;
    const added = good(
      await addBreak(
        mine,
        SPORT,
        planId,
        addBreakSchema.parse({ durationMin: 5, version: plan.version }),
      ),
    );
    good(
      await updateActivity(
        mine,
        SPORT,
        planId,
        added.id,
        updateActivitySchema.parse({ locked: true, version: added.version }),
      ),
    );

    const ctx = ctxFor(mine, planId);
    for (const [name, input] of [
      ["remove_activity", { activityId: added.id }],
      ["update_activity", { activityId: added.id, durationMin: 9 }],
      ["reorder_activity", { activityId: added.id, toPosition: 0 }],
      ["replace_activity", { activityId: added.id, drillId: FAKE_ID }],
      ["create_diagram", { activityId: added.id, diagram: minimalDiagram() }],
    ] as const) {
      const r = await runTool(ctx, name, input);
      expect(r.isError, name).toBe(true);
      expect(JSON.parse(r.text).error, name).toBe("locked");
    }
    expect(ctx.proposals).toEqual([]);
  });
});

describe("4. an invalid diagram is refused before it ever becomes a proposal", () => {
  it("off-court positions and a pass with no ball are refused, and nothing is recorded", async () => {
    const planId = (await makePlan(mine, { title: "Safety: bad diagram" })).id;
    const plan = (await getPlan(mine, SPORT, planId))!;
    const custom = good(
      await addCustomActivity(
        mine,
        SPORT,
        planId,
        addCustomActivitySchema.parse({ title: "Drill", durationMin: 5, version: plan.version }),
      ),
    );

    const ctx = ctxFor(mine, planId);
    const offCourt = await runTool(ctx, "create_diagram", {
      activityId: custom.id,
      diagram: {
        ...minimalDiagram(),
        entities: [{ id: "o1", type: "player", side: "offense", at: { x: 999, y: 999 } }],
      },
    });
    expect(offCourt.isError).toBe(true);
    // caught by the tool's own zod schema (coordinates outside ±60 m) before the semantic court check even runs
    expect(JSON.parse(offCourt.text).error).toBe("invalid_input");

    const noBall = await runTool(ctx, "create_diagram", {
      activityId: custom.id,
      diagram: {
        ...minimalDiagram(),
        entities: [
          { id: "o1", type: "player", side: "offense", at: { anchor: "top_key" } },
          { id: "o2", type: "player", side: "offense", at: { anchor: "left_wing" } },
        ],
        actions: [{ id: "a1", step: 1, type: "pass", from: "o1", to: "o2" }],
      },
    });
    expect(noBall.isError).toBe(true);
    expect(ctx.proposals).toEqual([]);
  });
});

describe("5. SVG, HTML and SQL are only ever data, never executed", () => {
  it("has no field a diagram operation could carry markup in at all", () => {
    for (const bad of [
      [{ op: "run_script", code: "alert(1)" }],
      [{ op: "add_text", at: { anchor: "top_key" }, text: "x", svg: "<svg onload=alert(1)>" }],
      [
        {
          op: "add_player",
          side: "offense",
          at: { anchor: "top_key" },
          html: "<img src=x onerror=alert(1)>",
        },
      ],
    ])
      expect(diagramOpsSchema.safeParse(bad).success).toBe(false);
  });

  it("stores an SVG/HTML/SQL payload in a text field as the literal string it is, and neither runs nor damages anything", async () => {
    const planId = (await makePlan(mine, { title: "Safety: injection" })).id;
    const payload = `<script>window.pwned=1</script>'; DROP TABLE plans; --`;
    const ctx = ctxFor(mine, planId);
    const proposed = await runTool(ctx, "add_break", { durationMin: 5, title: payload });
    expect(proposed.isError).toBe(false);
    expect(ctx.proposals).toHaveLength(1);
    const proposal = ctx.proposals[0]!;
    expect(proposal.kind === "add_break" ? proposal.title : null).toBe(payload); // carried verbatim, never rewritten

    good(await applyProposal(mine, SPORT, proposal, { confirmed: false, labels }));
    const after = (await getPlan(mine, SPORT, planId))!;
    const written = after.activities.find((a) => a.title === payload);
    expect(written).toBeDefined(); // stored exactly, via a parameterized query — never concatenated into SQL

    // the table a naive concatenation could have dropped is still there and queryable
    const stillThere = await tenantTx(mine, (tx) =>
      tx.select({ id: plans.id }).from(plans).where(eq(plans.id, planId)),
    );
    expect(stillThere).toHaveLength(1);
  });
});

describe("6. destructive proposals cannot be applied without confirmation, however many times it is tried", () => {
  it("refuses every unconfirmed attempt and only ever applies once, on the confirmed one", async () => {
    const planId = (await makePlan(mine, { title: "Safety: confirm" })).id;
    const plan = (await getPlan(mine, SPORT, planId))!;
    const added = good(
      await addBreak(
        mine,
        SPORT,
        planId,
        addBreakSchema.parse({ durationMin: 5, version: plan.version }),
      ),
    );
    const ctx = ctxFor(mine, planId);
    await runTool(ctx, "remove_activity", { activityId: added.id });
    const proposal = ctx.proposals[0]!;
    const message = await stored(mine, planId, proposal);

    for (let i = 0; i < 3; i++)
      expect(codeOf(await apply(mine, message, proposal, false))).toBe("VALIDATION");
    expect((await getPlan(mine, SPORT, planId))!.activities.map((a) => a.id)).toContain(added.id);

    good(await apply(mine, message, proposal, true));
    expect((await getPlan(mine, SPORT, planId))!.activities.map((a) => a.id)).not.toContain(
      added.id,
    );
    expect(codeOf(await apply(mine, message, proposal, true))).toBe("CONFLICT"); // never twice
  });
});

describe("7. limits hold even when the assistant is the one asking", () => {
  it("refuses to grow a session past the activity limit, and changes nothing when it tries", async () => {
    const planId = (await makePlan(mine, { title: "Safety: activity limit" })).id;
    let version = (await getPlan(mine, SPORT, planId))!.version;
    for (let i = 0; i < PLAN_LIMITS.maxActivities; i++) {
      version = good(
        await addBreak(mine, SPORT, planId, addBreakSchema.parse({ durationMin: 1, version })),
      ).version;
    }
    const full = (await getPlan(mine, SPORT, planId))!;
    expect(full.activities.length).toBe(PLAN_LIMITS.maxActivities);

    const ctx = ctxFor(mine, planId);
    const proposed = await runTool(ctx, "add_break", { durationMin: 1 });
    expect(proposed.isError).toBe(false); // the tool only checks read access; the command enforces the limit
    const proposal = ctx.proposals[0]!;
    const message = await stored(mine, planId, proposal);
    const result = await apply(mine, message, proposal, false);
    expect(codeOf(result)).toBe("VALIDATION");
    expect((await getPlan(mine, SPORT, planId))!.activities.length).toBe(PLAN_LIMITS.maxActivities);
  });

  it("refuses a diagram-operation batch that would exceed the diagram's own entity limit, leaving the diagram untouched", async () => {
    const planId = (await makePlan(mine, { title: "Safety: diagram limit" })).id;
    const plan = (await getPlan(mine, SPORT, planId))!;
    const custom = good(
      await addCustomActivity(
        mine,
        SPORT,
        planId,
        addCustomActivitySchema.parse({ title: "Drill", durationMin: 5, version: plan.version }),
      ),
    );
    good(
      await updateActivity(
        mine,
        SPORT,
        planId,
        custom.id,
        updateActivitySchema.parse({
          diagrams: [{ title: "", diagram: minimalDiagram() }],
          version: custom.version,
        }),
      ),
    );

    const ctx = ctxFor(mine, planId);
    // 30 more add_player ops on top of the 1 already there exceeds the schema's 30-entity ceiling
    const ops = Array.from({ length: 30 }, () => ({
      op: "add_player" as const,
      side: "offense" as const,
      at: { anchor: "top_key" },
    }));
    const r = await runTool(ctx, "update_diagram", { activityId: custom.id, ops });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.text).error).toBe("invalid_diagram");
    expect(ctx.proposals).toEqual([]);
    const after = (await getPlan(mine, SPORT, planId))!.activities.find((a) => a.id === custom.id)!;
    const diagrams = after.snapshot && "diagrams" in after.snapshot ? after.snapshot.diagrams : [];
    expect(diagrams).toHaveLength(1); // unchanged
  });
});
