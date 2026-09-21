import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { assistantUsage, auditEvents, plans } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { pool } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import type { Result } from "@/lib/result";
import {
  applyProposalInMessage,
  assistantAvailability,
  dismissProposalInMessage,
  getConversation,
  getMessage,
  listConversations,
  listMessages,
  overrideProviderForTests,
  runTool,
  runTurn,
  toolSpecs,
  TOOLS,
  type Proposal,
  type StoredMessage,
  type ToolContext,
} from "@/modules/assistant";
import { createGeneratedSession, previewGeneration } from "@/modules/generator";
import { updateActivity } from "@/modules/plans/commands";
import { getPlan } from "@/modules/plans/queries";
import { updateActivitySchema } from "@/modules/plans/validators";
import { getDrill } from "@/modules/drills/queries";
import { createClub } from "./drill-fixtures";
import { createTestActor } from "./factories";

/**
 * The AI Coaching Assistant against a real database, driven by the deterministic stand-in for a model. What is tested is
 * everything that is NOT the model: that its tools only ever propose, that nothing is invented or unlocked or
 * executed, that a change happens only when the coach applies it through the ordinary commands, and that a model that
 * misbehaves (invents a drill, sends garbage, refuses, fails, never stops) cannot hurt anything.
 */

const SPORT = "basketball";
const labels = { breakTitle: "Water break", title: (o: string, m: number) => `${o} · ${m} min` };
let coach: Actor;
let teacher: Actor;
let assistantRole: Actor;
let outsider: Actor;

