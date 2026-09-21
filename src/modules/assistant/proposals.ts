import { z } from "zod";
import { DRILL_PHASES } from "@/db/enums";
import { diagramSchema } from "@/engines/diagram";

/**
 * What the assistant PROPOSES (Step 8). A proposal is a small, validated data structure that describes one change to one
 * session, in words the interface can translate — never model output as such and never anything executable. It changes
 * nothing until the coach applies it; applying re-checks it against the session as it is THEN and goes through the normal
 * commands (`apply.ts`). Proposals are stored inside the assistant's messages, so a coach can come back to them later.
 *
 * Pure (no server imports): the chat screen reads these types and schemas directly.
 */

/** `applying` is transient: it claims the proposal for one click, so a double click (or two tabs) cannot apply it twice. */
export const PROPOSAL_STATUSES = ["pending", "applying", "applied", "dismissed", "failed"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const id = z.string().min(8).max(64);
const uuid = z.uuid();
const title = z.string().trim().min(1).max(120);
const minutes = z.int().min(1).max(480);
const phase = z.enum(DRILL_PHASES).nullable();

const item = z.strictObject({
  kind: z.enum(["drill", "break"]),
  drillId: uuid.nullable(),
  title: z.string().max(120),
  phase,
  durationMin: minutes,
  locked: z.boolean(),
});

const issue = z.strictObject({
  code: z.string().max(40),
  severity: z.enum(["error", "warning"]),
  values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  at: z.int().optional(),
});

const activityPatch = z.strictObject({
  title: title.optional(),
  phase: phase.optional(),
  durationMin: minutes.optional(),
  players: z.int().min(1).max(60).nullable().optional(),
  repetitions: z.int().min(1).max(99).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const shared = {
  id,
  status: z.enum(PROPOSAL_STATUSES),
  error: z.string().max(40).optional(),
  /** When it was claimed for applying (ISO 8601): a claim older than a minute is treated as abandoned. */
  claimedAt: z.iso.datetime().optional(),
};

export const proposalSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...shared,
    kind: z.literal("create_session"),
    /** The request as the generator checked it (re-validated by the generator when applied); the screen reads a few fields. */
    requirements: z.looseObject({
      title: z.string().max(120),
      players: z.int().min(1).max(60),
      durationMin: z.int().min(1).max(480),
      primaryObjective: z.string().max(60),
    }),
    extras: z.record(z.string(), z.unknown()),
    items: z.array(item).min(1).max(40),
    issues: z.array(issue).max(60),
    /** Set once the session exists. */
    createdPlanId: uuid.optional(),
  }),
  z.strictObject({
    ...shared,
    kind: z.literal("add_drill"),
    planId: uuid,
    drillId: uuid,
    title,
    phase,
    durationMin: minutes,
    position: z.int().min(0).max(60).nullable(),
  }),
  z.strictObject({
    ...shared,
    kind: z.literal("replace_drill"),
    planId: uuid,
    activityId: uuid,
    activityTitle: title,
    drillId: uuid,
    title,
  }),
  z.strictObject({
    ...shared,
    kind: z.literal("remove_activity"),
    planId: uuid,
    activityId: uuid,
    title,
  }),
  z.strictObject({
    ...shared,
    kind: z.literal("update_activity"),
    planId: uuid,
    activityId: uuid,
    title,
    patch: activityPatch,
  }),
  z.strictObject({
    ...shared,
    kind: z.literal("reorder_activity"),
    planId: uuid,
    activityId: uuid,
    title,
    toPosition: z.int().min(0).max(60),
  }),
  z.strictObject({
    ...shared,
    kind: z.literal("set_durations"),
    planId: uuid,
    changes: z
      .array(z.strictObject({ activityId: uuid, title, from: minutes, to: minutes }))
      .min(1)
      .max(40),
  }),
  z.strictObject({
    ...shared,
    kind: z.literal("update_plan"),
    planId: uuid,
    players: z.int().min(1).max(60).optional(),
    primaryObjective: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,40}$/)
      .optional(),
    secondaryObjectives: z
      .array(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/))
      .max(4)
      .optional(),
    /** What re-checking the session against the change found (informational). */
    issues: z.array(issue).max(60).default([]),
  }),
  z.strictObject({
    ...shared,
    kind: z.literal("add_custom"),
    planId: uuid,
    title,
    phase,
    durationMin: minutes,
    description: z.string().trim().max(2000),
    instructions: z.array(z.string().trim().min(1).max(500)).max(20),
    coachingPoints: z.array(z.string().trim().min(1).max(500)).max(20),
    position: z.int().min(0).max(60).nullable(),
  }),
  z.strictObject({
    ...shared,
    kind: z.literal("add_break"),
    planId: uuid,
    title,
    durationMin: minutes,
    position: z.int().min(0).max(60).nullable(),
  }),
  z.strictObject({
    ...shared,
    kind: z.literal("set_diagram"),
    planId: uuid,
    activityId: uuid,
    title,
    diagramTitle: z.string().trim().max(60),
    diagram: diagramSchema,
    /** True when the activity already has this diagram: applying replaces it. */
    replacing: z.boolean(),
    /** Which of the activity's diagrams (0 = the first). */
    index: z.int().min(0).max(4),
  }),
]);
export type Proposal = z.output<typeof proposalSchema>;
export type ProposalKind = Proposal["kind"];

/** Changes that remove, replace or rewrite something the coach already has: applying needs an explicit confirmation. */
export function isDestructive(p: Proposal): boolean {
  switch (p.kind) {
    case "remove_activity":
    case "replace_drill":
    case "set_durations":
      return true;
    case "set_diagram":
      return p.replacing;
    default:
      return false;
  }
}

/** A drill the assistant's answer refers to, so the screen can tell CoachOS content from the assistant's own suggestions. */
const source = z.strictObject({ drillId: uuid, title });

export const MESSAGE_SCHEMA_VERSION = 1 as const;

export const messageContentSchema = z.strictObject({
  schemaVersion: z.literal(MESSAGE_SCHEMA_VERSION),
  text: z.string().max(12_000),
  proposals: z.array(proposalSchema).max(12).default([]),
  /** Real CoachOS drills the answer is based on (looked up, not remembered). */
  sources: z.array(source).max(12).default([]),
  /** For an assistant message that could not be completed: why, as a code the interface translates. */
  problem: z
    .enum([
      "unavailable",
      "rate_limited",
      "daily_limit",
      "timeout",
      "cancelled",
      "failed",
      "refused",
    ])
    .optional(),
  /** What the person had open when they asked (session, activity), for the chip above the message. */
  context: z
    .strictObject({
      planId: uuid.nullable(),
      planTitle: z.string().max(120).nullable(),
    })
    .optional(),
});
export type MessageContent = z.output<typeof messageContentSchema>;
