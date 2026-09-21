import {
  AiFailure,
  type AiMessage,
  type AiProvider,
  type Completion,
  type CompletionRequest,
  type ContentBlock,
} from "./provider";

/**
 * A deterministic stand-in for a language model, used ONLY by automated tests and the end-to-end suite (`AI_PROVIDER=scripted`;
 * production refuses it unless `ALLOW_DEV_AI` is set). It reads the coach's sentence with plain rules, then behaves the way a
 * well-behaved model does: it calls the assistant's real tools, reads what they answer, and writes a short reply from those
 * answers. A few `[[bracketed]]` phrases make it misbehave on purpose (invent a drill, send malformed input, refuse, fail, stall)
 * so the safety of the assistant can be tested — the assistant must survive every one of them.
 *
 * It is not a model and never claims to be one: nothing in the product presents its output as AI.
 */

const FAKE_ID = "0192a000-0000-7000-8000-0000000000ff";

interface Done {
  name: string;
  input: unknown;
  isError: boolean;
  result: Record<string, unknown> & { error?: string };
}

const humanText = (m: AiMessage) =>
  m.content.some((b) => b.type === "tool_result")
    ? null
    : m.content
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");

/** The coach's last sentence, and what the tools have already answered in this turn. */
function readTurn(messages: AiMessage[]): { text: string; done: Done[] } {
  let start = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user" && humanText(m) !== null) {
      start = i;
      break;
    }
  }
  const text = start >= 0 ? (humanText(messages[start]!) ?? "") : "";
  const calls = new Map<string, { name: string; input: unknown }>();
  const done: Done[] = [];
  for (const m of messages.slice(start + 1)) {
    for (const b of m.content) {
      if (b.type === "tool_use") calls.set(b.id, { name: b.name, input: b.input });
      if (b.type === "tool_result") {
        const call = calls.get(b.toolUseId);
        let result: Done["result"] = {};
        try {
          result = JSON.parse(b.content) as Done["result"];
        } catch {
          /* leave empty */
        }
        done.push({
          name: call?.name ?? "?",
          input: call?.input,
          isError: Boolean(b.isError),
          result,
        });
      }
    }
  }
  return { text, done };
}

type Step = { call: { name: string; input: unknown } } | { text: string };
const call = (name: string, input: unknown): Step => ({ call: { name, input } });
const say = (text: string): Step => ({ text });

const OBJECTIVES: Array<[RegExp, string]> = [
  [/pick.?and.?roll/, "pick_and_roll"],
  [/ball.?handling|dribbl/, "ball_handling"],
  [/transition|fast.?break/, "transition"],
  [/team defen[cs]e|help defen[cs]e/, "team_defense"],
  [/team offen[cs]e/, "team_offense"],
  [/defen[cs]e|defending/, "defense"],
  [/rebound/, "rebounding"],
  [/finishing|layup/, "finishing"],
  [/footwork/, "footwork"],
  [/passing/, "passing"],
  [/shooting|shoot/, "shooting"],
  [/conditioning|fitness/, "conditioning"],
  [/decision/, "decision_making"],
];
const objectiveOf = (t: string) => OBJECTIVES.find(([re]) => re.test(t))?.[1];
const numberOf = (t: string, re: RegExp) => {
  const m = re.exec(t);
  return m ? Number(m[1]) : undefined;
};
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, six: 6 };

type ActivityView = {
  id: string;
  kind: string;
  title: string;
  phase: string | null;
  locked: boolean;
  drillId: string | null;
  diagrams: number;
};
const activitiesOf = (done: Done[]): ActivityView[] => {
  const s = done.find((d) => d.name === "get_session" && !d.isError);
  return ((s?.result as { activities?: ActivityView[] } | undefined)?.activities ??
    []) as ActivityView[];
};
const failureText = (d: Done | undefined) =>
  d?.isError
    ? `I could not do that: ${String(d.result.message ?? d.result.error ?? "the request was refused")}`
    : null;