const good = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r.error)}`);
  return r.data;
};
const codeOf = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);

const say = async (
  actor: Actor,
  text: string,
  over: { planId?: string | null; conversationId?: string | null } = {},
) =>
  good(
    await runTurn(actor, {
      conversationId: over.conversationId ?? null,
      sportKey: SPORT,
      planId: over.planId ?? null,
      text,
    }),
  );
const proposalsOf = (m: StoredMessage) => m.content.proposals;
const only = (m: StoredMessage): Proposal => {
  expect(m.content.proposals).toHaveLength(1);
  return m.content.proposals[0]!;
};
const apply = (actor: Actor, m: StoredMessage, p: Proposal, confirmed = false) =>
  applyProposalInMessage(actor, { messageId: m.id, proposalId: p.id, confirmed }, labels);

/** A real session of real drills for the coach, made the ordinary way. */
async function makeSession(actor = coach, over: Record<string, unknown> = {}) {
  const req = {
    title: "Assistant test session",
    players: 12,
    durationMin: 60,
    ageGroup: "u14",
    level: "beginner",
    primaryObjective: "shooting",
    ...over,
  };
  const preview = good(await previewGeneration(actor, SPORT, req));
  const created = good(
    await createGeneratedSession(
      actor,
      SPORT,
      req,
      preview.items.map((i) => ({
        kind: i.kind,
        drillId: i.drillId,
        phase: i.phase,
        durationMin: i.durationMin,
        locked: false,
      })),
      {},
      labels,
    ),
  );
  return created.id;
}
const load = (id: string, actor = coach) => getPlan(actor, SPORT, id);
const lock = async (planId: string, activityId: string, locked = true) => {
  const plan = (await load(planId))!;
  good(
    await updateActivity(
      coach,
      SPORT,
      planId,
      activityId,
      updateActivitySchema.parse({ locked, version: plan.version }),
    ),
  );
};

beforeAll(async () => {
  const founder = await createTestActor("Assistant Founder");
  const club = await createClub(founder, [
    { role: "coach", name: "Ada Coach" },
    { role: "teacher", name: "Ted Teacher" },
    { role: "assistant", name: "Abe Assistant" },
  ]);
  [coach, teacher, assistantRole] = club.members as [Actor, Actor, Actor];
  outsider = await createTestActor("Assistant Outsider");
});
afterEach(() => overrideProviderForTests(undefined));
afterAll(async () => {
  await pool.end();
});

describe("availability and access", () => {
  it("is available with a provider and reports itself unavailable without one — creating nothing", async () => {
    expect(assistantAvailability().available).toBe(true);
    overrideProviderForTests(null);
    expect(assistantAvailability().available).toBe(false);
    const r = await runTurn(coach, {
      conversationId: null,
      sportKey: SPORT,
      planId: null,
      text: "Create a session",
    });
    expect(codeOf(r)).toBe("UNAVAILABLE");
    overrideProviderForTests(undefined);
    expect(await listConversations(outsider, SPORT)).toEqual([]);
  });

  it("is refused for a role that cannot author sessions", async () => {
    const r = await runTurn(assistantRole, {
      conversationId: null,
      sportKey: SPORT,
      planId: null,
      text: "Create a session",
    });
    expect(codeOf(r)).toBe("FORBIDDEN");
    expect(await listConversations(assistantRole, SPORT)).toEqual([]);
  });

  it("checks what it is given: sport, empty and over-long messages, and sessions or conversations that are not the person's", async () => {
    const base = { conversationId: null, planId: null, text: "hello" };
    expect(codeOf(await runTurn(coach, { ...base, sportKey: "quidditch" }))).toBe("NOT_FOUND");
    expect(codeOf(await runTurn(coach, { ...base, sportKey: SPORT, text: "   " }))).toBe(
      "VALIDATION",
    );
    expect(codeOf(await runTurn(coach, { ...base, sportKey: SPORT, text: "x".repeat(2001) }))).toBe(
      "VALIDATION",
    );
    const theirs = await makeSession(coach);
    expect(codeOf(await runTurn(outsider, { ...base, sportKey: SPORT, planId: theirs }))).toBe(
      "NOT_FOUND",
    );
    const conv = (await say(coach, "hello")).conversation;
    expect(
      codeOf(await runTurn(outsider, { ...base, sportKey: SPORT, conversationId: conv.id })),
    ).toBe("NOT_FOUND");
    expect(
      codeOf(await runTurn(coach, { ...base, sportKey: SPORT, conversationId: "not-a-uuid" })),
    ).toBe("NOT_FOUND");
  });
});

describe("privacy of conversations", () => {
  it("shows a conversation to nobody but the person who had it — not a colleague, not the owner", async () => {
    const turn = await say(coach, "Create a 45 minute passing session for 10 players");
    expect((await listConversations(coach, SPORT)).map((c) => c.id)).toContain(
      turn.conversation.id,
    );
    for (const other of [teacher, outsider, assistantRole]) {
      expect(await getConversation(other, turn.conversation.id)).toBeNull();
      expect(await listMessages(other, turn.conversation.id)).toEqual([]);
      expect(await getMessage(other, turn.assistant.id)).toBeNull();
      expect((await listConversations(other, SPORT)).map((c) => c.id)).not.toContain(
        turn.conversation.id,
      );
    }
    // a colleague cannot apply a proposal that is not theirs
    const p = only(turn.assistant);
    expect(codeOf(await apply(teacher, turn.assistant, p))).toBe("NOT_FOUND");
    // and the database itself agrees: no row is visible to another person
    const seen = await tenantTx(teacher, (tx) =>
      tx.execute(`select count(*)::int as n from assistant_messages`),
    );
    expect((seen.rows[0] as { n: number }).n).toBe(0);
  });
});

describe("creating a session with the assistant", () => {
  it("proposes a session of real drills that adds up, and creates nothing until the coach applies it", async () => {
    const before = await tenantTx(coach, (tx) => tx.select({ id: plans.id }).from(plans));
    const turn = await say(
      coach,
      "Create a 60 minute shooting session for 12 players U14 beginner",
    );
    expect(turn.assistant.content.problem).toBeUndefined();
    expect(turn.assistant.content.text).toMatch(/prepared a session/i);
    const p = only(turn.assistant);
    expect(p).toMatchObject({ kind: "create_session", status: "pending" });
    if (p.kind !== "create_session") throw new Error("kind");
    expect(p.items.reduce((n, i) => n + i.durationMin, 0)).toBe(60);
    expect(p.requirements).toMatchObject({
      players: 12,
      durationMin: 60,
      primaryObjective: "shooting",
    });
    expect(turn.assistant.content.sources.length).toBeGreaterThan(0);
    expect((await tenantTx(coach, (tx) => tx.select({ id: plans.id }).from(plans))).length).toBe(
      before.length,
    );

    // apply: through the normal commands — an ordinary, editable session
    const applied = good(await apply(coach, turn.assistant, p));
    expect(applied.planId).toBeTruthy();
    const plan = (await load(applied.planId!))!;
    expect(plan.totals.totalMinutes).toBe(60);
    expect(plan.status).toBe("draft");
    expect(plan.permissions.canEdit).toBe(true);
    const stored = await getMessage(coach, turn.assistant.id);
    expect(stored!.content.proposals[0]).toMatchObject({
      status: "applied",
      createdPlanId: applied.planId,
    });

    // the audit trail says the assistant's suggestion was applied
    const events = await tenantTx(coach, (tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.entityId, applied.planId!),
            eq(auditEvents.action, "assistant.proposal_applied"),
          ),
        ),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.metadata).toMatchObject({ kind: "create_session" });
  });

  it("applies a proposal exactly once, however many times it is clicked", async () => {
    const turn = await say(coach, "Create a 40 minute ball handling session for 8 players U12");
    const p = only(turn.assistant);
    const [a, b] = await Promise.all([
      apply(coach, turn.assistant, p),
      apply(coach, turn.assistant, p),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(codeOf(await apply(coach, turn.assistant, p))).toBe("CONFLICT");
  });

  it("can be dismissed, and a dismissed proposal cannot be applied", async () => {
    const turn = await say(coach, "Generate a session for 10 players about passing");
    const p = only(turn.assistant);
    const d = good(
      await dismissProposalInMessage(coach, { messageId: turn.assistant.id, proposalId: p.id }),
    );
    expect(d.content.proposals[0]!.status).toBe("dismissed");
    expect(codeOf(await apply(coach, turn.assistant, p))).toBe("CONFLICT");
  });

  it("asks when something essential is missing instead of guessing", async () => {
    const turn = await say(coach, "Create a session for 12 players");
    expect(turn.assistant.content.text).toMatch(/which objective/i);
    expect(proposalsOf(turn.assistant)).toEqual([]);
  });

  it("respects the equipment and players it is told about, and refuses what cannot run", async () => {
    const turn = await say(
      coach,
      "Create a 30 minute shooting session for 12 players with 1 basket U14",
    );
    const p = only(turn.assistant);
    expect(p.kind).toBe("create_session");
  });
});

describe("explaining a drill uses real CoachOS content", () => {
  it("quotes the drill it looked up, names it as a source, and separates its own suggestion", async () => {
    const turn = await say(coach, "Explain the Mikan drill");
    const text = turn.assistant.content.text;
    expect(text).toMatch(/From the CoachOS drill “Mikan Drill”/);
    const source = turn.assistant.content.sources.find((s) => s.title === "Mikan Drill");
    expect(source).toBeDefined();
    const drill = (await getDrill(coach, SPORT, source!.drillId))!;
    expect(text).toContain(drill.content.objective);
    expect(text).toContain(drill.content.instructions[0]!);
    expect(text).toMatch(/My own suggestion/);
  });

  it("does not invent a drill it cannot find", async () => {
    const turn = await say(coach, "Explain the zorblax spiral drill");
    expect(turn.assistant.content.text).toMatch(/could not find/i);
    expect(turn.assistant.content.sources).toEqual([]);
  });
});

describe("changing a session", () => {
  it("proposes a harder drill, asks for confirmation to replace, and replaces it through the normal command", async () => {
    const planId = await makeSession();
    const before = (await load(planId))!;
    const turn = await say(coach, "Make it harder", { planId });
    const p = only(turn.assistant);
    expect(p.kind).toBe("replace_drill");
    expect(await load(planId)).toMatchObject({ version: before.version }); // nothing changed yet

    const refused = await apply(coach, turn.assistant, p);
    expect(refused.ok).toBe(false);
    expect((await getMessage(coach, turn.assistant.id))!.content.proposals[0]!.status).toBe(
      "pending",
    ); // still waiting

    const done = good(await apply(coach, turn.assistant, p, true));
    expect(done.planId).toBe(planId);
    if (p.kind !== "replace_drill") throw new Error("kind");
    const after = (await load(planId))!;
    expect(after.activities.find((a) => a.id === p.activityId)!.source.drillId).toBe(p.drillId);
    expect(after.totals.totalMinutes).toBe(before.totals.totalMinutes);
  });

  it("never touches a locked activity: not proposed, and not applied if it was locked after the proposal", async () => {
    const planId = await makeSession();
    const plan = (await load(planId))!;
    const drills = plan.activities.filter((a) => a.kind === "drill");
    const turn = await say(coach, "Make it easier", { planId });
    const p = only(turn.assistant);
    if (p.kind !== "replace_drill") throw new Error("kind");
    // locked AFTER the proposal: applying is refused, and the proposal fails honestly
    await lock(planId, p.activityId);
    const r = await apply(coach, turn.assistant, p, true);
    expect(codeOf(r)).toBe("FORBIDDEN");
    expect((await getMessage(coach, turn.assistant.id))!.content.proposals[0]).toMatchObject({
      status: "failed",
      error: "FORBIDDEN",
    });
    expect(
      (await load(planId))!.activities.find((a) => a.id === p.activityId)!.source.drillId,
    ).not.toBe(p.drillId);

    // locked BEFORE: the next request works around it
    const second = await say(coach, "Make it easier", {
      planId,
      conversationId: turn.conversation.id,
    });
    const q = only(second.assistant);
    if (q.kind !== "replace_drill") throw new Error("kind");
    expect(q.activityId).not.toBe(p.activityId);

    // everything locked: nothing may be proposed, and it says so
    for (const a of drills) if (a.id !== p.activityId) await lock(planId, a.id);
    const third = await say(coach, "Make it harder", { planId });
    expect(proposalsOf(third.assistant)).toEqual([]);
    expect(third.assistant.content.text).toMatch(/locked/i);
  });

  it("refuses to remove, reorder, edit or draw on a locked activity even if the model asks", async () => {
    const planId = await makeSession();
    const plan = (await load(planId))!;
    const target = plan.activities.find((a) => a.kind === "drill")!;
    await lock(planId, target.id);
    const ctx: ToolContext = {
      actor: coach,
      sportKey: SPORT,
      planId,
      userText: "",
      proposals: [],
      sources: new Map(),
    };
    for (const [name, input] of [
      ["remove_activity", { activityId: target.id }],
      ["update_activity", { activityId: target.id, durationMin: 9 }],
      ["reorder_activity", { activityId: target.id, toPosition: 1 }],
      [
        "replace_activity",
        { activityId: target.id, drillId: "0192a000-0000-7000-8000-0000000000ff" },
      ],
    ] as const) {
      const r = await runTool(ctx, name, input);
      expect(r.isError, name).toBe(true);
      expect(JSON.parse(r.text).error, name).toBe("locked");
    }
    expect(ctx.proposals).toEqual([]);
  });

  it("removes an activity only after confirmation", async () => {
    const planId = await makeSession();
    const plan = (await load(planId))!;
    const victim = plan.activities.find((a) => a.kind === "drill")!;
    const word = victim.title
      .split(/\s+/)
      .find((w) => w.length > 3)!
      .toLowerCase();
    const turn = await say(coach, `Remove the ${word} drill`, { planId });
    const p = only(turn.assistant);
    expect(p).toMatchObject({ kind: "remove_activity", activityId: victim.id });
    expect((await apply(coach, turn.assistant, p)).ok).toBe(false);
    good(await apply(coach, turn.assistant, p, true));
    expect((await load(planId))!.activities.map((a) => a.id)).not.toContain(victim.id);
  });

  it("adds a real drill and a break, and reorders", async () => {
    const planId = await makeSession();
    const before = (await load(planId))!;
    const added = await say(coach, "Add a rebounding drill", { planId });
    const p = only(added.assistant);
    expect(p.kind).toBe("add_drill");
    good(await apply(coach, added.assistant, p));
    expect((await load(planId))!.activities).toHaveLength(before.activities.length + 1);

    const brk = await say(coach, "Add a break", { planId });
    good(await apply(coach, brk.assistant, only(brk.assistant)));
    expect(
      (await load(planId))!.activities.some(
        (a) => a.kind === "break" && a.title === "Water break" && a.durationMin === 5,
      ),
    ).toBe(true);

    const order = await say(coach, "Reorganize the phases", { planId });
    const o = only(order.assistant);
    if (o.kind !== "reorder_activity") throw new Error("kind");
    good(await apply(coach, order.assistant, o));
    expect((await load(planId))!.activities[0]!.id).toBe(o.activityId);
  });

  it("changes the length: locked activities and breaks keep their minutes, the total is exact, and it needs confirmation", async () => {
    const planId = await makeSession();
    const plan = (await load(planId))!;
    const locked = plan.activities.find((a) => a.kind === "drill")!;
    await lock(planId, locked.id);
    const turn = await say(coach, "Shorten it to 45 minutes", { planId });
    const p = only(turn.assistant);
    if (p.kind !== "set_durations") throw new Error("kind");
    expect(p.changes.map((c) => c.activityId)).not.toContain(locked.id);
    expect((await apply(coach, turn.assistant, p)).ok).toBe(false);
    good(await apply(coach, turn.assistant, p, true));
    const after = (await load(planId))!;
    expect(after.totals.totalMinutes).toBe(45);
    expect(after.activities.find((a) => a.id === locked.id)!.durationMin).toBe(locked.durationMin);
  });

  it("changes the players and reports what that means, and changes the objective", async () => {
    const planId = await makeSession();
    const players = await say(coach, "It is now 6 players", { planId });
    const p = only(players.assistant);
    expect(p).toMatchObject({ kind: "update_plan", players: 6 });
    good(await apply(coach, players.assistant, p));
    expect((await load(planId))!.players).toBe(6);

    const objective = await say(coach, "Change the objective to rebounding", { planId });
    good(await apply(coach, objective.assistant, only(objective.assistant)));
    expect((await load(planId))!.objectives.primary?.key).toBe("rebounding");
  });

  it("makes a custom activity only when asked, labels it, and never as a library drill", async () => {
    const planId = await makeSession();
    const ctx: ToolContext = {
      actor: coach,
      sportKey: SPORT,
      planId,
      userText: "add a drill",
      proposals: [],
      sources: new Map(),
    };
    const refused = await runTool(ctx, "create_custom_activity", {
      title: "Made up",
      durationMin: 5,
      description: "x",
    });
    expect(JSON.parse(refused.text).error).toBe("not_requested");

    const turn = await say(coach, "Make up a custom activity for finishing", { planId });
    const p = only(turn.assistant);
    expect(p.kind).toBe("add_custom");
    expect(turn.assistant.content.text).toMatch(/my own suggestion|not a CoachOS drill/i);
    good(await apply(coach, turn.assistant, p));
    const a = (await load(planId))!.activities.find((x) => x.kind === "custom")!;
    expect(a.title).toBe("Two-line finishing relay");
    expect(a.notes).toMatch(/AI-generated/);
    expect(a.source.drillId).toBeNull();
  });

  it("checks the session with the same rules the generator uses", async () => {
    const planId = await makeSession();
    const turn = await say(coach, "Check my session", { planId });
    expect(turn.assistant.content.text).toMatch(/checked the session/i);
    expect(proposalsOf(turn.assistant)).toEqual([]);
  });

  it("needs a session for a session change, and only the person's own", async () => {
    const turn = await say(coach, "Make it harder");
    expect(proposalsOf(turn.assistant)).toEqual([]);
    expect(turn.assistant.content.text).toMatch(/could not do that/i);
  });
});

describe("diagrams", () => {
  it("proposes a diagram as structured data, then a change to it, and applies both through the normal command", async () => {
    const planId = await makeSession();
    const turn = await say(coach, "Draw a diagram for this session", { planId });
    const p = only(turn.assistant);
    if (p.kind !== "set_diagram") throw new Error("kind");
    expect(p.diagram.entities.filter((e) => e.type === "player")).toHaveLength(5);
    good(await apply(coach, turn.assistant, p, true));
    const activity = (await load(planId))!.activities.find((a) => a.id === p.activityId)!;
    const drawn =
      activity.snapshot && "diagrams" in activity.snapshot ? activity.snapshot.diagrams : [];
    expect(drawn.length).toBeGreaterThan(0);

    const add = await say(coach, "Add a defender to the diagram", { planId });
    const q = only(add.assistant);
    if (q.kind !== "set_diagram") throw new Error("kind");
    expect(q.replacing).toBe(true);
    const defenders = (d: typeof q.diagram) =>
      d.entities.filter((e) => e.type === "player" && e.side === "defense").length;
    const now = (await load(planId))!.activities.find((a) => a.id === q.activityId)!;
    const current =
      now.snapshot && "diagrams" in now.snapshot ? now.snapshot.diagrams[q.index]!.diagram : null;
    expect(defenders(q.diagram)).toBe(defenders(current!) + 1);
    good(await apply(coach, add.assistant, q, true));
  });

  it("never accepts markup or scripts as a diagram, and changes nothing when it is offered", async () => {
    const planId = await makeSession();
    const before = (await load(planId))!;
    for (const phrase of ["[[injection]] draw", "[[svg]] change the diagram"]) {
      const turn = await say(coach, phrase, { planId });
      expect(proposalsOf(turn.assistant)).toEqual([]);
    }
    expect((await load(planId))!.version).toBe(before.version);
    // the tool schemas have no place for markup at all
    const spec = JSON.stringify(toolSpecs().find((t) => t.name === "create_diagram"));
    expect(spec).not.toMatch(/"svg"|"html"|"markup"/);
  });

  it("validates a diagram against the court before proposing it", async () => {
    const planId = await makeSession();
    const plan = (await load(planId))!;
    const activity = plan.activities.find((a) => a.kind === "drill")!;
    const ctx: ToolContext = {
      actor: coach,
      sportKey: SPORT,
      planId,
      userText: "",
      proposals: [],
      sources: new Map(),
    };
    const bad = {
      activityId: activity.id,
      diagram: {
        schemaVersion: 1,
        sport: "basketball",
        court: { type: "half", variant: "fiba" },
        entities: [{ id: "o1", type: "player", side: "offense", at: { anchor: "nowhere_land" } }],
        actions: [],
        annotations: [],
      },
    };
    const r = await runTool(ctx, "create_diagram", bad);
    expect(r.isError).toBe(true);
    expect(ctx.proposals).toEqual([]);
  });
});

describe("a model that misbehaves cannot hurt anything", () => {
  it("cannot add a drill that does not exist, send malformed input or call a tool that is not there", async () => {
    const planId = await makeSession();
    const before = (await load(planId))!;
    for (const phrase of [
      "[[hallucinate]] add it",
      "[[malformed]] add it",
      "[[unknowntool]] do it",
    ]) {
      const turn = await say(coach, phrase, { planId });
      expect(proposalsOf(turn.assistant), phrase).toEqual([]);
      expect(turn.assistant.content.problem, phrase).toBeUndefined();
    }
    const after = (await load(planId))!;
    expect(after.version).toBe(before.version);
    expect(after.activities).toHaveLength(before.activities.length);
  });

  it("survives a provider that fails, refuses or never stops", async () => {
    const failed = await say(coach, "[[fail]] anything");
    expect(failed.assistant.content).toMatchObject({ problem: "failed", proposals: [] });
    const refused = await say(coach, "[[refuse]] anything");
    expect(refused.assistant.content).toMatchObject({ problem: "refused", proposals: [] });
    const looping = await say(coach, "[[loop]] anything");
    expect(looping.assistant.content.problem).toBe("failed"); // bounded: six rounds, then it stops
  });

  it("can be cancelled while it works, and says so", async () => {
    const controller = new AbortController();
    const running = runTurn(
      coach,
      { conversationId: null, sportKey: SPORT, planId: null, text: "[[slow]] think" },
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 100);
    const turn = good(await running);
    expect(turn.assistant.content.problem).toBe("cancelled");
    expect(proposalsOf(turn.assistant)).toEqual([]);
  });

  it("keeps a failed turn in the conversation so the coach can retry", async () => {
    const failed = await say(coach, "[[fail]] first");
    const next = await say(coach, "Create a 30 minute passing session for 10 players", {
      conversationId: failed.conversation.id,
    });
    expect(next.conversation.id).toBe(failed.conversation.id);
    const all = await listMessages(coach, failed.conversation.id);
    expect(all.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(proposalsOf(all[3]!)).toHaveLength(1);
  });
});

describe("what the model is given", () => {
  it("has 21 validated tools, each a strict object, none able to write on its own", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual([
      "search_drills",
      "get_drill",
      "find_matching_drills",
      "get_objectives",
      "get_age_groups",
      "get_session",
      "validate_session",
      "generate_session",
      "create_session",
      "add_activity",
      "replace_activity",
      "remove_activity",
      "update_activity",
      "reorder_activity",
      "change_duration",
      "change_player_count",
      "change_objectives",
      "create_custom_activity",
      "add_break",
      "create_diagram",
      "update_diagram",
    ]);
    for (const spec of toolSpecs()) {
      expect(spec.inputSchema.type, spec.name).toBe("object");
      expect(spec.description.length, spec.name).toBeGreaterThan(20);
    }
  });

  it("answers tools with small structured results the model can read, and errors it can correct", async () => {
    const ctx: ToolContext = {
      actor: coach,
      sportKey: SPORT,
      planId: null,
      userText: "",
      proposals: [],
      sources: new Map(),
    };
    const objectives = JSON.parse((await runTool(ctx, "get_objectives", {})).text);
    expect(objectives.objectives.map((o: { key: string }) => o.key)).toContain("shooting");
    const found = JSON.parse(
      (await runTool(ctx, "search_drills", { query: "mikan", limit: 2 })).text,
    );
    expect(found.drills[0].title).toBe("Mikan Drill");
    const bad = await runTool(ctx, "search_drills", { limit: 99 });
    expect(bad.isError).toBe(true);
    expect(JSON.parse(bad.text).error).toBe("invalid_input");
    const extra = await runTool(ctx, "get_objectives", { sql: "drop table plans" });
    expect(extra.isError).toBe(true);
    const drill = JSON.parse(
      (await runTool(ctx, "get_drill", { drillId: "0192a000-0000-7000-8000-0000000000ff" })).text,
    );
    expect(drill.error).toBe("not_found");
    const matching = JSON.parse(
      (
        await runTool(ctx, "find_matching_drills", {
          objective: "shooting",
          players: 12,
          ageGroup: "u14",
        })
      ).text,
    );
    expect(matching.drills.length).toBeGreaterThan(0);
    expect(
      JSON.parse((await runTool(ctx, "get_age_groups", {})).text).ageGroups.map(
        (g: { key: string }) => g.key,
      ),
    ).toContain("u14");
  });

  it("cannot see another workspace's session or drill through a tool", async () => {
    const theirs = await makeSession(outsider);
    const ctx: ToolContext = {
      actor: coach,
      sportKey: SPORT,
      planId: theirs,
      userText: "",
      proposals: [],
      sources: new Map(),
    };
    const r = await runTool(ctx, "get_session", {});
    expect(JSON.parse(r.text).error).toBe("not_found");
    const v = await runTool(ctx, "validate_session", { planId: theirs });
    expect(v.isError).toBe(true);
  });
});

describe("limits and cost", () => {
  it("records what a person uses and stops at the daily limit", async () => {
    const person = await createTestActor("Limit Coach");
    const club = await createClub(person, [{ role: "coach", name: "Lim Coach" }]);
    const lim = club.members[0] as Actor;
    await say(lim, "hello");
    const [row] = await tenantTx(lim, (tx) =>
      tx.select().from(assistantUsage).where(eq(assistantUsage.userId, lim.userId)),
    );
    expect(row!.messages).toBe(1);
    expect(row!.inputTokens).toBeGreaterThan(0);
    await tenantTx(lim, (tx) =>
      tx.update(assistantUsage).set({ messages: 150 }).where(eq(assistantUsage.userId, lim.userId)),
    );
    const r = await runTurn(lim, {
      conversationId: null,
      sportKey: SPORT,
      planId: null,
      text: "one more",
    });
    expect(codeOf(r)).toBe("RATE_LIMITED");
  });

  it("stops a conversation that has grown too long", async () => {
    const person = await createTestActor("Long Coach");
    const first = await say(person, "hello");
    for (let i = 0; i < 39; i++)
      await say(person, `message ${i}`, { conversationId: first.conversation.id });
    const r = await runTurn(person, {
      conversationId: first.conversation.id,
      sportKey: SPORT,
      planId: null,
      text: "one too many",
    });
    expect(codeOf(r)).toBe("VALIDATION");
  });
});
