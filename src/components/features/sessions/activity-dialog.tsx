"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { FormError } from "@/components/features/auth/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DRILL_PHASES, PLAN_LIMITS } from "@/db/enums";
import type { Result } from "@/lib/result";
import {
  addBreakSchema,
  addCustomActivitySchema,
  updateActivitySchema,
} from "@/modules/plans/validators";
import type { BuilderActivity } from "./builder-model";
import { fieldsFromServer, type FieldErrors } from "./session-model";

export type ActivityDialogMode =
  { kind: "edit"; activity: BuilderActivity } | { kind: "custom" } | { kind: "break" };

type Values = {
  title: string;
  phase: string;
  durationMin: string;
  players: string;
  repetitions: string;
  notes: string;
  description: string;
  instructions: string;
  coachingPoints: string;
};

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** "" → null, "12" → 12, anything else is passed on as text so the schema REJECTS it (never guessed). */
const num = (s: string): number | string | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
};

function initialValues(mode: ActivityDialogMode): Values {
  if (mode.kind === "edit") {
    const a = mode.activity;
    return {
      title: a.title,
      phase: a.phase ?? "",
      durationMin: String(a.durationMin),
      players: a.players === null ? "" : String(a.players),
      repetitions: a.repetitions === null ? "" : String(a.repetitions),
      notes: a.notes,
      description: a.custom?.description ?? "",
      instructions: (a.custom?.instructions ?? []).join("\n"),
      coachingPoints: (a.custom?.coachingPoints ?? []).join("\n"),
    };
  }
  return {
    title: "",
    phase: "",
    durationMin: mode.kind === "break" ? "3" : "10",
    players: "",
    repetitions: "",
    notes: "",
    description: "",
    instructions: "",
    coachingPoints: "",
  };
}

/**
 * The one form behind "Edit", "+ Custom activity" and "+ Break". It checks with the server's own schemas for
 * speed, then WAITS for the server's answer before closing, so a refusal (a session that would run too long, a
 * session changed elsewhere) is shown next to what the coach typed instead of losing it.
 */
