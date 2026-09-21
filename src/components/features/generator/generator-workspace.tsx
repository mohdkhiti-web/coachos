"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lock, LockOpen, RefreshCw, Sparkles, TriangleAlert, CircleX } from "lucide-react";
import { FormError } from "@/components/features/auth/shared";
import { PhaseBadge } from "@/components/features/sessions/badges";
import { SessionFields, type SessionCatalog } from "@/components/features/sessions/session-fields";
import {
  fieldsFromServer,
  type FieldErrors,
  type SessionFormValues,
} from "@/components/features/sessions/session-model";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { DrillPhase } from "@/db/enums";
import {
  createGeneratedSessionAction,
  previewGenerationAction,
  reviseGenerationAction,
} from "@/modules/generator/actions";
import type { GenerationPreview } from "@/modules/generator/dto";
import type { Issue, Reason } from "@/modules/generator/types";
import {
  emptyOptions,
  itemsPayload,
  SESSION_TYPES,
  toExtras,
  toRequirements,
  validateRequest,
  type GeneratorOptions,
} from "./generator-model";

/**
 * "Generate session" (Step 8): tell CoachOS what the session is for and what you have, get a balanced timeline of REAL
 * library drills with the reasons for each, swap or keep any of them, and create a normal session that opens in the
 * Session Builder. No AI is involved; the same request always gives the same session.
 */
export function GeneratorWorkspace({
  sportKey,
  initial,
  catalog,
  showVisibility,
  cancelHref,
}: {
  sportKey: string;
  initial: SessionFormValues;
  catalog: SessionCatalog;
  showVisibility: boolean;
  cancelHref: string;
}) {
  const t = useTranslations("generator");
  const te = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState(initial);
  const [options, setOptions] = React.useState<GeneratorOptions>(emptyOptions);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<GenerationPreview | null>(null);
  const [variant, setVariant] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const [creating, startCreating] = React.useTransition();
  const previewRef = React.useRef<HTMLElement>(null);
  const [focusTick, setFocusTick] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  // after a new preview, move focus to it so keyboard and screen-reader users land on the result
  React.useEffect(() => {
    if (focusTick === 0) return;
    previewRef.current?.focus({ preventScroll: true });
    previewRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusTick]);

  const set = (patch: Partial<SessionFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setPreview(null); // what was built is for the old request
  };
  const setOption = (patch: Partial<GeneratorOptions>) => {
    setOptions((o) => ({ ...o, ...patch }));
    setPreview(null);
  };

  const failureText = (code: string | null) =>
    code === "VALIDATION"
      ? t("fixErrors")
      : code === "RATE_LIMITED"
        ? t("rateLimited")
        : code && te.has(code)
          ? te(code)
          : code
            ? te("generic")
            : null;

  function build(nextVariant: number, keep: string[]) {
    const local = validateRequest(values, options);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setFailure("VALIDATION");
      return;
    }
    setErrors({});
    setFailure(null);
    startTransition(async () => {
      const result = await previewGenerationAction(
        sportKey,
        toRequirements(values, options, { variant: nextVariant, mustInclude: keep }),
      );
      if (result.ok) {
        setVariant(nextVariant);
        setPreview(result.data);
        setAnnounce(
          t("preview.announce", {
            count: result.data.items.filter((i) => i.kind === "drill").length,
          }),
        );
        setFocusTick((n) => n + 1);
        return;
      }
      setErrors(fieldsFromServer(result.error.fields));
      setFailure(result.error.code);
    });
  }

  const locked = preview?.items.filter((i) => i.locked && i.drillId).map((i) => i.drillId!) ?? [];

  function swap(index: number, drillId: string) {
    if (!preview) return;
    const items = preview.items.map((i, at) =>
      at === index ? { ...i, drillId, locked: true } : i,
    );
    startTransition(async () => {
      const result = await reviseGenerationAction(
        sportKey,
        toRequirements(values, options, { variant }),
        itemsPayload(items),
      );
      if (result.ok) {
        setPreview(result.data);
        setAnnounce(t("preview.replaced"));
        return;
      }
      setFailure(result.error.code);
    });
  }

  function toggleLock(index: number) {
    setPreview((p) =>
      p
        ? { ...p, items: p.items.map((i, at) => (at === index ? { ...i, locked: !i.locked } : i)) }
        : p,
    );
  }

  function create() {
    if (!preview) return;
    setFailure(null);
    startCreating(async () => {
      const result = await createGeneratedSessionAction(sportKey, {
        requirements: toRequirements(values, options, { variant }),
        items: itemsPayload(preview.items),
        extras: toExtras(values),
      });
      if (result.ok) {
        toast(t("created.toast"), "success");
        router.push(`/sessions/${sportKey}/${result.data.id}`);
        return;
      }
      setErrors(fieldsFromServer(result.error.fields));
      setFailure(result.error.code);
    });
  }

  const busy = pending || creating;

  return (
    <div className="space-y-8">
      <form
        noValidate
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          build(0, []);
        }}
      >
        <Card>
          <CardBody className="space-y-8">
            <SessionFields
              values={values}
              onChange={set}
              errors={errors}
              catalog={catalog}
              showVisibility={showVisibility}
              disabled={busy}
            />
            <OptionsFields options={options} onChange={setOption} disabled={busy} />
          </CardBody>
          <CardFooter className="justify-between">
            <div className="min-w-0 flex-1">
              {failure && !preview ? <FormError>{failureText(failure)}</FormError> : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="ghost">
                <Link href={cancelHref}>{t("cancel")}</Link>
              </Button>
              <Button type="submit" size="lg" loading={pending && !preview}>
                <Sparkles className="size-5" aria-hidden />
                {t("generate")}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {preview ? (
        <PreviewPanel
          ref={previewRef}
          sportKey={sportKey}
          preview={preview}
          busy={busy}
          creating={creating}
          failure={failure ? failureText(failure) : null}
          onSwap={swap}
          onToggleLock={toggleLock}
          onAnother={() => build(variant + 1, locked)}
          onCreate={create}
        />
      ) : null}
    </div>
  );
}

