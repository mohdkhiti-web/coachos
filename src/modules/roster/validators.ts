import { z } from "zod";
import { ROSTER_STATUSES } from "@/db/enums";

/**
 * Input schemas for the roster commands (the Server Action payloads). Pure and client-safe.
 * Messages are i18n keys (`validation.*`).
 *
 * `classification` is deliberately just a bounded number with no further meaning attached here: this
 * module stores and displays it, nothing else reads it (ARCHITECTURE.md §22 — never assume classification
 * alone determines a player's ability or exercise needs).
 */

export const teamInputSchema = z.strictObject({
  name: z.string().trim().min(1, { error: "required" }).max(80, { error: "too_long" }),
  notes: z.string().trim().max(1000, { error: "too_long" }).default(""),
  status: z.enum(ROSTER_STATUSES).default("active"),
  /** Present on updates: the version the page loaded (optimistic concurrency). */
  version: z.int().min(1).optional(),
});
export type TeamInput = z.output<typeof teamInputSchema>;
export type TeamInputRaw = z.input<typeof teamInputSchema>;

export const playerInputSchema = z.strictObject({
  name: z.string().trim().min(1, { error: "required" }).max(80, { error: "too_long" }),
  /** "" = unassigned. */
  teamId: z.union([z.literal(""), z.uuid()]).default(""),
  dateOfBirth: z.union([z.literal(""), z.iso.date()]).default(""),
  /** "" = not recorded. Otherwise a functional-classification point value, 1.0–4.5 in 0.5 steps. */
  classification: z
    .union([
      z.literal(""),
      z
        .number()
        .min(1, { error: "range_invalid" })
        .max(4.5, { error: "range_invalid" })
        .multipleOf(0.5, { error: "range_invalid" }),
    ])
    .default(""),
  notes: z.string().trim().max(1000, { error: "too_long" }).default(""),
  status: z.enum(ROSTER_STATUSES).default("active"),
  version: z.int().min(1).optional(),
});
export type PlayerInput = z.output<typeof playerInputSchema>;
export type PlayerInputRaw = z.input<typeof playerInputSchema>;