export function ActivityDialog({
  mode,
  onClose,
  returnFocus,
  otherMinutes,
  onSubmit,
}: {
  mode: ActivityDialogMode;
  onClose: () => void;
  /** Called as the dialog closes: put focus back on the control that opened it. */
  returnFocus?: () => void;
  /** Minutes of all the OTHER activities, to keep the session within its maximum length. */
  otherMinutes: number;
  /** Receives the payload WITHOUT the version (the queue adds it). */
  onSubmit: (payload: Record<string, unknown>) => Promise<Result<unknown>>;
}) {
  const t = useTranslations("sessions.activity");
  const td = useTranslations("drills");
  const tv = useTranslations("validation");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [v, setV] = React.useState(() => initialValues(mode));
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const isBreak = mode.kind === "break" || (mode.kind === "edit" && mode.activity.kind === "break");
  const isCustom =
    mode.kind === "custom" || (mode.kind === "edit" && mode.activity.kind === "custom");
  const isDrill = mode.kind === "edit" && mode.activity.kind === "drill";
  const set = (patch: Partial<Values>) => setV((prev) => ({ ...prev, ...patch }));
  const text = (path: string) => {
    const list = (errors[path] ?? []).map((k) => (tv.has(k) ? tv(k) : tv("invalid")));
    return list.length ? list : undefined;
  };

  const title =
    mode.kind === "custom" ? t("addCustom") : mode.kind === "break" ? t("addBreak") : t("edit");

  function payload(): Record<string, unknown> {
    const base = { durationMin: num(v.durationMin) ?? "", notes: v.notes };
    if (isBreak)
      return { ...base, title: v.title.trim() || (mode.kind === "break" ? undefined : v.title) };
    const common = {
      ...base,
      title: v.title,
      phase: v.phase === "" ? null : v.phase,
      players: num(v.players),
      repetitions: num(v.repetitions),
    };
    return isCustom
      ? {
          ...common,
          content: {
            description: v.description,
            instructions: lines(v.instructions),
            coachingPoints: lines(v.coachingPoints),
          },
        }
      : common;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFailure(null);
    const body = payload();
    // the same schemas the server enforces (without the version, which the queue adds)
    const schema =
      mode.kind === "edit"
        ? updateActivitySchema.omit({ version: true })
        : mode.kind === "custom"
          ? addCustomActivitySchema.omit({ version: true, position: true })
          : addBreakSchema.omit({ version: true, position: true });
    const parsed = schema.safeParse(body);
    const local: FieldErrors = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        (local[String(issue.path[0])] ??= []).push(issue.message);
    const minutes = Number(v.durationMin);
    if (
      !local.durationMin &&
      Number.isFinite(minutes) &&
      otherMinutes + minutes > PLAN_LIMITS.maxSessionMinutes
    )
      local.durationMin = ["session_too_long"];
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setFailure("VALIDATION");
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await onSubmit(
        parsed.success ? (parsed.data as Record<string, unknown>) : body,
      );
      if (result?.ok) {
        onClose();
        return;
      }
      const code = result && !result.ok ? result.error.code : "INTERNAL";
      setErrors(fieldsFromServer(result && !result.ok ? result.error.fields : undefined));
      setFailure(code);
    });
  }

  const failureText =
    failure === "VALIDATION"
      ? t("fixErrors")
      : failure === "CONFLICT"
        ? t("conflict")
        : failure
          ? te.has(failure)
            ? te(failure)
            : te("generic")
          : null;

  return (
    <Dialog open onOpenChange={(open) => (!open && !pending ? onClose() : undefined)}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault(); // Radix has no trigger to return to; the builder remembers the opener
          returnFocus?.();
        }}
        title={title}
        description={isDrill ? t("editDrillNote") : undefined}
        closeLabel={tc("close")}
        className="max-w-lg"
      >
        <form onSubmit={submit} noValidate aria-busy={pending} className="space-y-4">
          <Field label={isBreak ? t("breakTitle") : t("title")} errors={text("title")}>
            {(c) => (
              <Input
                {...c}
                name="title"
                value={v.title}
                maxLength={120}
                placeholder={isBreak ? t("breakPlaceholder") : t("titlePlaceholder")}
                autoComplete="off"
                onChange={(e) => set({ title: e.target.value })}
              />
            )}
          </Field>

          {!isBreak ? (
            <Field label={t("phase")} errors={text("phase")}>
              {(c) => (
                <Select
                  {...c}
                  name="phase"
                  value={v.phase}
                  onChange={(e) => set({ phase: e.target.value })}
                >
                  <option value="">{t("phaseNone")}</option>
                  {DRILL_PHASES.map((p) => (
                    <option key={p} value={p}>
                      {td(`phases.${p}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

          <div className={isBreak ? "grid gap-4" : "grid gap-4 sm:grid-cols-3"}>
            <Field label={t("duration")} errors={text("durationMin")}>
              {(c) => (
                <Input
                  {...c}
                  name="durationMin"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={PLAN_LIMITS.maxActivityMinutes}
                  value={v.durationMin}
                  onChange={(e) => set({ durationMin: e.target.value })}
                />
              )}
            </Field>
            {!isBreak ? (
              <>
                <Field label={t("players")} errors={text("players")}>
                  {(c) => (
                    <Input
                      {...c}
                      name="players"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={60}
                      value={v.players}
                      onChange={(e) => set({ players: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={t("repetitions")} errors={text("repetitions")}>
                  {(c) => (
                    <Input
                      {...c}
                      name="repetitions"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={99}
                      value={v.repetitions}
                      onChange={(e) => set({ repetitions: e.target.value })}
                    />
                  )}
                </Field>
              </>
            ) : null}
          </div>

          {isCustom ? (
            <>
              <Field label={t("description")} errors={text("content")}>
                {(c) => (
                  <Textarea
                    {...c}
                    name="description"
                    rows={3}
                    value={v.description}
                    onChange={(e) => set({ description: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t("instructions")} hint={t("perLine")}>
                {(c) => (
                  <Textarea
                    {...c}
                    name="instructions"
                    rows={3}
                    value={v.instructions}
                    onChange={(e) => set({ instructions: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t("coachingPoints")} hint={t("perLine")}>
                {(c) => (
                  <Textarea
                    {...c}
                    name="coachingPoints"
                    rows={3}
                    value={v.coachingPoints}
                    onChange={(e) => set({ coachingPoints: e.target.value })}
                  />
                )}
              </Field>
            </>
          ) : null}

          <Field label={t("notes")} errors={text("notes")}>
            {(c) => (
              <Textarea
                {...c}
                name="notes"
                rows={2}
                maxLength={2000}
                value={v.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            )}
          </Field>

          {failureText ? <FormError>{failureText}</FormError> : null}

          <div className="flex flex-wrap justify-end gap-3 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                {tc("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              {mode.kind === "edit" ? t("save") : t("add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