// ---- the extra options ---------------------------------------------------------------------------------------------

function OptionsFields({
  options,
  onChange,
  disabled,
}: {
  options: GeneratorOptions;
  onChange: (patch: Partial<GeneratorOptions>) => void;
  disabled: boolean;
}) {
  const to = useTranslations("generator.options");
  const ti = useTranslations("drills.intensities");
  const number = (
    key: "baskets" | "basketball" | "cones" | "bibs",
    label: string,
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      {(c) => (
        <Input
          {...c}
          name={key}
          inputMode="numeric"
          value={options[key]}
          disabled={disabled}
          placeholder={to("notCounted")}
          maxLength={3}
          onChange={(e) => onChange({ [key]: e.target.value.replace(/[^\d]/g, "") })}
        />
      )}
    </Field>
  );
  return (
    <section aria-labelledby="gen-options" className="space-y-4 border-t border-line pt-6">
      <div className="space-y-1">
        <h3 id="gen-options" className="eyebrow">
          {to("heading")}
        </h3>
        <p className="text-sm text-ink-muted">{to("intro")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {number("baskets", to("baskets"), to("basketsHint"))}
        {number("basketball", to("basketball"))}
        {number("cones", to("cones"))}
        {number("bibs", to("bibs"))}
        <Field label={to("space")}>
          {(c) => (
            <Select
              {...c}
              value={options.space}
              disabled={disabled}
              onChange={(e) => onChange({ space: e.target.value as GeneratorOptions["space"] })}
            >
              <option value="any">{to("spaceAny")}</option>
              <option value="half">{to("spaceHalf")}</option>
              <option value="full">{to("spaceFull")}</option>
            </Select>
          )}
        </Field>
        <Field label={to("intensity")}>
          {(c) => (
            <Select
              {...c}
              value={options.intensity}
              disabled={disabled}
              onChange={(e) =>
                onChange({ intensity: e.target.value as GeneratorOptions["intensity"] })
              }
            >
              <option value="">{to("intensityBalanced")}</option>
              {(["low", "medium", "high"] as const).map((k) => (
                <option key={k} value={k}>
                  {ti(k)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={to("sessionType")} className="sm:col-span-2">
          {(c) => (
            <Select
              {...c}
              value={options.sessionType}
              disabled={disabled}
              onChange={(e) =>
                onChange({ sessionType: e.target.value as GeneratorOptions["sessionType"] })
              }
            >
              {SESSION_TYPES.map((k) => (
                <option key={k} value={k}>
                  {to(`types.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </section>
  );
}

// ---- the preview ---------------------------------------------------------------------------------------------------

const PreviewPanel = React.forwardRef<
  HTMLElement,
  {
    sportKey: string;
    preview: GenerationPreview;
    busy: boolean;
    creating: boolean;
    failure: string | null;
    onSwap: (index: number, drillId: string) => void;
    onToggleLock: (index: number) => void;
    onAnother: () => void;
    onCreate: () => void;
  }
>(function PreviewPanel(
  { sportKey, preview, busy, creating, failure, onSwap, onToggleLock, onAnother, onCreate },
  ref,
) {
  const t = useTranslations("generator");
  const tp = useTranslations("drills.phases");
  const drillCount = preview.items.filter((i) => i.kind === "drill").length;
  const total = preview.items.reduce((n, i) => n + i.durationMin, 0);
  const errors = preview.validation.issues.filter((i) => i.severity === "error");
  const warnings = preview.validation.issues.filter((i) => i.severity === "warning");
  // where each activity starts: a running total, computed up front (nothing is reassigned while rendering)
  const starts = preview.items.map((_, i) =>
    preview.items.slice(0, i).reduce((n, x) => n + x.durationMin, 0),
  );

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="gen-preview-heading"
      className="space-y-5 rounded-lg outline-none"
    >
      <header className="space-y-1">
        <h2 id="gen-preview-heading" className="display text-3xl text-ink md:text-4xl">
          {t("preview.heading")}
        </h2>
        <p className="text-base text-ink-muted">
          {t("preview.summary", { count: drillCount, minutes: total })}{" "}
          {t("preview.considered", {
            eligible: preview.considered.eligible,
            total: preview.considered.total,
          })}
        </p>
      </header>

      {errors.length > 0 ? (
        <IssueList issues={errors} tone="error" heading={t("issues.errorsHeading")} />
      ) : null}
      {warnings.length > 0 ? (
        <IssueList issues={warnings} tone="warning" heading={t("issues.warningsHeading")} />
      ) : null}

      <Card>
        <CardBody className="p-0">
          <ol aria-label={t("preview.timeline")} className="divide-y divide-line">
            {preview.items.map((item, index) => {
              const start = starts[index] ?? 0;
              const drill = item.drillId ? preview.drills[item.drillId] : undefined;
              return (
                <li key={`${index}-${item.drillId ?? "break"}`} className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <PhaseBadge
                          phase={(item.phase ?? "break") as DrillPhase | "break"}
                          label={item.phase ? tp(item.phase) : t("preview.break")}
                        />
                        <span className="numeral text-sm text-ink-muted">
                          {t("preview.range", { from: start, to: start + item.durationMin })}
                        </span>
                        {item.locked ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                            <Lock className="size-3.5" aria-hidden />
                            {t("preview.kept")}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-lg font-semibold text-ink">
                        {item.kind === "break" ? (
                          t("preview.breakTitle")
                        ) : (
                          <Link
                            href={`/sports/${sportKey}/drills/${item.drillId}`}
                            target="_blank"
                            rel="noopener"
                            className="hover:underline focus-visible:underline"
                          >
                            {item.title}
                            <span className="sr-only"> {t("preview.opensNewTab")}</span>
                          </Link>
                        )}
                      </h3>
                      {drill ? (
                        <p className="text-sm text-ink-muted">
                          {t("preview.facts", {
                            min: drill.durationMin,
                            max: drill.durationMax,
                            players: `${drill.playersMin}–${drill.playersMax}`,
                          })}
                          {item.groups > 1
                            ? ` ${t("preview.groups", { groups: item.groups })}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    <p
                      className="numeral text-2xl text-ink"
                      aria-label={t("preview.minutes", { minutes: item.durationMin })}
                    >
                      {item.durationMin}
                      <span className="ml-1 text-sm text-ink-muted" aria-hidden>
                        {t("preview.min")}
                      </span>
                    </p>
                  </div>

                  {item.kind === "drill" ? (
                    <>
                      <ul aria-label={t("preview.why")} className="flex flex-wrap gap-1.5">
                        {item.reasons.map((r, at) => (
                          <li
                            key={at}
                            className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-muted"
                          >
                            <ReasonText reason={r} />
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-end gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-pressed={item.locked}
                          disabled={busy}
                          onClick={() => onToggleLock(index)}
                        >
                          {item.locked ? (
                            <LockOpen className="size-4" aria-hidden />
                          ) : (
                            <Lock className="size-4" aria-hidden />
                          )}
                          {item.locked ? t("preview.unkeep") : t("preview.keep")}
                        </Button>
                        {item.alternatives.length > 0 ? (
                          <Field label={t("preview.replaceWith")} className="max-w-full min-w-52">
                            {(c) => (
                              <Select
                                {...c}
                                className="h-9 text-sm"
                                value=""
                                disabled={busy}
                                onChange={(e) => e.target.value && onSwap(index, e.target.value)}
                              >
                                <option value="">{t("preview.chooseAlternative")}</option>
                                {item.alternatives.map((a) => (
                                  <option key={a.drillId} value={a.drillId}>
                                    {a.title}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </Field>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </CardBody>
        <CardFooter className="flex-wrap justify-between gap-3">
          <EquipmentSummary equipment={preview.equipment} />
        </CardFooter>
      </Card>

      {failure ? <FormError>{failure}</FormError> : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="secondary" disabled={busy} onClick={onAnother}>
          <RefreshCw className="size-4" aria-hidden />
          {t("preview.another")}
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={busy || !preview.validation.ok}
          loading={creating}
          onClick={onCreate}
        >
          {t("preview.create")}
        </Button>
      </div>
      {!preview.validation.ok ? (
        <p className="text-right text-sm text-ink-muted">{t("preview.cannotCreate")}</p>
      ) : null}
    </section>
  );
});

function ReasonText({ reason }: { reason: Reason }) {
  const tr = useTranslations("generator.reasons");
  const tp = useTranslations("drills.phases");
  const tl = useTranslations("drills.levels");
  const ti = useTranslations("drills.intensities");
  const v = reason.values ?? {};
  switch (reason.code) {
    case "phase_fit":
      return <>{tr("phase_fit", { phase: tp(String(v.phase) as DrillPhase) })}</>;
    case "level_fit":
      return <>{tr("level_fit", { level: tl(String(v.level) as "beginner") })}</>;
    case "intensity_fit":
      return <>{tr("intensity_fit", { intensity: ti(String(v.intensity) as "low") })}</>;
    default:
      return <>{tr(reason.code, v)}</>;
  }
}

function IssueList({
  issues,
  tone,
  heading,
}: {
  issues: Issue[];
  tone: "error" | "warning";
  heading: string;
}) {
  const tis = useTranslations("generator.issues");
  const tp = useTranslations("drills.phases");
  const Icon = tone === "error" ? CircleX : TriangleAlert;
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={
        tone === "error"
          ? "rounded-lg border border-danger bg-danger-soft p-4"
          : "rounded-lg border border-line-strong bg-surface-sunken p-4"
      }
    >
      <p className="flex items-center gap-2 font-semibold text-ink">
        <Icon className="size-5" aria-hidden />
        {heading}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-ink">
        {issues.map((issue, at) => (
          <li key={at}>
            {tis(issue.code, {
              ...issue.values,
              ...(issue.values?.phase
                ? { phase: tp(String(issue.values.phase) as DrillPhase) }
                : {}),
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EquipmentSummary({ equipment }: { equipment: Record<string, number> }) {
  const tq = useTranslations("generator.equipment");
  const entries = Object.entries(equipment).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <p className="text-sm text-ink-muted">{tq("none")}</p>;
  return (
    <div className="space-y-1">
      <p className="eyebrow">{tq("heading")}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
        {entries.map(([key, n]) => (
          <li key={key}>
            <span className="numeral font-semibold">{n}</span>{" "}
            {tq.has(`items.${key}`) ? tq(`items.${key}`) : key}
          </li>
        ))}
      </ul>
    </div>
  );
}
