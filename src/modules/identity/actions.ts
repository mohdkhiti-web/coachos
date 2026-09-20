"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/result";
import { fail, ok } from "@/lib/result";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { can } from "@/lib/authz/can";
import { renameWorkspace } from "@/modules/organizations";
import { completeOnboarding, updatePreferences, updateProfile } from "./commands";
import { revokeOwnSession } from "./queries";
import { requireViewer } from "./viewer";
import {
  fieldErrors,
  onboardingSchema,
  preferencesSchema,
  profileSchema,
  workspaceSchema,
} from "./validators";

/**
 * Server Actions for account data (ARCHITECTURE.md §18.2). Shape, every time:
 *   authenticate → parse (Zod) → authorize (inside the command via can()) → transaction+audit → revalidate → Result
 *
 * Sign-in / sign-up / password flows are NOT here: they go through Better Auth's HTTP endpoints
 * (client SDK) so that its built-in database rate limiter applies to them.
 *
 * Every action re-authenticates: hiding a form in the UI is UX, not security.
 */

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

function unexpected(scope: string, err: unknown): Result {
  if (err instanceof AppError) return fail(err.code);
  logger.error({ err: err instanceof Error ? err.message : String(err), scope }, "action.failed");
  return fail("INTERNAL");
}
type Result = ReturnType<typeof fail>;

export async function completeOnboardingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { actor } = await requireViewer({ onboarding: "skip" });
  const raw = {
    name: str(formData, "name"),
    profession: str(formData, "profession"),
    timezone: str(formData, "timezone"),
  };
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success)
    return fail("VALIDATION", { fields: fieldErrors(parsed.error), values: raw });
  try {
    await completeOnboarding(actor, parsed.data);
  } catch (err) {
    return unexpected("onboarding", err);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { actor } = await requireViewer();
  const raw = {
    name: str(formData, "name"),
    profession: str(formData, "profession"),
    timezone: str(formData, "timezone"),
  };
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success)
    return fail("VALIDATION", { fields: fieldErrors(parsed.error), values: raw });
  try {
    await updateProfile(actor, parsed.data);
  } catch (err) {
    return unexpected("profile", err);
  }
  revalidatePath("/", "layout"); // the shell (user menu) shows the name; layouts don't re-render on navigation
  return ok();
}

export async function updatePreferencesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { actor } = await requireViewer();
  const raw = { units: str(formData, "units") };
  const parsed = preferencesSchema.safeParse(raw);
  if (!parsed.success)
    return fail("VALIDATION", { fields: fieldErrors(parsed.error), values: raw });
  try {
    await updatePreferences(actor, parsed.data);
  } catch (err) {
    return unexpected("preferences", err);
  }
  revalidatePath("/", "layout");
  return ok();
}

export async function renameWorkspaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { actor } = await requireViewer();
  const raw = { workspaceName: str(formData, "workspaceName") };
  const parsed = workspaceSchema.safeParse(raw);
  if (!parsed.success)
    return fail("VALIDATION", { fields: fieldErrors(parsed.error), values: raw });
  if (!can(actor, "organization:update", { organizationId: actor.organizationId }))
    return fail("FORBIDDEN");
  try {
    await renameWorkspace(actor, parsed.data.workspaceName);
  } catch (err) {
    return unexpected("workspace", err);
  }
  revalidatePath("/", "layout");
  return ok();
}

/** Revoke another device. The id is resolved to the secret token server-side and must be one of the actor's own. */
export async function revokeSessionAction(sessionId: string): Promise<FormState> {
  const { actor } = await requireViewer();
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 64)
    return fail("VALIDATION");
  try {
    const outcome = await revokeOwnSession(actor, sessionId);
    if (outcome === "not_found") return fail("NOT_FOUND");
    if (outcome === "is_current") return fail("CONFLICT");
  } catch (err) {
    return unexpected("revoke-session", err);
  }
  revalidatePath("/settings/security");
  return ok();
}
