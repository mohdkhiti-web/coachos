import { z } from "zod";

/**
 * What a coach-written activity carries: text the coach typed (a description, steps, coaching points). Pure and
 * free of any server-only import, so the browser can validate with the very same schema the server enforces.
 * The stored form (`customSnapshotSchema` in snapshot.ts) is this plus a `schemaVersion`.
 */

const items = (max: number) => z.array(z.string().trim().min(1).max(500)).max(max);

export const customContentShape = {
  description: z.string().trim().max(2000, { error: "too_long" }).default(""),
  instructions: items(20).default([]),
  coachingPoints: items(20).default([]),
};

export const customContentSchema = z.strictObject(customContentShape);

export type CustomContent = z.output<typeof customContentSchema>;