const THREE_V_TWO = {
  schemaVersion: 1,
  sport: "basketball",
  court: { type: "full", variant: "fiba" },
  entities: [
    { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "center_circle" } },
    {
      id: "o2",
      type: "player",
      side: "offense",
      label: "2",
      at: { anchor: "center_circle", offset: [-4.5, 0.3] },
    },
    {
      id: "o3",
      type: "player",
      side: "offense",
      label: "3",
      at: { anchor: "center_circle", offset: [4.5, 0.3] },
    },
    { id: "x1", type: "player", side: "defense", label: "X1", at: { x: 0, y: 19.6 } },
    { id: "x2", type: "player", side: "defense", label: "X2", at: { x: 0, y: 22.6 } },
    { id: "b1", type: "ball", heldBy: "o1" },
  ],
  actions: [
    { id: "a1", step: 1, type: "dribble", entity: "o1", path: [{ x: 0, y: 15 }] },
    { id: "a2", step: 2, type: "pass", from: "o1", to: "o2" },
    { id: "a3", step: 3, type: "shot", entity: "o2", to: { anchor: "far_basket" } },
  ],
  annotations: [],
};

function plan(text: string, done: Done[]): Step {
  const t = text.toLowerCase();
  const n = done.length;
  const last = done[n - 1];

  // ---- deliberate misbehaviour (tested) -------------------------------------------------------------------------------
  if (t.includes("[[malformed]]"))
    return n === 0
      ? call("add_activity", { drillId: "not-a-uuid" })
      : say("Sorry, that did not work.");
  if (t.includes("[[hallucinate]]"))
    return n === 0
      ? call("add_activity", { drillId: FAKE_ID })
      : say("I could not add that drill.");
  if (t.includes("[[unknowntool]]"))
    return n === 0 ? call("delete_everything", {}) : say("That tool does not exist.");
  if (t.includes("[[injection]]"))
    return n === 0
      ? call("create_diagram", {
          activityId: FAKE_ID,
          diagram: { svg: "<svg onload=alert(1)>", html: "<script>alert(1)</script>" },
        })
      : say("The diagram was not valid.");
  if (t.includes("[[svg]]"))
    return n === 0
      ? call("update_diagram", {
          activityId: FAKE_ID,
          ops: [{ op: "run_script", code: "alert(1)" }],
        })
      : say("Those changes were not valid.");
  if (t.includes("[[loop]]")) return call("get_objectives", {});

  // ---- explaining a drill: look it up, then quote it ----------------------------------------------------------------------
  const explain = /\b(explain|how do i (run|coach)|tell me about|what is)\b\s*(the\s+)?(.*)/.exec(
    t,
  );
  if (explain && !/session|diagram/.test(t)) {
    const subject = (explain[4] ?? "").replace(/\bdrill\b|\?|\./g, "").trim() || "drill";
    if (n === 0) return call("search_drills", { query: subject, limit: 3 });
    if (n === 1) {
      const first = (done[0]!.result.drills as Array<{ id: string }> | undefined)?.[0];
      return first
        ? call("get_drill", { drillId: first.id })
        : say(`I could not find “${subject}” in CoachOS, so I will not guess how to run it.`);
    }
    const d = done[1]!.result as {
      title?: string;
      objective?: string;
      instructions?: string[];
      coachingPoints?: string[];
    };
    if (done[1]!.isError) return say("I could not read that drill.");
    return say(
      `From the CoachOS drill “${d.title}”: ${d.objective} Steps: ${(d.instructions ?? []).slice(0, 2).join(" ")} Coaching points: ${(d.coachingPoints ?? []).slice(0, 2).join(" ")}\n\nMy own suggestion: keep the group moving and give one coaching point at a time.`,
    );
  }

  // ---- a new session ----------------------------------------------------------------------------------------------------
  const wantsNew =
    /\b(new session|create (a |an )?(\d+[- ]?min\w* )?session|generate (a |an )?session|build (a |an )?session|session for\b|plan (a |an )?session|prepare (a |an )?session)/.test(
      t,
    );
  if (wantsNew) {
    if (n === 0) {
      const objective = objectiveOf(t);
      if (!objective)
        return say(
          "Which objective should the session focus on: shooting, ball handling, passing, defense, transition…?",
        );
      const players = numberOf(t, /(\d+)\s*players?/) ?? 12;
      const durationMin = numberOf(t, /(\d+)\s*[- ]?\s*(?:min|minute)/) ?? 60;
      const age = /\bu(\d{1,2})\b/.exec(t);
      const level = /\b(beginner|intermediate|advanced)\b/.exec(t)?.[1];
      const basketsWord = /\b(one|two|three|four|six|\d+)\s+baskets?\b/.exec(t)?.[1];
      const baskets = basketsWord ? (WORDS[basketsWord] ?? Number(basketsWord)) : undefined;
      return call("create_session", {
        objective,
        players,
        durationMin,
        ...(age ? { ageGroup: `u${age[1]}` } : {}),
        ...(level ? { level } : {}),
        ...(baskets ? { baskets } : {}),
      });
    }
    return failureText(last)
      ? say(failureText(last)!)
      : say(
          "I prepared a session for you from CoachOS drills. Review it below and create it when you are happy with it.",
        );
  }

  // ---- diagrams -----------------------------------------------------------------------------------------------------------
  if (/\bdiagram\b/.test(t)) {
    if (n === 0) return call("get_session", {});
    const list = activitiesOf(done);
    if (done[0]!.isError) return say(failureText(done[0]) ?? "I need a session open.");
    const named = list.find((a) => a.kind !== "break" && t.includes(a.title.toLowerCase()));
    if (/add (a )?defender/.test(t)) {
      const target = named ?? list.find((a) => a.diagrams > 0);
      if (!target) return say("None of the activities has a diagram to change.");
      if (n === 1)
        return call("update_diagram", {
          activityId: target.id,
          ops: [{ op: "add_player", side: "defense", at: { anchor: "left_wing" } }],
        });
      return say(
        failureText(last) ??
          "I prepared the change to the diagram. Review it and apply it if it looks right.",
      );
    }
    const target = named ?? list.find((a) => a.kind !== "break");
    if (!target) return say("There is no activity to draw a diagram for.");
    if (n === 1)
      return call("create_diagram", {
        activityId: target.id,
        title: "3-on-2 attack",
        diagram: THREE_V_TWO,
      });
    return say(
      failureText(last) ??
        "I drew a 3-on-2 attack as a diagram. Review it and apply it if it looks right.",
    );
  }

  // ---- changing the session ----------------------------------------------------------------------------------------------
  if (/\b(validate|check)\b.*\bsession\b|\bis (my|the) session\b/.test(t)) {
    if (n === 0) return call("validate_session", {});
    const issues = (done[0]!.result.issues as unknown[] | undefined)?.length ?? 0;
    return say(
      failureText(done[0]) ??
        `I checked the session against CoachOS rules and found ${issues} ${issues === 1 ? "point" : "points"} to look at.`,
    );
  }

  if (/\bcustom activity\b|\bown drill\b|\bmake up\b|\binvent\b|\bcreate a new drill\b/.test(t)) {
    if (n === 0)
      return call("create_custom_activity", {
        title: "Two-line finishing relay",
        durationMin: 10,
        phase: "skill",
        description: "A relay in two lines finishing at the rim.",
        instructions: [
          "Split into two lines.",
          "First in line dribbles and finishes.",
          "Rebound and pass to the next.",
        ],
        coachingPoints: ["Eyes up.", "Finish with the correct hand."],
      });
    return say(
      failureText(last) ??
        "I wrote a custom activity. It is my own suggestion, not a CoachOS drill — review it before you use it.",
    );
  }

  if (/\badd (a |an )?break\b/.test(t))
    return n === 0
      ? call("add_break", { durationMin: 5, title: "Water break" })
      : say(failureText(last) ?? "I prepared a short break.");

  const minutes = numberOf(t, /(\d+)\s*(?:min|minutes)/);
  if (
    minutes &&
    /(shorten|extend|longer|shorter|change (the )?(duration|length)|make (it|the session)|to \d+ ?min)/.test(
      t,
    )
  )
    return n === 0
      ? call("change_duration", { totalMinutes: minutes })
      : say(
          failureText(last) ??
            `I worked out how to fit the session into ${minutes} minutes. Review every change before you apply it.`,
        );

  const players = numberOf(t, /(\d+)\s*players?/);
  if (players && /(now|instead|only|change|but|with)/.test(t))
    return n === 0
      ? call("change_player_count", { players })
      : say(
          failureText(last) ??
            `I checked the session for ${players} players. Review the notes below before you apply it.`,
        );

  const newObjective = /objective\s*(?:to|is|:)\s*(.+)/.exec(t);
  if (newObjective) {
    const key = objectiveOf(newObjective[1]!);
    if (!key) return say("I do not know that objective.");
    return n === 0
      ? call("change_objectives", { primary: key, secondary: [] })
      : say(failureText(last) ?? "I prepared the change of objective.");
  }

  if (/\b(remove|delete|drop)\b/.test(t)) {
    if (n === 0) return call("get_session", {});
    if (done[0]!.isError) return say(failureText(done[0])!);
    const words = t
      .replace(/.*\b(remove|delete|drop)\b/, "")
      .replace(/\b(the|a|drill|activity|please)\b/g, "")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const target = activitiesOf(done).find((a) =>
      words.some((w) => a.title.toLowerCase().includes(w)),
    );
    if (!target) return say("I could not tell which activity you mean. Which one should I remove?");
    if (n === 1) return call("remove_activity", { activityId: target.id });
    return say(
      failureText(last) ?? `I prepared removing “${target.title}”. You will be asked to confirm.`,
    );
  }

  if (/\b(reorgani[sz]e|reorder|rearrange)\b/.test(t)) {
    if (n === 0) return call("get_session", {});
    if (done[0]!.isError) return say(failureText(done[0])!);
    const movable = activitiesOf(done).filter((a) => !a.locked && a.kind !== "break");
    const target = movable[movable.length - 1];
    if (!target) return say("Every activity is locked, so I will leave the order alone.");
    if (n === 1) return call("reorder_activity", { activityId: target.id, toPosition: 0 });
    return say(failureText(last) ?? `I prepared moving “${target.title}” to the start.`);
  }

  if (/\b(harder|easier|swap|replace|more challenging|less demanding)\b/.test(t)) {
    if (n === 0) return call("get_session", {});
    if (done[0]!.isError) return say(failureText(done[0])!);
    const list = activitiesOf(done);
    const named = list.find((a) => a.kind === "drill" && t.includes(a.title.toLowerCase()));
    const movable = list.filter((a) => a.kind === "drill" && !a.locked);
    const target =
      named ?? movable.find((a) => a.phase !== "warm_up" && a.phase !== "cool_down") ?? movable[0];
    if (!target)
      return say("Every drill in the session is locked, so I have nothing I may change.");
    const intensity = /harder|challenging/.test(t)
      ? "high"
      : /easier|less/.test(t)
        ? "low"
        : undefined;
    if (n === 1) return call("search_drills", { ...(intensity ? { intensity } : {}), limit: 8 });
    const drills =
      (done[1]!.result.drills as Array<{ id: string; title: string }> | undefined) ?? [];
    const inSession = new Set(list.map((a) => a.drillId));
    const pick = drills.find((d) => !inSession.has(d.id));
    if (!pick) return say("I could not find a better drill for that block in CoachOS.");
    if (n === 2) return call("replace_activity", { activityId: target.id, drillId: pick.id });
    return say(
      failureText(last) ??
        `I suggest replacing “${target.title}” with “${pick.title}”. You will be asked to confirm.`,
    );
  }

  const addDrill =
    /\badd (?:a |an |one )?(.*?)\s*(?:drill|game|exercise)\b/.exec(t) ??
    (/\b(progression|regression|competitive game)\b/.test(t) ? [t, "game"] : null);
  if (addDrill) {
    const query = (addDrill[1] ?? "").trim() || "game";
    if (n === 0) return call("search_drills", { query, limit: 3 });
    const first = (done[0]!.result.drills as Array<{ id: string; title: string }> | undefined)?.[0];
    if (!first) return say(`I could not find a “${query}” drill in CoachOS.`);
    if (n === 1) return call("add_activity", { drillId: first.id });
    return say(failureText(last) ?? `I suggest adding “${first.title}”. Apply it if you agree.`);
  }

  return say(
    "I can build a session for you, change the one you have open, explain a drill, or draw a diagram. For example: “Create a 60 minute shooting session for 12 players U14”.",
  );
}

