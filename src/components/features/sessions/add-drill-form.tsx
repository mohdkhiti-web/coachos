"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormError } from "@/components/features/auth/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DRILL_PHASES } from "@/db/enums";
import { addDrillActivityAction, replaceActivityDrillAction } from "@/modules/plans/actions";
import { addDrillActivitySchema } from "@/modules/plans/validators";
import { fieldsFromServer, type FieldErrors } from "./session-model";

type Mode = { kind: "add" } | { kind: "replace"; activityId: string };

const num = (s: string): number | string | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
};

/**
 * "Add to session" (or "Replace this drill"): the last step before a drill enters the timeline. Duration and
 * players start from the drill's own suggestions, and the coach can change them, add repetitions and notes. The
 * library drill is only ever READ: the session gets its own copy, and nothing here can edit the original.
 */
export function AddDrillForm({
  sportKey,
  planId,
  version,
  drillId,
  mode,
  defaults,
  builderHref,
  cancelHref,
}: {
  sportKey: string;
  planId: string;
  /** The session's version as this page loaded it. */
  version: number;
  drillId: string;
  mode: Mode;
  defaults: { durationMin: number; players: number | null; phase: string };
  builderHref: string;
  cancelHref: string;
}) {
  const t = useTranslations("sessions.addDrill");
  const td = useTranslations("drills");
  const tv = useTranslations("validation");
  const te = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = React.useState({
    durationMin: String(defaults.durationMin),
    players: defaults.players === null ? "" : String(defaults.players),
    repetitions: "",
    phase: defaults.phase,
    notes: "",
    reason: "",
  });
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set = (patch: Partial<typeof v>) => setV((p) => ({ ...p, ...patch }));
  const text = (path: string) => {
    const list = (errors[path] ?? []).map((k) => (tv.has(k) ? tv(k) : tv("invalid")));
    return list.length ? list : undefined;
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFailure(null);
    if (mode.kind === "add") {
      const body = {
        durationMin: num(v.durationMin) ?? "",
        players: num(v.players),
        repetitions: num(v.repetitions),
        phase: v.phase === "" ? null : v.phase,
        notes: v.notes,
      };
      const parsed = addDrillActivitySchema
        .omit({ drillId: true, version: true, position: true })
        .safeParse(body);
      if (!parsed.success) {
        const local: FieldErrors = {};
        for (const i of parsed.error.issues) (local[String(i.path[0])] ??= []).push(i.message);
        setErrors(local);
        setFailure("VALIDATION");
        return;
      }
      setErrors({});
      startTransition(async () => {
        const r = await addDrillActivityAction(sportKey, planId, {
          ...parsed.data,
          drillId,
          version,
        });
        if (r?.ok) {
          toast(t("added"), "success");
          router.push(`${builderHref}#activity-${r.data.id}`);
          return;
        }
        setErrors(fieldsFromServer(r && !r.ok ? r.error.fields : undefined));
        setFailure(r && !r.ok ? r.error.code : "INTERNAL");
      });
      return;
    }
    if (v.reason.length > 300) {
      setErrors({ changeReason: ["too_long"] });
      setFailure("VALIDATION");
      return;
    }
    setErrors({});
    startTransition(async () => {
      const r = await replaceActivityDrillAction(sportKey, planId, mode.activityId, {
        drillId,
        version,
        changeReason: v.reason.trim() || undefined,
      });
      if (r?.ok) {
        toast(t("replaced"), "success");
        router.push(`${builderHref}#activity-${mode.activityId}`);
        return;
      }
      setFailure(r && !r.ok ? r.error.code : "INTERNAL");
    });
  }

  const failureText =
    failure === "VALIDATION"
      ? t("fixErrors")
      : failure === "CONFLICT"
        ? t("conflict")
        : failure === "NOT_FOUND"
          ? t("notFound")
          : failure
            ? te.has(failure)
              ? te(failure)
              : te("generic")
            : null;

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-busy={pending}
      aria-labelledby="add-drill-heading"
      className="space-y-5 rounded-lg border border-line bg-surface-raised p-5 shadow-paper"
    >
      <div className="space-y-1">
        <h2 id="add-drill-heading" className="text-lg font-semibold tracking-tight text-ink">
          {mode.kind === "add" ? t("formTitle") : t("replaceTitle")}
        </h2>
        <p className="text-sm text-ink-muted">
          {mode.kind === "add" ? t("formHint") : t("replaceHint")}
        </p>
      </div>

      {mode.kind === "add" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("duration")} errors={text("durationMin")}>
              {(c) => (
                <Input
                  {...c}
                  name="durationMin"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={240}
                  value={v.durationMin}
                  onChange={(e) => set({ durationMin: e.target.value })}
                />
              )}
            </Field>
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
          </div>
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
          <Field label={t("notes")} errors={text("notes")}>
            {(c) => (
              <Textarea
                {...c}
                name="notes"
                rows={3}
                maxLength={2000}
                value={v.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            )}
          </Field>
        </>
      ) : (
        <Field label={t("reason")} errors={text("changeReason")} hint={t("reasonHint")}>
          {(c) => (
            <Textarea
              {...c}
              name="reason"
              rows={2}
              maxLength={300}
              value={v.reason}
              onChange={(e) => set({ reason: e.target.value })}
            />
          )}
        </Field>
      )}

      {failureText ? <FormError>{failureText}</FormError> : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button asChild variant="ghost">
          <Link href={cancelHref}>{t("cancel")}</Link>
        </Button>
        <Button type="submit" size="lg" loading={pending}>
          {mode.kind === "add" ? t("submit") : t("replaceSubmit")}
        </Button>
      </div>
    </form>
  );
}
