"use server";

import { revalidatePath } from "next/cache";
import type { Actor } from "@/lib/authz/can";
import { AppError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { fail, type FormState, type Result } from "@/lib/result";
import { requireViewer } from "@/modules/identity";
import { isSportKey } from "@/sports/registry";
import {
  createPlayer,
  createTeam,
  deletePlayer,
  deleteTeam,
  restorePlayer,
  restoreTeam,
  updatePlayer,
  updateTeam,
} from "./commands";
import { playerInputSchema, teamInputSchema } from "./validators";

/**
 * Server Actions for the roster (ARCHITECTURE.md §18.2): authenticate → parse (Zod) → command (authorize,
 * validate, transaction + audit) → revalidate → Result. Each re-authenticates: hiding a button is UX, not
 * security.
 */

type Done = Result<{ id: string; version: number }>;

function refresh() {
  revalidatePath("/roster", "layout");
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function fieldsOf(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    (fields[path] ??= []).push(issue.message);
  }
  return fields;
}

async function run<T>(scope: string, ids: string[], command: (actor: Actor) => Promise<Result<T>>) {
  const { actor } = await requireViewer();
  if (!ids.every(isUuid)) return fail("NOT_FOUND");
  try {
    const result = await command(actor);
    if (result.ok) refresh();
    return result;
  } catch (err) {
    if (err instanceof AppError) return fail(err.code);
    logger.error({ err: err instanceof Error ? err.message : String(err), scope }, "action.failed");
    return fail("INTERNAL");
  }
}

export async function createTeamAction(sportKey: string, raw: unknown): Promise<Done> {
  if (!isSportKey(sportKey)) return fail("VALIDATION", { fields: { sportKey: ["invalid"] } });
  const parsed = teamInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", { fields: fieldsOf(parsed.error) });
  return run("team.create", [], (a) => createTeam(a, sportKey, parsed.data));
}

export async function updateTeamAction(id: string, raw: unknown): Promise<Done> {
  const parsed = teamInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", { fields: fieldsOf(parsed.error) });
  return run("team.update", [id], (a) => updateTeam(a, id, parsed.data));
}

export async function deleteTeamAction(id: string): Promise<Done> {
  return run("team.delete", [id], (a) => deleteTeam(a, id));
}

export async function restoreTeamAction(id: string): Promise<Done> {
  return run("team.restore", [id], (a) => restoreTeam(a, id));
}

export async function createPlayerAction(raw: unknown): Promise<Done> {
  const parsed = playerInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", { fields: fieldsOf(parsed.error) });
  return run("player.create", [], (a) => createPlayer(a, parsed.data));
}

export async function updatePlayerAction(id: string, raw: unknown): Promise<Done> {
  const parsed = playerInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", { fields: fieldsOf(parsed.error) });
  return run("player.update", [id], (a) => updatePlayer(a, id, parsed.data));
}

export async function deletePlayerAction(id: string): Promise<Done> {
  return run("player.delete", [id], (a) => deletePlayer(a, id));
}

export async function restorePlayerAction(id: string): Promise<Done> {
  return run("player.restore", [id], (a) => restorePlayer(a, id));
}

type DoneState = FormState<{ id: string; version: number }>;

/** Form-friendly wrappers for `useActionState`: build the raw input from FormData, keep the submitted values on failure. */
export async function createTeamFormAction(_prev: DoneState, fd: FormData): Promise<DoneState> {
  const sportKey = str(fd, "sportKey");
  const values = { name: str(fd, "name"), notes: str(fd, "notes"), sportKey };
  const result = await createTeamAction(sportKey, { name: values.name, notes: values.notes });
  return result.ok ? result : { ...result, values };
}

export async function createPlayerFormAction(_prev: DoneState, fd: FormData): Promise<DoneState> {
  const classificationStr = str(fd, "classification");
  const values = {
    name: str(fd, "name"),
    teamId: str(fd, "teamId"),
    dateOfBirth: str(fd, "dateOfBirth"),
    classification: classificationStr,
    notes: str(fd, "notes"),
  };
  const raw = {
    ...values,
    classification: classificationStr === "" ? "" : Number(classificationStr),
  };
  const result = await createPlayerAction(raw);
  return result.ok ? result : { ...result, values };
}

/** Create or update, depending on whether the form carries an existing id (an edit form pre-fills it). */
export async function saveTeamFormAction(_prev: DoneState, fd: FormData): Promise<DoneState> {
  const id = str(fd, "id");
  if (!id) return createTeamFormAction(_prev, fd);
  const values = { name: str(fd, "name"), notes: str(fd, "notes") };
  const version = Number(str(fd, "version")) || undefined;
  const result = await updateTeamAction(id, { ...values, version });
  return result.ok ? result : { ...result, values };
}

export async function savePlayerFormAction(_prev: DoneState, fd: FormData): Promise<DoneState> {
  const id = str(fd, "id");
  if (!id) return createPlayerFormAction(_prev, fd);
  const classificationStr = str(fd, "classification");
  const values = {
    name: str(fd, "name"),
    teamId: str(fd, "teamId"),
    dateOfBirth: str(fd, "dateOfBirth"),
    classification: classificationStr,
    notes: str(fd, "notes"),
  };
  const version = Number(str(fd, "version")) || undefined;
  const raw = {
    ...values,
    classification: classificationStr === "" ? "" : Number(classificationStr),
    version,
  };
  const result = await updatePlayerAction(id, raw);
  return result.ok ? result : { ...result, values };
}