/** Wait until aborted (used to test cancelling), or give up after a while. */
const stall = (signal?: AbortSignal) =>
  new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new AiFailure("timeout", "stalled")), 30_000);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new AiFailure("cancelled", "cancelled"));
    });
  });

let counter = 0;
export const scriptedProvider: AiProvider = {
  id: "scripted",
  async complete(req: CompletionRequest): Promise<Completion> {
    const { text, done } = readTurn(req.messages);
    if (text.toLowerCase().includes("[[slow]]")) await stall(req.signal);
    if (text.toLowerCase().includes("[[fail]]")) throw new AiFailure("failed", "scripted failure");
    if (text.toLowerCase().includes("[[refuse]]"))
      return {
        content: [{ type: "text", text: "" }],
        stopReason: "refusal",
        usage: { inputTokens: 10, outputTokens: 0 },
      };
    const step = plan(text, done);
    const usage = { inputTokens: 200 + text.length, outputTokens: 40 };
    if ("call" in step)
      return {
        content: [
          {
            type: "tool_use",
            id: `toolu_scripted_${++counter}`,
            name: step.call.name,
            input: step.call.input,
          },
        ],
        stopReason: "tool_use",
        usage,
      };
    return { content: [{ type: "text", text: step.text }], stopReason: "end_turn", usage };
  },
};
